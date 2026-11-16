import { jobPrompt, platformOf } from '../shared/platforms.ts'
import { planRound, postInstruction, type AutoJob, type AutoRound } from '../shared/auto.ts'
import { agentBrowser, localAccounts, sessionProblem } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { server, ServerError } from './auth.ts'
import { apiJson } from './gateway.ts'
import { DEFAULT_MODEL, settings } from './settings.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import * as ws from './workspace.ts'

/**
 * **Otomatik paylaşım** (bkz. `shared/auto.ts`): tur sunucudan alınıyor, her yoklamada en çok bir
 * paylaşım, aralarında `GAP_MS`. Metin ve görsel Share97 geçidiyle yazılıyor (bedeli bakiyeden), paylaşımı
 * agent hesabın tarayıcısında yapıyor; yapılan paylaşım sitedeki İçerikler'e yazılıyor.
 */
const GAP_MS = 30 * 60_000
export const IMAGE_MODEL = 'openai/gpt-5.4-image-2'

type State = { queue: AutoJob[]; nextAt: number }
const file = () => dataPath('auto.json')
let state: State | null = null
const load = () => (state ??= readJson<State>(file(), { queue: [], nextAt: 0 }))
const save = () => writeJson(file(), load())

/** Sırada bekleyen otomatik paylaşım sayısı (Ayarlar ve tepsi gösteriyor). */
export const autoPending = () => load().queue.length

async function generate(job: AutoJob, needsMedia: boolean): Promise<{ caption: string; files: string[] }> {
  const chat = await apiJson<{ choices?: { message?: { content?: string } }[] }>('chat/completions', {
    model: settings().chatModel ?? DEFAULT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: postInstruction(job.locale, job.tone) },
      { role: 'user', content: `Topic: ${job.topic}` },
    ],
  })
  const out = JSON.parse(chat.choices?.[0]?.message?.content ?? '{}') as { caption?: string; imagePrompt?: string }
  const caption = String(out.caption ?? '').trim()
  if (!caption) throw new Error('empty-generation')
  if (!needsMedia) return { caption, files: [] }
  const img = await apiJson<{ data?: { url?: string; b64_json?: string }[] }>('images/generations', { model: settings().imageModel ?? IMAGE_MODEL, prompt: String(out.imagePrompt || job.topic), n: 1 })
  const first = img.data?.[0]
  const bytes = first?.b64_json ? Buffer.from(first.b64_json, 'base64') : first?.url ? new Uint8Array(await (await fetch(first.url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()) : null
  if (!bytes?.length) throw new Error('empty-image')
  return { caption, files: [ws.rel(await ws.save(`uploads/auto/${Date.now()}.png`, bytes))] }
}

/**
 * Bir adım: sıra boşsa sunucudan tur istenir; vakti gelmişse sıradaki paylaşım yapılır. `run` başıboş
 * işlerin tek sırası (`device.exclusive`). Dönen metin etkinlik kaydına yazılıyor.
 */
export async function autoStep(agent: Agent, run: <T>(fn: () => Promise<T>) => Promise<T>): Promise<{ text: string; ok: boolean; chatId?: string } | null> {
  const signedIn = localAccounts().filter((l) => agentBrowser(l))
  const s = load()
  if (!s.queue.length) {
    if (!signedIn.length) return null
    let round: { due: boolean } & Partial<AutoRound>
    try {
      round = await server('/api/v1/worker/auto-content', { body: {} })
    } catch (e) {
      if (e instanceof ServerError && e.status === 404) return null
      throw e
    }
    if (!round.due) return null
    s.queue = planRound(round as AutoRound, signedIn.map((l) => l.id))
    s.nextAt = 0
    save()
  }
  if (Date.now() < s.nextAt) return null
  const job = s.queue.shift()!
  s.nextAt = Date.now() + GAP_MS
  save()
  const account = signedIn.find((l) => l.id === job.accountId) ?? signedIn[0]
  if (!account) return null
  const where = `@${account.handle} (${job.locale})`
  try {
    const problem = await sessionProblem(account)
    if (problem) throw new Error(problem.error)
    const { caption, files } = await generate(job, Boolean(platformOf(account.platform)?.needsMedia))
    const label = platformOf(account.platform)?.label ?? account.platform
    const result = await run(() => agent.task(`Auto post · @${account.handle} (${label})`, jobPrompt({ platform: account.platform, handle: account.handle, browserId: agentBrowser(account)!, post: { type: 'feed', caption }, files }), null, agentBrowser(account)!))
    if (!result.ok) return { text: `${where}: ${result.summary}`, ok: false, chatId: result.chatId }
    await server('/api/v1/worker/auto-content', { method: 'PUT', body: { accountId: account.id, caption, permalink: result.permalink?.slice(0, 500) } }).catch(() => {})
    return { text: `${where}: published`, ok: true, chatId: result.chatId }
  } catch (e) {
    return { text: `${where}: ${(e as Error).message}`, ok: false }
  }
}
