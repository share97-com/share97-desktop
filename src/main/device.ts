import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Notification } from 'electron'
import type { ActivityEntry, TaskResult } from '../shared/types.ts'
import { checkPost, jobPrompt, platformOf, type JobPost } from '../shared/platforms.ts'
import { agentBrowser, lastSync, localAccounts, sessionProblem, syncAccounts } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { autoStep } from './auto.ts'
import { contentFiles, contentsRel, finishContent, takeContent } from './contents.ts'
import { apiKey, refresh, server, ServerError } from './auth.ts'
import * as ws from './workspace.ts'

/**
 * **Bu kurulum bir Worker.** Sunucudaki akış (workflow) bir paylaşımı ya da talimatı bu cihazdaki
 * bir hesaba gönderdiğinde iş sunucuda bekler (`DeviceJob`); uygulama `POLL_MS`de bir yoklayıp işi
 * alır, agent hesabın tarayıcısında yapar ve sonucu sunucuya bildirir. Sonuç sitede akışın
 * çalışmasında (ve bu uygulamanın Akışlar ekranında) görünür. İçeriği bu cihazın klasöründe duran
 * akış, sıradaki içeriği de aynı yoklamayla buradan alır (`answerContent`).
 *
 * Başıboş işler (sunucu işleri ve Worker tanımları) **sırayla** koşar: aynı hesabın tarayıcısında
 * iki agent birbirinin sayfasını bozmasın.
 */

const POLL_MS = 15_000
const SYNC_MS = 60_000
const MAX_MEDIA_BYTES = 1024 ** 3

type Job = { id: string; accountId: string; payload: JobPost }
/** Akışın `queue` düğümü sıradaki yerel içeriği istiyor (bkz. `contents.ts`). */
type ContentRequest = { id: string; workflowId: string; order: 'sequential' | 'random'; repeat: boolean }

let agent: Agent
let emit: (a: ActivityEntry[]) => void = () => {}
let polling = false
let running = 0
const activity: ActivityEntry[] = []

export const deviceActivity = () => activity
/** Sırada ya da çalışan başıboş iş var mı (güncelleme beklesin, tepsi durumu). */
export const deviceBusy = () => running > 0

export function log(text: string, tone: ActivityEntry['tone'] = 'info', chatId?: string) {
  activity.unshift({ at: Date.now(), text: text.slice(0, 500), tone, chatId })
  activity.length = Math.min(activity.length, 100)
  emit(activity)
}

let chain: Promise<unknown> = Promise.resolve()
/** Başıboş işlerin tek sırası. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  running++
  const next = chain.then(fn, fn).finally(() => running--)
  chain = next.catch(() => {})
  return next
}

const jobDir = (job: Job) => `uploads/jobs/${job.id.replace(/\W/g, '')}`

/** İşin medyası çalışma klasörüne iner; agent oradan `upload_files` ile yükler. İş bitince siliniyor. */
async function download(job: Job): Promise<string[]> {
  const dir = jobDir(job)
  await mkdir(join(ws.root(), dir), { recursive: true })
  const files: string[] = []
  for (const [i, m] of (job.payload.media ?? []).entries()) {
    const res = await fetch(m.url, { signal: AbortSignal.timeout(10 * 60_000) })
    if (!res.ok) throw new Error(`media download failed: ${res.status}`)
    if (Number(res.headers.get('content-length')) > MAX_MEDIA_BYTES) throw new Error('media too large')
    const ext = ((res.headers.get('content-type') ?? '').split('/')[1]?.split(/[;+]/)[0] || (m.kind === 'video' ? 'mp4' : 'jpg')).replace(/\W/g, '')
    const rel = `${dir}/${i}.${ext}`
    await writeFile(join(ws.root(), rel), new Uint8Array(await res.arrayBuffer()))
    files.push(rel)
  }
  return files
}

