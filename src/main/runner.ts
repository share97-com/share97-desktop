import { Notification } from 'electron'
import type { Overview } from '../shared/types.ts'
import type { LocalMedia } from '../shared/contents.ts'
import { checkPost, jobPrompt, platformOf, type JobPost } from '../shared/platforms.ts'
import { batchesOf, canEnterSubWorkflow, dueSlot, evaluateCondition, interpolate, isPublish, MAX_LOOP_BATCHES, nextOf, NO_CONTENT, runWalk, skipReason, splitByMedia, triggersIn, type ConditionCheck, type ExprEnv, type Graph, type GraphNode, type RunStep, type Trigger, type WalkOut } from '../shared/workflow.ts'
import { agentBrowser, closeAfterJob, connectionsState, localAccounts, openForJob, relogin, sessionProblem, syncAccounts, type LocalAccount } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { refresh, server, ServerError } from './auth.ts'
import { contentFiles, contentsRel, finishContent, generateContents, listContents, setContentStatus, takeContent } from './contents.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import { L } from './strings.ts'

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
/** Bir hesaptaki tek işin üst süresi. */
const JOB_MAX_MS = 45 * 60_000

type Deps = {
  agent: Agent
  /** Agent işlerinin tek sırası: aynı anda iki agent birbirinin sayfasını bozmasın. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>
  log: (text: string, tone: 'info' | 'ok' | 'error', chatId?: string) => void
  showApp: () => void
  /** İş başlayınca sohbet ekranını o sohbette açar; `force` değilse kullanıcı uygulamada çalışırken ekranı elinden almaz. */
  openChat: (chatId: string, force: boolean) => void
}
let deps: Deps
export const initRunner = (d: Deps) => void (deps = d)

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
  /** Bu çalışmanın iş için açtığı (önceden kapalı) tarayıcılar: çalışma başarıyla bitince kapanır. */
  opened: Set<string>
  /** Elle başlatıldı ("Şimdi çalıştır"): sohbet ekranı işin sohbetinde açılır. */
  manual: boolean
  parent?: string
  subDepth: number
  visited: Set<string>
  /** Siteden "Durdur" (`stopFlow`): gövdelerle paylaşılıyor; sonraki düğüm çalışmaz. */
  halt: { stopped: boolean }
}

/** Siteden durdurulan çalışmanın kayıttaki nedeni. */
export const STOPPED = 'stopped from the site'

