import { app, Notification } from 'electron'
import type { Overview } from '../shared/types.ts'
import type { LocalMedia } from '../shared/contents.ts'
import { checkPost, jobPrompt, platformOf, type JobPost } from '../shared/platforms.ts'
import { batchesOf, canEnterSubWorkflow, dueSlot, evaluateCondition, interpolate, isPublish, MAX_LOOP_BATCHES, nextOf, NO_CONTENT, runWalk, skipReason, splitByMedia, triggersIn, type ConditionCheck, type ExprEnv, type Graph, type GraphNode, type RunStep, type Trigger, type WalkOut } from '../shared/workflow.ts'
import { agentBrowser, connectionsState, localAccounts, openForJob, relogin, sessionProblem, syncAccounts, type LocalAccount } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { refresh, server, ServerError } from './auth.ts'
import { contentFiles, contentsRel, finishContent, generateContents, listContents, setContentStatus, takeContent } from './contents.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/**
 * **Akışları bu uygulama çalıştırır.** Sunucuda yalnız akışın tanımı (denetim) ve çalışma kaydı durur; zamanı
 * gelen akışı bu cihaz yürütür: grafı yürür (`shared/workflow.ts` `runWalk`), içeriği kendi klasöründen alır, her
 * hesaptaki işi agent hesabın tarayıcısında yapar ve çalışmayı adım adım sunucuya yazar. Her hesap işi bir **sohbet
 * sürecidir** (`Agent.task`): başladığı anda sohbet ekranı açılır, çalışma geçmişi o sohbete bağlanır.
 *
 * Zamanlama: her yoklamada, son bakıştan bu yana saati gelen yuva çalışır (`dueSlot`). Uygulama kapalıyken kaçan
 * yuvalar dönüşte **bir kez** telafi edilir; aynı yuvayı sunucu ikinci kez açtırmaz (başka cihaz, yeniden başlatma).
 */

type Flow = Overview['workflows'][number]
/** Akışta akan öğe: cihazdaki bir içerik klasörü. `postId`: sunucudaki paylaşım kaydı (ilk hesaptan sonra). */
type Item = { folder: string; caption: string; firstComment: string; media: LocalMedia[]; generated: boolean; postId?: string }
type Out = WalkOut<Item>
export type RunOutcome = { status: 'success' | 'failed' | 'skipped' | 'duplicate'; error: string | null }

const MAX_SUB_WORKFLOW_DEPTH = 2

type Deps = {
  agent: Agent
  /** Agent işlerinin tek sırası: aynı anda iki agent birbirinin sayfasını bozmasın. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>
  log: (text: string, tone: 'info' | 'ok' | 'error', chatId?: string) => void
  showApp: () => void
  /** İş başlayınca sohbet ekranını o sohbette açar. */
  openChat: (chatId: string) => void
}
let deps: Deps
export const initRunner = (d: Deps) => void (deps = d)

const tr = () => app.getLocale().toLowerCase().startsWith('tr')
const notify = (body: string, onClick?: () => void) => {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: 'Share97', body: body.slice(0, 250) })
  n.on('click', onClick ?? deps.showApp)
  n.show()
}

/** Bir çalışmanın durumu. Döngü ve alt akış gövdeleri aynı kaydı paylaşır (`parent` ile). */
type Run = {
  id: string
  flow: Flow
  graph: Graph
  steps: RunStep[]
  /** Gövdelerle (döngü, alt akış) paylaşılan sayaç: `done` bir hesapta yapılan iş sayısı. Yayın ücretsiz. */
  tally: { done: number }
  chatIds: string[]
  /** Hesap → bu çalışmadaki sohbeti: aynı hesabın sonraki adımları (sohbet mesajı düğümleri) aynı sohbete yazılıyor. */
  chats: Map<string, string>
  /** Alınan içerik klasörleri → bir hesabın sonucu `status.txt`e yazıldı mı. Yazılmayan çalışma bitince `pending`e döner. */
  taken: Map<string, boolean>
  parent?: string
  subDepth: number
  visited: Set<string>
}