async function runJob(job: Job): Promise<TaskResult & { chatId?: string }> {
  const account = localAccounts().find((l) => l.id === job.accountId)
  if (!account) return { ok: false, summary: 'This account is not signed in on this device.' }
  const invalid = checkPost(account.platform, job.payload)
  if (invalid) return { ok: false, summary: invalid }
  const problem = await sessionProblem(account)
  if (problem) return { ok: false, summary: problem.error, expired: problem.expired }
  const local = job.payload.local
  try {
    // Yerel içerik zaten çalışma klasöründe: indirilmiyor, dosyalar akışın klasöründen yükleniyor.
    const files = local ? contentFiles(local.workflowId, local.folder, (job.payload.media ?? []).map((m) => m.url)) : await download(job)
    const label = platformOf(account.platform)?.label ?? account.platform
    const title = `${job.payload.instruction ? 'Task' : 'Publish'} · @${account.handle} (${label})`
    return await agent.task(title, jobPrompt({ platform: account.platform, handle: account.handle, browserId: agentBrowser(account)!, post: job.payload, files, folder: local && contentsRel(local.workflowId, local.folder) }))
  } finally {
    await rm(join(ws.root(), jobDir(job)), { recursive: true, force: true }).catch(() => {})
  }
}

/** Akışa sıradaki yerel içeriği verir: klasör seçilir, `status.txt`e `publishing` yazılır, metin ve dosya adları sunucuya gider. */
async function answerContent(req: ContentRequest) {
  const body = await takeContent(req.workflowId, req).then(
    (content) => ({ content }),
    (e) => ({ error: `cannot read the content folder: ${(e as Error).message.slice(0, 400)}` }),
  )
  await server(`/api/v1/worker/content/${encodeURIComponent(req.id)}`, { body })
  if ('error' in body) log(body.error, 'error')
  else log(body.content ? `Workflow content ${body.content.folder} handed to the workflow` : 'Workflow asked for local content: nothing left to share', 'info')
}

async function tick() {
  if (polling || !apiKey()) return
  polling = true
  try {
    if (Date.now() - lastSync() > SYNC_MS) await syncAccounts()
    for (;;) {
      const ids = localAccounts().map((l) => l.id)
      if (!ids.length) break
      const { job, content } = await server<{ job: Job | null; content?: ContentRequest | null }>('/api/v1/worker/poll', { body: { accountIds: ids } })
      if (content) await answerContent(content)
      if (!job) {
        if (content) continue
        break
      }
      const handle = localAccounts().find((l) => l.id === job.accountId)?.handle ?? '?'
      // Hata çift paylaşım riski taşıyor: sonuç ne olursa olsun bir kez bildiriliyor, iş yeniden denenmiyor.
      const result = await exclusive(() => runJob(job)).catch((e): TaskResult => ({ ok: false, summary: `may be partly done, check the account before retrying: ${(e as Error).message.slice(0, 400)}` }))
      // Yerel içeriğin durumu klasöründeki `status.txt`e: paylaşıldı (adresiyle) ya da düştü (nedeniyle).
      if (job.payload.local) await finishContent(job.payload.local.workflowId, job.payload.local.folder, result.ok, `@${handle} ${result.ok ? (result.permalink ?? '') : result.summary}`)
      await server(`/api/v1/worker/jobs/${encodeURIComponent(job.id)}`, { body: { ok: result.ok, permalink: result.permalink?.slice(0, 500), error: result.ok ? undefined : result.summary.slice(0, 2000), expired: result.expired } })
      log(`@${handle}: ${result.ok ? 'done' : result.summary}`, result.ok ? 'ok' : 'error', (result as { chatId?: string }).chatId)
      if (Notification.isSupported()) new Notification({ title: 'Share97', body: `@${handle}: ${result.ok ? result.summary || 'done' : result.summary}`.slice(0, 250) }).show()
      if (result.expired) await syncAccounts()
      void refresh()
    }
    const auto = await autoStep(agent, exclusive)
    if (auto) log(auto.text, auto.ok ? 'ok' : 'error', auto.chatId)
  } catch (e) {
    // 401'de `server` anahtarı siliyor ve uygulama girişe dönüyor; diğer hatalar bir sonraki yoklamada yeniden deneniyor.
    if (!(e instanceof ServerError && e.status === 401)) console.error('[device]', (e as Error).message)
  } finally {
    polling = false
  }
}

export function startDevice(a: Agent, onActivity: (list: ActivityEntry[]) => void) {
  agent = a
  emit = onActivity
  void tick()
  setInterval(() => void tick(), POLL_MS)
}

/** Giriş yapılınca beklemeden ilk eşitleme. */
export const pollNow = () => void tick()