const save = (r: Run, extra: Record<string, unknown> = {}) =>
  server(`/api/v1/worker/runs/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: { steps: r.steps.length > 200 ? [r.steps[0], ...r.steps.slice(-199)] : r.steps, ...extra } }).catch((e) => console.error('[runner]', (e as Error).message))

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
  notify(problem.expired ? L().sessionEnded(account.handle) : problem.error, () => {
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
  // Takılan iş sırayı sonsuza dek tutmasın: süre dolunca sohbeti durdurulur, iş düşmüş sayılır.
  let jobChat = ''
  const timeout = setTimeout(() => jobChat && deps.agent.stop(jobChat), JOB_MAX_MS)
  const out = await deps
    .exclusive(() => {
      // Sırasını beklerken siteden durdurulduysa iş hiç başlamaz.
      if (r.halt.stopped) throw new Error(STOPPED)
      const opened = openForJob(account)
      if (opened) r.opened.add(opened)
      const earlier = r.chats.get(accountId)
      return deps.agent.task(
        `${r.flow.name} · @${account.handle} (${label})`,
        prompt,
        null,
        browserId,
        (chatId) => {
          jobChat = chatId
          r.chats.set(accountId, chatId)
          if (chatId === earlier) return
          r.chatIds.push(chatId)
          deps.log(`${r.flow.name} · @${account.handle}: ${L().started}`, 'info', chatId)
          deps.openChat(chatId, r.manual)
        },
        earlier,
      )
    })
    .catch((e) => ({ ok: false, summary: `may be partly done, check the account before retrying: ${(e as Error).message.slice(0, 400)}`, permalink: undefined, expired: false }))
    .finally(() => clearTimeout(timeout))
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
  if (r.halt.stopped) throw new Error(STOPPED)
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
      // Yapay zekâ agent'ı: talimatı hesabın tarayıcısında yapar. İçerik geldiyse metni ve dosyaları göreve eklenir.
      const prompt = str(d.prompt).trim()
      if (!prompt) throw new Error('agent: the instruction is empty: write what the agent should do')
      // Her içerik için bir mesaj (yayın düğümü gibi); içerik yoksa tek mesaj.
      const details: string[] = []
      for (const item of items.length ? items : [null]) details.push(await work(r, str(d.accountId), item, { instruction: interpolate(prompt, envOf(item, tz)) }))
      return { status: 'ok', detail: details.join(', ') }
    }

    case 'queue': {
      if (items.length) return { status: 'skip', detail: 'already has items' }
      const c = await takeContent(r.flow.id, r.flow.content)
      if (!c) {
        notify(L().noContent(r.flow.name))
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
      // Beklerken sıra başka akışlara açık; süre dolunca bu çalışma sıranın önünden sürer.
      release()
      await new Promise((resolve) => setTimeout(resolve, minutes * 60_000))
      await acquire(true)
      return { status: 'ok', detail: `${minutes} min` }
    }
  }
  return { status: 'skip', detail: `unknown step: ${node.type}` }
}

/**
 * **Çalışma sırası.** Aynı anda tek akış çalışır; öbürleri sıraya girer ve önceki bitince başlar: iki akışın adımları
 * aynı hesabın tarayıcısında (tek sekme) iç içe girmesin, cihaz yorulmasın. Elle başlatılan çalışma sıranın önüne
 * geçer. Bekleme (`delay`) düğümü sırayı bırakır, süresi dolunca öne geçerek geri alır.
 */
let busy = false
const waiters: { front: boolean; go: () => void }[] = []
function acquire(front: boolean): Promise<void> {
  if (!busy) {
    busy = true
    return Promise.resolve()
  }
  return new Promise((go) => {
    const w = { front, go }
    if (front) waiters.splice(waiters.findLastIndex((x) => x.front) + 1, 0, w)
    else waiters.push(w)
  })
}
function release() {
  const next = waiters.shift()
  if (next) next.go()
  else busy = false
}
/** Akış dışı agent işi (otomatik paylaşım) de aynı sırada: bir akışın adımlarının arasına girmesin. */
export async function inRunQueue<T>(fn: () => Promise<T>): Promise<T> {
  await acquire(false)
  try {
    return await fn()
  } finally {
    release()
  }
}

/** Sırada bekleyen çalışmalar (akış başına en çok bir tane): uygulama kapanırsa açılışta yeniden sıraya girer. */
type Queued = { id: string; slot: number; trigger: string; manual: boolean; at: number; stopped?: boolean }
const queued: Queued[] = []
/** Akışın şu an süren çalışması (`stopFlow` için). */
const live = new Map<string, Run>()

/**
 * **Siteden "Durdur"**: akışın sırada bekleyen çalışması düşer, süren çalışmasının agent sohbetleri durdurulur ve
 * sonraki düğümü çalışmaz; kayda `STOPPED` nedeniyle düşmüş yazılır. Süren ya da bekleyen yoksa bir şey yapmaz.
 */
export function stopFlow(id: string) {
  for (const q of queued) if (q.id === id) q.stopped = true
  const r = live.get(id)
  if (!r) return
  r.halt.stopped = true
  for (const chatId of r.chats.values()) deps.agent.stop(chatId)
}
/** Akışın süren çalışması: aynı akışın sonraki çalışması onun bitmesini bekler (aynı içerik iki kez alınmasın). */
const tails = new Map<string, Promise<unknown>>()
export const runnerBusy = () => busy || queued.length > 0

type State = { checkedAt?: number; queue?: Queued[] }
const file = () => dataPath('runner.json')
const state = () => readJson<State>(file(), {})
const saveQueue = () => writeJson(file(), { ...state(), queue: queued })

/**
 * Akışı çalıştırır. `trigger` boşsa (elle "Şimdi çalıştır") bütün tetikleyicilerinden başlar. Sunucu aynı yuvayı
 * ikinci kez açtırmaz (`duplicate`). Dönüş: çalışmanın sonucu; atlandıysa **nedeni** (`error`).
 */
export async function runFlow(given: Flow, slot: number, trigger: string, manual = false): Promise<RunOutcome> {
  // Akış başına sırada tek çalışma: sık tetiklenen akış uzun bir işin arkasında yığılmasın.
  if (queued.some((q) => q.id === given.id)) {
    deps.log(`${given.name}: ${L().alreadyQueued}`, 'info')
    return { status: 'failed', error: 'this workflow is already waiting in the queue' }
  }
  const entry: Queued = { id: given.id, slot, trigger, manual, at: Date.now() }
  queued.push(entry)
  saveQueue()
  const ahead = (busy ? 1 : 0) + waiters.length
  if (ahead || tails.has(given.id)) deps.log(`${given.name}: ${L().queued(Math.max(ahead, 1))}`, 'info')
  const previous = tails.get(given.id)
  let finish!: () => void
  const mine_ = new Promise<void>((r) => (finish = r))
  tails.set(given.id, mine_)
  await previous
  await acquire(manual)
  queued.splice(queued.indexOf(entry), 1)
  saveQueue()
  // Sırada beklerken akış değişmiş olabilir: güncel tanımıyla çalışır; kapatıldıysa zamanlanmış çalışma düşer.
  const flow = mine().find((w) => w.id === given.id) ?? given
  try {
    if (entry.stopped) {
      deps.log(`${flow.name}: ${L().stoppedFromSite}`, 'info')
      return { status: 'skipped', error: STOPPED }
    }
    if (!manual && !flow.active) {
      deps.log(`${flow.name}: ${L().offWhileQueued}`, 'info')
      return { status: 'skipped', error: 'turned off while waiting in the queue' }
    }
    let open: { id: string }
    try {
      open = await server('/api/v1/worker/runs', { body: { workflowId: flow.id, slot, trigger } })
    } catch (e) {
      if (e instanceof ServerError && e.status === 409) return { status: 'duplicate', error: null }
      throw e
    }
    const r: Run = { id: open.id, flow, graph: flow.graph, steps: [], tally: { done: 0 }, chatIds: [], chats: new Map(), taken: new Map(), opened: new Set(), manual, subDepth: 0, visited: new Set([flow.id]), halt: { stopped: false } }
    live.set(flow.id, r)
    const starts = triggersIn(flow.graph).filter((t) => !trigger || t.id === trigger)
    // Beklenmeyen hata da çalışmayı kapatır: yoksa sunucuda "çalışıyor", içerik "yayınlanıyor" kalırdı.
    const failure = await runWalk<Item>(flow.graph, starts.map((t) => ({ id: t.id, items: [] })), (n, it) => execute(r, n, it), [], describe, recorder(r)).then(
      (w) => w.failure,
      (e) => (e as Error).message || 'unexpected error',
    )
    live.delete(flow.id)
    const status = failure || r.halt.stopped ? 'failed' : r.tally.done ? 'success' : 'skipped'
    // Durdurulan çalışmada agent'ın "durduruldu" yanıtı değil, durdurma nedeni yazılır.
    const error = r.halt.stopped ? STOPPED : (failure ?? (status === 'skipped' ? skipReason(flow.graph, r.steps) : null))
    if (status === 'success') for (const id of r.opened) closeAfterJob(id)
    // Hiçbir hesaba ulaşmayan içerik yanmaz: yeniden sıraya döner, nedeni notunda.
    for (const [folder, touched] of r.taken) if (!touched) await setContentStatus(flow.id, folder, 'pending', `not shared: ${(error ?? 'the run ended before an account step').slice(0, 300)}`).catch(() => {})
    // Çalışmanın sohbet süreçleri kayda: geçmiş bu sohbetlere bağlanır.
    if (r.steps[0]) r.steps[0] = { ...r.steps[0], output: { ...r.steps[0].output, chatIds: r.chatIds } }
    await save(r, { status, error: error?.slice(0, 2000) })
    const text = r.halt.stopped ? L().stoppedFromSite : status === 'success' ? L().runDone : status === 'failed' ? error! : `${L().runSkipped}: ${error}`
    deps.log(`${flow.name}: ${text}`, status === 'success' ? 'ok' : status === 'failed' ? 'error' : 'info', r.chatIds.at(-1))
    // Atlanan çalışma yalnız etkinlik kaydında: her yuvada bildirim yağmasın (içerik bittiyse ayrıca bildirildi).
    if (status !== 'skipped') notify(`${flow.name}: ${text}`)
    return { status, error }
  } finally {
    release()
    if (tails.get(given.id) === mine_) tails.delete(given.id)
    finish()
    void refresh()
    void syncAccounts()
  }
}

const mine = () => {
  const ov = connectionsState().overview
  return ov ? ov.workflows.filter((w) => w.workerId === ov.me) : []
}

/** Elle "Şimdi çalıştır" (ekran, sohbetteki agent ya da siteden gelen istek). Akış bu cihaza atanmış olmalı; açık olması gerekmez. */
export async function runNow(id: string): Promise<RunOutcome> {
  const flow = mine().find((w) => w.id === id)
  if (!flow) throw new Error('This workflow is not assigned to this computer. Choose this device for it first.')
  // Yuva o an: aynı dakikada ikinci "Şimdi çalıştır" sunucuda kopya sayılıp sessizce düşmesin.
  return runFlow(flow, Date.now(), '', true)
}

let restored = false

/**
 * Zamanlayıcının bir adımı (her yoklamada): bu cihaza atanmış, açık her akışın son bakıştan bu yana saati gelen
 * yuvası çalışmaya başlar. İlk açılışta geçmiş yuva çalışmaz. Çalışmalar beklenmez; agent işleri tek sırada koşar.
 */
export function schedule(now = Date.now()) {
  // Akışlar henüz okunamadıysa (ağ yok) bakış ilerlemez: kaçan yuva eşitlenince telafi edilir.
  if (!connectionsState().overview) return
  const st = state()
  const after = st.checkedAt ?? now
  writeJson(file(), { ...st, checkedAt: now })
  const start = (flow: Flow, slot: number, trigger: string, manual = false) => void runFlow(flow, slot, trigger, manual).catch((e) => deps.log(`${flow.name}: ${(e as Error).message}`, 'error'))
  // Uygulama kapanırken sırada bekleyen (başlamamış) çalışmalar: bir günden eski değilse yeniden sıraya.
  if (!restored) {
    restored = true
    for (const q of st.queue ?? []) {
      const flow = mine().find((w) => w.id === q.id)
      if (flow && now - q.at < 24 * 60 * 60_000 && !queued.some((x) => x.id === q.id)) start(flow, q.slot, q.trigger, q.manual)
    }
  }
  for (const flow of mine())
    if (flow.active)
      for (const t of triggersIn(flow.graph)) {
        const slot = dueSlot(t.data as Trigger, flow.timezone, after, now)
        if (slot !== null) start(flow, slot, t.id)
      }
}