const save = (r: Run, extra: Record<string, unknown> = {}) =>
  server(`/api/v1/worker/runs/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: { steps: r.steps.slice(-200), ...extra } }).catch((e) => console.error('[runner]', (e as Error).message))

const recorder = (r: Run) => async (s: RunStep) => {
  r.steps.push(r.parent ? { ...s, parent: r.parent } : s)
  await save(r)
}

const describe = (items: Item[]) => ({ count: items.length, items: items.map((i) => ({ caption: i.caption, mediaCount: i.media.length, firstComment: i.firstComment || null })) })

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Bir öğeden türetilen düz değerler: koşulun ifadesi ve `{{ }}` şablonları bunları okur. Saat ve gün akışın saat diliminde. */
function envOf(item: Item | null, timezone: string): ExprEnv {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date())
  return {
    hasPost: Boolean(item),
    hasMedia: Boolean(item?.media.length),
    isVideo: item?.media[0]?.kind === 'video',
    caption: item?.caption ?? '',
    captionLength: item?.caption.length ?? 0,
    mediaCount: item?.media.length ?? 0,
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
    weekday: WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? ''),
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Etiketleri açıklamanın sonuna ekler; açıklamada zaten olan eklenmez. */
function appendHashtags(caption: string, tags: string[]) {
  const have = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))
  const add = [...new Set(tags.map((t) => `#${t.replace(/^#+/, '')}`).filter((t) => t.length > 1 && !have.has(t.toLowerCase())))]
  return add.length ? `${caption.trimEnd()}\n\n${add.join(' ')}` : caption
}

/** Hesabın tarayıcısına erişilemedi: kullanıcı uyarılır, oturum düşmüşse sunucuya bildirilir ve bildirime tıklayınca giriş ekranı açılır. */
function warnAccess(account: LocalAccount, problem: { expired: boolean; error: string }) {
  if (problem.expired) void server('/api/v1/worker/poll', { body: { accountIds: [], expired: [{ id: account.id, error: problem.error }] } }).then(syncAccounts, () => {})
  notify(problem.expired ? (tr() ? `@${account.handle}: oturum düşmüş, akış bu hesapta çalışamadı. Yeniden giriş yapmak için tıkla.` : `@${account.handle}: the session ended and the workflow could not run on this account. Click to sign in again.`) : problem.error, () => {
    deps.showApp()
    if (problem.expired) void relogin(account.id)
  })
}

/**
 * **Bir hesapta bir iş**: paylaşım (`item`) ya da görev (`instruction`). Agent hesabın bağlantıda tanımlı tarayıcısında
 * çalışır (ona kilitli); iş bir sohbet süreci olarak açılır ve sohbet ekranında görünür. Sonuç içeriğin `status.txt`ine
 * ve sunucudaki kayda yazılır. Düşen iş fırlatır: akışın hata kolu varsa oradan sürer.
 */
async function work(r: Run, accountId: string, item: Item | null, o: { instruction?: string; firstComment?: string; type?: string }): Promise<string> {
  const account = localAccounts().find((l) => l.id === accountId)
  const known = connectionsState().accounts.find((a) => a.id === accountId)
  if (!account) throw new Error(known ? `@${known.handle} is not signed in on this device: add the account in Share97 Desktop on this computer` : 'the account of this step was removed')
  const post: JobPost = {
    type: o.type && o.type !== 'auto' ? o.type : item?.media.length === 1 && item.media[0].kind === 'video' ? 'reel' : 'feed',
    caption: item?.caption,
    media: item?.media.map((m) => ({ url: `local:${item.folder}/${m.file}`, kind: m.kind })),
    firstComment: o.firstComment || item?.firstComment || undefined,
    instruction: o.instruction,
    local: item ? { workflowId: r.flow.id, folder: item.folder } : undefined,
  }
  const result = async (ok: boolean, detail: string) => {
    if (!item) return
    r.taken.set(item.folder, true)
    await finishContent(r.flow.id, item.folder, account.handle, ok, detail)
  }
  const invalid = checkPost(account.platform, post)
  if (invalid) {
    await result(false, invalid)
    throw new Error(`@${account.handle}: ${invalid}`)
  }
  const problem = await sessionProblem(account)
  if (problem) {
    warnAccess(account, problem)
    await result(false, problem.error)
    throw new Error(problem.error)
  }
  const browserId = agentBrowser(account)!
  const label = platformOf(account.platform)?.label ?? account.platform
  const files = item ? contentFiles(r.flow.id, item.folder, (post.media ?? []).map((m) => m.url)) : []
  const prompt = jobPrompt({ platform: account.platform, handle: account.handle, browserId, post, files, folder: item ? contentsRel(r.flow.id, item.folder) : undefined })
  // Hata çift paylaşım riski taşır: iş bir kez denenir, sonucu ne olursa olsun kayda geçer.
  const out = await deps
    .exclusive(() => {
      openForJob(account)
      const earlier = r.chats.get(accountId)
      return deps.agent.task(
        `${r.flow.name} · @${account.handle} (${label})`,
        prompt,
        null,
        browserId,
        (chatId) => {
          r.chats.set(accountId, chatId)
          if (chatId === earlier) return
          r.chatIds.push(chatId)
          deps.log(`${r.flow.name} · @${account.handle}: ${tr() ? 'başladı' : 'started'}`, 'info', chatId)
          deps.openChat(chatId)
        },
        earlier,
      )
    })
    .catch((e) => ({ ok: false, summary: `may be partly done, check the account before retrying: ${(e as Error).message.slice(0, 400)}`, permalink: undefined, expired: false }))
  await result(out.ok, out.ok ? (out.permalink ?? '') : out.summary)
  if (!out.ok) {
    if (out.expired) warnAccess(account, { expired: true, error: out.summary })
    throw new Error(`@${account.handle}: ${out.summary}`)
  }
  r.tally.done++
  const saved = await server<{ postId: string | null }>(`/api/v1/worker/runs/${encodeURIComponent(r.id)}/publications`, {
    body: { accountId, permalink: out.permalink?.slice(0, 500), postId: item?.postId, post: item ? { caption: item.caption, folder: item.folder, aiGenerated: item.generated, media: item.media } : undefined },
  }).catch((e) => (console.error('[runner]', (e as Error).message), null))
  if (item && saved?.postId) item.postId = saved.postId
  return out.permalink || out.summary || 'done'
}

