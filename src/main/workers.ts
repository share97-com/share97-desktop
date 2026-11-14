import { randomUUID } from 'node:crypto'
import type { WorkerDef, WorkerInput, WorkerRun } from '../shared/types.ts'
import { cleanSchedule, nextRun } from '../shared/schedule.ts'
import { accountLine, localAccounts } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { apiKey, refresh, server } from './auth.ts'
import { exclusive, log } from './device.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/**
 * **Worker tanımları** — bu cihazda tekrar tekrar çalışan programlanabilir işler (n8n'deki bir akış
 * gibi, ama adımları agent yürütüyor): bir talimat, kullanacağı hesaplar, isteğe bağlı model ve
 * zamanlama (elle, aralıkla ya da günün saatinde). Her çalışma bir **sohbet süreci** başlatır
 * (`Agent.task`): kullanıcı Sohbet ekranında adım adım izleyebilir, sonucu burada görür.
 *
 * Tanımları cihaz çalıştırıyor (`workers.json`) ve her değişiklikte, her çalışmadan sonra sunucuya
 * yazıyor (`/api/v1/worker/definitions`): sitedeki Workers sayfası hangi cihazda neyin çalıştığını ve son
 * sonucunu gösteriyor; yeniden kurulan cihaz tanımlarını oradan geri alıyor.
 */

const CHECK_MS = 30_000
const MAX_RUNS = 20
const file = () => dataPath('workers.json')

type Stored = Omit<WorkerDef, 'running'>

let list: Stored[] | null = null
const all = (): Stored[] => (list ??= readJson<Stored[]>(file(), []))
const persist = () => writeJson(file(), all())

let agent: Agent
let emit: (defs: WorkerDef[]) => void = () => {}
const active = new Set<string>()

/** Tanımın sunucudaki eşi: ne çalışıyor, ne zaman, son sonucu. Sunucuya ulaşılamazsa bir sonraki değişiklikte yeniden yazılıyor. */
const push = (d: Stored) =>
  void server('/api/v1/worker/definitions', {
    method: 'PUT',
    body: { id: d.id, name: d.name, prompt: d.prompt, accountIds: d.accountIds, model: d.model, schedule: d.schedule, enabled: d.enabled, nextRunAt: d.nextRunAt, lastRunAt: d.lastRunAt, lastOk: d.runs[0]?.ok ?? null, lastSummary: d.runs[0]?.summary ?? null },
  }).catch((e) => console.error('[workers]', (e as Error).message))

type RemoteTask = Pick<Stored, 'id' | 'name' | 'prompt' | 'accountIds' | 'model' | 'schedule' | 'enabled'> & { createdAt: string; nextRunAt: string | null; lastRunAt: string | null; lastOk: boolean | null; lastSummary: string | null }

/**
 * Girişte: cihazda tanım varsa sunucudaki eşleri tazelenir; yoksa (yeni kurulum) bu cihazın sunucudaki
 * tanımları geri yüklenir.
 */
export async function syncWorkers() {
  if (!apiKey()) return
  if (all().length) return all().forEach(push)
  const { tasks } = await server<{ tasks: RemoteTask[] }>('/api/v1/worker/definitions').catch(() => ({ tasks: [] as RemoteTask[] }))
  if (!tasks.length || all().length) return
  const ms = (v: string | null) => (v ? new Date(v).getTime() : null)
  list = tasks.map((t) => {
    const last = ms(t.lastRunAt)
    const schedule = cleanSchedule(t.schedule)
    return { id: t.id, name: t.name, prompt: t.prompt, accountIds: t.accountIds, model: t.model, schedule, enabled: t.enabled, createdAt: ms(t.createdAt) ?? Date.now(), lastRunAt: last, nextRunAt: t.enabled ? nextRun(schedule, Date.now()) : null, runs: last && t.lastOk !== null ? [{ at: last, ms: 0, ok: t.lastOk, summary: t.lastSummary ?? '', chatId: null }] : [] }
  })
  persist()
  changed()
}

export const workerDefs = (): WorkerDef[] => all().map((d) => ({ ...d, running: active.has(d.id) }))
const changed = () => emit(workerDefs())

/** Arayüzden gelen tanım alan alan doğrulanıyor. */
function clean(raw: unknown): Omit<Stored, 'id' | 'createdAt' | 'lastRunAt' | 'nextRunAt' | 'runs'> {
  const r = (raw ?? {}) as Partial<Record<keyof WorkerInput, unknown>>
  const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim().slice(0, 20_000) : ''
  if (!name || !prompt) throw new Error('bad-argument')
  return {
    name,
    prompt,
    accountIds: Array.isArray(r.accountIds) ? [...new Set(r.accountIds.filter((x): x is string => typeof x === 'string' && x.length < 200))].slice(0, 50) : [],
    model: typeof r.model === 'string' && r.model && r.model.length < 200 ? r.model : null,
    schedule: cleanSchedule(r.schedule),
    enabled: r.enabled !== false,
  }
}

export function saveWorker(id: string | null, raw: unknown): string {
  const input = clean(raw)
  const now = Date.now()
  const next = input.enabled ? nextRun(input.schedule, now) : null
  const old = id ? all().find((d) => d.id === id) : undefined
  if (old) Object.assign(old, input, { nextRunAt: next })
  else all().push({ id: (id = randomUUID()), createdAt: now, lastRunAt: null, runs: [], ...input, nextRunAt: next })
  persist()
  changed()
  push(all().find((d) => d.id === id)!)
  return id!
}

export function removeWorker(id: string) {
  list = all().filter((d) => d.id !== id)
  persist()
  changed()
  void server(`/api/v1/worker/definitions?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
}

export function setWorkerEnabled(id: string, enabled: boolean) {
  const d = all().find((x) => x.id === id)
  if (!d) return
  d.enabled = enabled
  d.nextRunAt = enabled ? nextRun(d.schedule, Date.now()) : null
  persist()
  changed()
  push(d)
}

/** Çalışmanın agent'a verilen metni: talimat + bu çalışmanın hesapları ve tarayıcıları. */
function promptOf(d: Stored) {
  const accounts = localAccounts().filter((l) => d.accountIds.includes(l.id))
  return [
    `You are running the Share97 worker "${d.name}" unattended: nobody is watching, so do not ask questions. Do the work, verify it, then call finish_task with success and a short summary (put collected data in its data field).`,
    ...(accounts.length ? ['Accounts for this run (work on each one only in its own browser):', ...accounts.map(accountLine)] : []),
    '',
    `Instructions from the user:\n${d.prompt}`,
  ].join('\n')
}

/** Tanımı şimdi çalıştırır (düğme ya da zamanlayıcı). Zaten çalışıyorsa bir şey yapmaz. */
export async function runWorker(id: string) {
  const d = all().find((x) => x.id === id)
  if (!d || active.has(id)) return
  if (!apiKey()) throw new Error('signed-out')
  active.add(id)
  // Sıradaki zamanlı çalışma başlangıçtan sayılıyor: uzun süren iş bir sonrakini kaydırmasın.
  d.nextRunAt = d.enabled ? nextRun(d.schedule, Date.now()) : null
  changed()
  const started = Date.now()
  let run: WorkerRun
  try {
    const out = await exclusive(() => agent.task(`Worker · ${d.name}`, promptOf(d), d.model))
    run = { at: started, ms: Date.now() - started, ok: out.ok, summary: (out.data ? `${out.summary}\n\n${out.data}` : out.summary).slice(0, 4000), chatId: out.chatId }
  } catch (e) {
    run = { at: started, ms: Date.now() - started, ok: false, summary: (e as Error).message.slice(0, 1000), chatId: null }
  }
  active.delete(id)
  // Çalışırken silinmiş olabilir.
  const now = all().find((x) => x.id === id)
  if (now) {
    now.lastRunAt = started
    now.runs = [run, ...now.runs].slice(0, MAX_RUNS)
    persist()
    // Sonuç sunucuya: sitedeki Workers sayfasında bu cihazın görevinin son çalışması görünüyor.
    push(now)
  }
  log(`${d.name}: ${run.ok ? 'done' : run.summary}`, run.ok ? 'ok' : 'error', run.chatId ?? undefined)
  changed()
  void refresh()
}

/** Vakti gelen tanımlar. Uygulama kapalıyken kaçan çalışma açılışta bir kez yapılıyor. */
function tick() {
  if (!apiKey()) return
  const now = Date.now()
  for (const d of all()) if (d.enabled && d.nextRunAt !== null && d.nextRunAt <= now && !active.has(d.id)) void runWorker(d.id).catch(() => {})
}

export function startWorkers(a: Agent, onChange: (defs: WorkerDef[]) => void) {
  agent = a
  emit = onChange
  setInterval(tick, CHECK_MS)
  setTimeout(tick, 10_000)
}