async function execute(r: Run, node: GraphNode, items: Item[]): Promise<Out> {
  const d = node.data
  const tz = r.flow.timezone
  if (isPublish(node.type)) {
    if (!items.length) return { status: 'skip', detail: 'no items' }
    const details: string[] = []
    for (const item of items) {
      const env = envOf(item, tz)
      details.push(await work(r, str(d.accountId), item, { type: str(d.postType), firstComment: str(d.firstComment) && interpolate(str(d.firstComment), env), instruction: str(d.agentPrompt).trim() ? interpolate(str(d.agentPrompt), env) : undefined }))
    }
    return { status: 'ok', detail: details.join(', ') }
  }
  switch (node.type) {
    case 'trigger':
    case 'merge':
      return { status: 'ok' }

    case 'agent': {
      // Yapay zekâ agent'ı: talimatı hesabın tarayıcısında yapar. İçerik geldiyse ilk öğenin metni ve dosyaları göreve eklenir.
      const prompt = str(d.prompt).trim()
      if (!prompt) throw new Error('agent: the instruction is empty: write what the agent should do')
      const item = items[0] ?? null
      return { status: 'ok', detail: await work(r, str(d.accountId), item, { instruction: interpolate(prompt, envOf(item, tz)) }) }
    }

    case 'queue': {
      if (items.length) return { status: 'skip', detail: 'already has items' }
      const c = await takeContent(r.flow.id, r.flow.content)
      if (!c) {
        notify(tr() ? `"${r.flow.name}": paylaşacak içerik kalmadı. Klasöre yeni içerik ekle ya da uygulamada üret.` : `"${r.flow.name}" has no content left to share. Add content to its folder or generate some in the app.`)
        return { status: 'skip', detail: NO_CONTENT }
      }
      r.taken.set(c.folder, false)
      return { status: 'ok', detail: `${c.folder}: ${c.caption.slice(0, 70)}`, items: [{ ...c, firstComment: '', generated: false }] }
    }

    case 'generate': {
      if (d.onlyWhenEmpty === true && items.length) return { status: 'skip', detail: 'queue had items' }
      if (!str(d.topic).trim()) throw new Error('generate: topic is empty')
      // Üretilen paylaşım akışın klasörüne yeni bir içerik olarak yazılır (metin + istenirse görsel), sonra paylaşılır.
      const [folder] = await generateContents(r.flow.id, r.flow.name, { from: null, topic: interpolate(str(d.topic), envOf(items[0] ?? null, tz)), count: 1, withImage: d.withImage !== false })
      const c = (await listContents(r.flow.id)).find((i) => i.folder === folder)
      if (!c) throw new Error('generate: the model returned no usable post')
      await setContentStatus(r.flow.id, folder, 'publishing')
      r.taken.set(folder, false)
      return { status: 'ok', detail: c.caption.slice(0, 80), items: [{ folder, caption: c.caption, media: c.media, firstComment: '', generated: true }] }
    }

    case 'hashtags':
      if (!items.length) return { status: 'skip', detail: 'no items' }
      return { status: 'ok', items: items.map((i) => ({ ...i, caption: appendHashtags(i.caption, interpolate(str(d.tags), envOf(i, tz)).split(/[\s,]+/).filter(Boolean)) })) }

    case 'transform': {
      if (!items.length) return { status: 'skip', detail: 'no items' }
      const next = items.map((i) => {
        const env = envOf(i, tz)
        return { ...i, caption: str(d.caption).trim() ? interpolate(str(d.caption), env) : i.caption, firstComment: str(d.firstComment).trim() ? interpolate(str(d.firstComment), env) : i.firstComment }
      })
      return { status: 'ok', detail: next[0]?.caption.slice(0, 80), items: next }
    }

    case 'condition': {
      // Her öğe kendi başına değerlendirilir; öğe yoksa koşul yalnız kayda geçer.
      const yes: Item[] = []
      const no: Item[] = []
      for (const item of items) (evaluateCondition(str(d.check) as ConditionCheck, str(d.expr), envOf(item, tz)) ? yes : no).push(item)
      return { status: 'ok', detail: `${yes.length} yes / ${no.length} no`, routes: [{ handle: 'yes', items: yes }, { handle: 'no', items: no }] }
    }

    case 'split':
      return { status: 'ok', detail: `${items.length} → ${splitByMedia(items).length} item(s)`, items: splitByMedia(items) }

    case 'subWorkflow': {
      const id = str(d.workflowId)
      if (!id) return { status: 'skip', detail: 'no workflow selected' }
      if (!canEnterSubWorkflow(r.visited, r.subDepth, id, MAX_SUB_WORKFLOW_DEPTH)) throw new Error(r.subDepth >= MAX_SUB_WORKFLOW_DEPTH ? 'sub-workflow: max nesting depth reached' : 'sub-workflow: circular reference')
      const sub = connectionsState().overview?.workflows.find((w) => w.id === id)
      if (!sub) throw new Error('sub-workflow: not found')
      const body: Run = { ...r, graph: sub.graph, parent: node.id, subDepth: r.subDepth + 1, visited: new Set([...r.visited, id]) }
      const result = await runWalk<Item>(sub.graph, triggersIn(sub.graph).map((t) => ({ id: t.id, items })), (n, it) => execute(body, n, it), [], describe, recorder(body))
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error))
      return { status: 'ok', detail: `sub-workflow: ${result.lastItems.length} item(s)`, items: result.lastItems }
    }

    case 'loop': {
      // Geri kenar yok: `loop` kolunun ileri yönlü alt-grafı her parça için baştan yürünür; `done` giren grupla sürer.
      const kids = nextOf(r.graph, node.id, 'loop')
      if (!items.length || !kids.length) return { status: 'ok', routes: [{ handle: 'done', items }] }
      const batches = batchesOf(items, Number(d.batchSize) || 1)
      if (batches.length > MAX_LOOP_BATCHES) throw new Error(`loop: too many batches (${batches.length} > ${MAX_LOOP_BATCHES})`)
      const body: Run = { ...r, parent: node.id }
      for (const batch of batches) {
        const result = await runWalk<Item>(r.graph, kids.map((id) => ({ id, items: batch })), (n, it) => execute(body, n, it), [], describe, recorder(body))
        if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error))
      }
      return { status: 'ok', detail: `${batches.length} batch(es)`, routes: [{ handle: 'done', items }] }
    }

    case 'delay': {
      // ponytail: bekleme süreçte tutulur; uygulama beklerken kapanırsa çalışma yarım kalır (sunucu sonraki çalışmada `failed` kapatır).
      const minutes = Math.min(24 * 60, Math.max(1, Number(d.minutes) || 15))
      await new Promise((resolve) => setTimeout(resolve, minutes * 60_000))
      return { status: 'ok', detail: `${minutes} min` }
    }
  }
  return { status: 'skip', detail: `unknown step: ${node.type}` }
}

/** Şu an çalışan akışlar: aynı akış üst üste çalışmaz (aynı içerik iki kez alınmasın). */
const running = new Set<string>()
export const runnerBusy = () => running.size > 0

/**
 * Akışı çalıştırır. `trigger` boşsa (elle "Şimdi çalıştır") bütün tetikleyicilerinden başlar. Sunucu aynı yuvayı
 * ikinci kez açtırmaz (`duplicate`). Dönüş: çalışmanın sonucu; atlandıysa **nedeni** (`error`).
 */
export async function runFlow(flow: Flow, slot: number, trigger: string): Promise<RunOutcome> {
  if (running.has(flow.id)) return { status: 'failed', error: 'this workflow is already running' }
  running.add(flow.id)
  try {
    let open: { id: string }
    try {
      open = await server('/api/v1/worker/runs', { body: { workflowId: flow.id, slot, trigger } })
    } catch (e) {
      if (e instanceof ServerError && e.status === 409) return { status: 'duplicate', error: null }
      throw e
    }
    const r: Run = { id: open.id, flow, graph: flow.graph, steps: [], tally: { done: 0 }, chatIds: [], chats: new Map(), taken: new Map(), subDepth: 0, visited: new Set([flow.id]) }
    const starts = triggersIn(flow.graph).filter((t) => !trigger || t.id === trigger)
    const result = await runWalk<Item>(flow.graph, starts.map((t) => ({ id: t.id, items: [] })), (n, it) => execute(r, n, it), [], describe, recorder(r))
    const status = result.failure ? 'failed' : r.tally.done ? 'success' : 'skipped'
    const error = result.failure ?? (status === 'skipped' ? skipReason(flow.graph, r.steps) : null)
    // Hiçbir hesaba ulaşmayan içerik yanmaz: yeniden sıraya döner, nedeni notunda.
    for (const [folder, touched] of r.taken) if (!touched) await setContentStatus(flow.id, folder, 'pending', `not shared: ${(error ?? 'the run ended before an account step').slice(0, 300)}`).catch(() => {})
    // Çalışmanın sohbet süreçleri kayda: geçmiş bu sohbetlere bağlanır.
    if (r.steps[0]) r.steps[0] = { ...r.steps[0], output: { ...r.steps[0].output, chatIds: r.chatIds } }
    await save(r, { status, error: error?.slice(0, 2000) })
    const text = status === 'success' ? (tr() ? 'tamamlandı' : 'done') : status === 'failed' ? error! : `${tr() ? 'atlandı' : 'skipped'}: ${error}`
    deps.log(`${flow.name}: ${text}`, status === 'success' ? 'ok' : status === 'failed' ? 'error' : 'info', r.chatIds.at(-1))
    notify(`${flow.name}: ${text}`)
    return { status, error }
  } finally {
    running.delete(flow.id)
    void refresh()
    void syncAccounts()
  }
}

const minute = (at: number) => Math.round(at / 60_000) * 60_000
const mine = () => {
  const ov = connectionsState().overview
  return ov ? ov.workflows.filter((w) => w.workerId === ov.me) : []
}

/** Elle "Şimdi çalıştır" (ekran, sohbetteki agent ya da siteden gelen istek). Akış bu cihaza atanmış olmalı; açık olması gerekmez. */
export async function runNow(id: string): Promise<RunOutcome> {
  const flow = mine().find((w) => w.id === id)
  if (!flow) throw new Error('This workflow is not assigned to this computer. Choose this device for it first.')
  return runFlow(flow, minute(Date.now()), '')
}

const file = () => dataPath('runner.json')

/**
 * Zamanlayıcının bir adımı (her yoklamada): bu cihaza atanmış, açık her akışın son bakıştan bu yana saati gelen
 * yuvası çalışmaya başlar. İlk açılışta geçmiş yuva çalışmaz. Çalışmalar beklenmez; agent işleri tek sırada koşar.
 */
export function schedule(now = Date.now()) {
  // Akışlar henüz okunamadıysa (ağ yok) bakış ilerlemez: kaçan yuva eşitlenince telafi edilir.
  if (!connectionsState().overview) return
  const after = readJson<{ checkedAt?: number }>(file(), {}).checkedAt ?? now
  writeJson(file(), { checkedAt: now })
  for (const flow of mine())
    if (flow.active)
      for (const t of triggersIn(flow.graph)) {
        const slot = dueSlot(t.data as Trigger, flow.timezone, after, now)
        if (slot !== null) void runFlow(flow, slot, t.id).catch((e) => deps.log(`${flow.name}: ${(e as Error).message}`, 'error'))
      }
}
