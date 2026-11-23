import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { mock } from 'node:test'
import type { Graph } from '../shared/workflow.ts'

// Electron, sunucu ve agent sahte; içerik klasörü ve grafın yürüyüşü gerçek. Akışı bu uygulama çalıştırır: burada sınanıyor.
const home = mkdtempSync(join(tmpdir(), 's97-runner-'))
const calls: { path: string; method?: string; body?: Record<string, unknown> }[] = []
const tasks: { title: string; prompt: string; browserId?: string }[] = []
let overview: { me: string; workflows: unknown[] } | null = null
let taskResult: { ok: boolean; summary: string; permalink?: string } = { ok: true, summary: 'published', permalink: 'https://instagram.com/p/1' }
class ServerError extends Error {
  status: number
  constructor(code: string, status: number) {
    super(code)
    this.status = status
  }
}
const seen = new Set<string>()

mock.module('electron', { namedExports: { app: { getPath: () => home, getLocale: () => 'en' }, shell: {}, clipboard: {}, dialog: {}, nativeImage: {}, ClipboardItem: class {}, Notification: { isSupported: () => false } } })
mock.module('./auth.ts', {
  namedExports: {
    ServerError,
    refresh: async () => ({}),
    server: async (path: string, init: { method?: string; body?: Record<string, unknown> } = {}) => {
      calls.push({ path, method: init.method, body: init.body })
      if (path === '/api/v1/worker/runs') {
        const key = `${init.body!.workflowId}:${init.body!.slot}:${init.body!.trigger}`
        if (seen.has(key)) throw new ServerError('duplicate', 409)
        seen.add(key)
        return { id: `run${seen.size}` }
      }
      return path.endsWith('/publications') ? { postId: 'post1' } : { ok: true }
    },
  },
})
mock.module('./accounts.ts', {
  namedExports: {
    agentBrowser: () => 'b1',
    connectionsState: () => ({ accounts: [{ id: 'acc1', handle: 'shop' }], overview }),
    localAccounts: () => [{ id: 'acc1', platform: 'instagram', handle: 'shop', browserId: 'b1' }],
    openForJob: () => null,
    closeAfterJob: () => {},
    relogin: async () => ({ ok: true }),
    sessionProblem: async () => null,
    syncAccounts: async () => {},
  },
})
mock.module('./auto.ts', { namedExports: { IMAGE_MODEL: 'image-model' } })
mock.module('./settings.ts', { namedExports: { DEFAULT_MODEL: 'chat-model', settings: () => ({ chatModel: null, imageModel: null }) } })
mock.module('./gateway.ts', { namedExports: { apiJson: async () => ({}) } })

const contents = await import('./contents.ts')
const runner = await import('./runner.ts')
const opened: string[] = []
const logs: string[] = []
const stoppedChats: string[] = []
/** İş başlarken (sohbet açıldıktan sonra) çağrılır: testin işin ortasında bir şey yapması için. */
let onTask: ((chatId: string) => void) | null = null
runner.initRunner({
  agent: {
    task: async (title: string, prompt: string, _model: unknown, browserId: string, onStart: (id: string) => void, chatId?: string) => {
      tasks.push({ title, prompt, browserId })
      const id = chatId ?? `chat${tasks.length}`
      onStart(id)
      onTask?.(id)
      return { chatId: id, ...taskResult }
    },
    stop: (id: string) => void stoppedChats.push(id),
  } as never,
  exclusive: (fn) => fn(),
  log: (text) => void logs.push(text),
  showApp: () => {},
  openChat: (id) => void opened.push(id),
})

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({ id, type, data }) as Graph['nodes'][number]
const flow = (id: string, graph: Graph) => ({ id, name: `Flow ${id}`, slug: id, active: true, workerId: 'me', timezone: 'UTC', content: { order: 'sequential' as const, repeat: false }, lastRunAt: null, nodes: graph.nodes.map((n) => n.type), schedule: null, accountIds: ['acc1'], instruction: null, graph })
const status = (id: string, folder: string) => readFileSync(join(home, 'share97-desktop', 'workflow', id, 'contents', folder, 'status.txt'), 'utf8').split('\n')
const last = (path: RegExp) => calls.filter((c) => path.test(c.path)).at(-1)!

test.after(() => rmSync(home, { recursive: true, force: true }))

test('paylaşım akışı: içerik klasörden alınır, agent hesabın tarayıcısında yayınlar, iş sohbette açılır ve kayda geçer', async () => {
  const w = flow('wf1', { nodes: [node('t1', 'trigger'), node('q1', 'queue'), node('ig1', 'instagram', { accountId: 'acc1' })], edges: [{ source: 't1', target: 'q1' }, { source: 'q1', target: 'ig1' }] })
  await contents.addContent('wf1', w.name, 'Merhaba dünya', [join(import.meta.dirname, '../../resources/examples/image.jpg')])
  const out = await runner.runFlow(w as never, 60_000, 't1')
  assert.deepEqual(out, { status: 'success', error: null })
  assert.equal(tasks.length, 1)
  assert.match(tasks[0].prompt, /Merhaba dünya/)
  assert.match(tasks[0].prompt, /workflow\/wf1\/contents\/2\/image\.jpg/)
  assert.equal(tasks[0].browserId, 'b1', 'agent hesabın tarayıcısına kilitli')
  assert.deepEqual(opened, ['chat1'], 'iş başlayınca sohbet ekranı açılır')
  assert.equal(status('wf1', '2')[0], 'published')
  const pub = last(/publications$/).body as { accountId: string; post: { folder: string; media: unknown[] } }
  assert.deepEqual([pub.accountId, pub.post.folder, pub.post.media.length], ['acc1', '2', 1])
  const done = last(/runs\/run1$/).body as { status: string; steps: { node: string; status: string; output?: { chatIds?: string[] } }[] }
  assert.equal(done.status, 'success')
  assert.deepEqual(done.steps.map((s) => `${s.node}:${s.status}`), ['t1:ok', 'q1:ok', 'ig1:ok'])
  assert.deepEqual(done.steps[0].output?.chatIds, ['chat1'], 'çalışma geçmişi sohbete bağlı')
  // Aynı yuva ikinci kez çalışmaz; içerik kalmayınca atlanır ve nedeni yazılır.
  assert.equal((await runner.runFlow(w as never, 60_000, 't1')).status, 'duplicate')
  const empty = await runner.runFlow(w as never, 120_000, 't1')
  assert.equal(empty.status, 'skipped')
  assert.match(empty.error ?? '', /No content left/)
  assert.equal(tasks.length, 1)
})

test('içerik hesaba yalnız hata kolundan bağlıysa çalışma nedeniyle atlanır ve içerik yanmaz', async () => {
  // Canlıda görülen graf: kuyruğun tek çıkışı `error` kolu.
  const w = flow('wf2', { nodes: [node('t1', 'trigger'), node('q1', 'queue'), node('ig1', 'instagram', { accountId: 'acc1' })], edges: [{ source: 't1', target: 'q1' }, { source: 'q1', target: 'ig1', sourceHandle: 'error' }] })
  await contents.addContent('wf2', w.name, 'İçerik', [])
  const before = tasks.length
  const out = await runner.runFlow(w as never, 60_000, 't1')
  assert.equal(out.status, 'skipped')
  assert.match(out.error ?? '', /error output/)
  assert.equal(tasks.length, before, 'hesapta iş yapılmadı')
  assert.equal(status('wf2', '2')[0], 'pending', 'içerik yeniden sırada')
  assert.match(status('wf2', '2')[1], /not shared/)
  assert.match(String(last(/runs\/run\d+$/).body!.error), /error output/, 'neden sunucudaki kayda yazıldı')
})

test('agent düğümü: içerik olmadan görevi hesabın tarayıcısında yapar; düşen iş çalışmayı düşürür', async () => {
  const w = flow('wf3', { nodes: [node('t1', 'trigger'), node('a1', 'agent', { accountId: 'acc1', prompt: 'Reply to new comments' })], edges: [{ source: 't1', target: 'a1' }] })
  taskResult = { ok: true, summary: 'replied to 2 comments' }
  assert.deepEqual(await runner.runFlow(w as never, 60_000, ''), { status: 'success', error: null })
  assert.match(tasks.at(-1)!.prompt, /Chat message from the owner's Share97 workflow .*: Reply to new comments/)
  assert.equal(last(/publications$/).body!.post, undefined, 'görev: paylaşım kaydı açılmaz')
  taskResult = { ok: false, summary: 'a captcha appeared' }
  const failed = await runner.runFlow(w as never, 120_000, '')
  assert.equal(failed.status, 'failed')
  assert.match(failed.error ?? '', /@shop: a captcha appeared/)
  const none = flow('wf4', { nodes: [node('t1', 'trigger'), node('a1', 'agent', { accountId: 'acc1', prompt: ' ' })], edges: [{ source: 't1', target: 'a1' }] })
  assert.match((await runner.runFlow(none as never, 60_000, '')).error ?? '', /instruction is empty/)
})

test('sohbet mesajı düğümleri: aynı hesabın adımları tek sohbette sırayla yazılır', async () => {
  const w = flow('wf5', { nodes: [node('t1', 'trigger'), node('a1', 'agent', { accountId: 'acc1', prompt: 'Open the notifications' }), node('a2', 'agent', { accountId: 'acc1', prompt: 'Reply to the first one' })], edges: [{ source: 't1', target: 'a1' }, { source: 'a1', target: 'a2' }] })
  taskResult = { ok: true, summary: 'done' }
  const before = tasks.length
  const seen = opened.length
  assert.deepEqual(await runner.runFlow(w as never, 60_000, ''), { status: 'success', error: null })
  assert.deepEqual(tasks.slice(before).map((t) => /: (Open the notifications|Reply to the first one)/.exec(t.prompt)?.[1]), ['Open the notifications', 'Reply to the first one'])
  assert.equal(opened.length, seen + 1, 'ikinci mesaj yeni sohbet açmaz, ilkinin sohbetine yazılır')
  const done = last(/runs\/run\d+$/).body as { steps: { output?: { chatIds?: string[] } }[] }
  assert.equal(done.steps[0].output?.chatIds?.length, 1, 'çalışma tek sohbete bağlı')
})

test('zamanlayıcı: yalnız bu cihazın açık akışları, saati gelen yuvada bir kez başlar', async () => {
  const hourly = (id: string, extra: Record<string, unknown>) => ({ ...flow(id, { nodes: [node('t1', 'trigger', { mode: 'interval', days: [], times: [], everyHours: 1 }), node('a1', 'agent', { accountId: 'acc1', prompt: 'Check messages' })], edges: [{ source: 't1', target: 'a1' }] }), ...extra })
  overview = { me: 'me', workflows: [hourly('on', {}), hourly('off', { active: false }), hourly('other', { workerId: 'pc2' })] }
  taskResult = { ok: true, summary: 'done' }
  const h = 3_600_000
  const started = () => calls.filter((c) => c.path === '/api/v1/worker/runs').map((c) => `${c.body!.workflowId}@${c.body!.slot}`)
  const count = started().length
  runner.schedule(10 * h + 1000) // ilk bakış: geçmiş yuva çalışmaz
  runner.schedule(10 * h + 30_000)
  assert.equal(started().length, count)
  runner.schedule(11 * h + 5000)
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(started().slice(count), [`on@${11 * h}`])
  runner.schedule(11 * h + 20_000)
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(started().length, count + 1, 'aynı yuva ikinci kez başlamaz')
})

test('sıra: aynı anda başlatılan akışlar iç içe girmez; sırada bekleyen akış ikinci kez eklenmez', async () => {
  const chain = (id: string) => flow(id, { nodes: [node('t1', 'trigger'), node('a1', 'agent', { accountId: 'acc1', prompt: 'one' }), node('a2', 'agent', { accountId: 'acc1', prompt: 'two' })], edges: [{ source: 't1', target: 'a1' }, { source: 'a1', target: 'a2' }] })
  const [a, b] = [chain('qa'), chain('qb')]
  const before = tasks.length
  const runs = [runner.runFlow(a as never, 60_000, 't1'), runner.runFlow(b as never, 60_000, 't1')]
  assert.equal((await runner.runFlow(b as never, 120_000, 't1')).error, 'this workflow is already waiting in the queue')
  assert.deepEqual((await Promise.all(runs)).map((r) => r.status), ['success', 'success'])
  assert.deepEqual(tasks.slice(before).map((t) => t.title.split(' ·')[0]), ['Flow qa', 'Flow qa', 'Flow qb', 'Flow qb'])
  assert.equal(runner.runnerBusy(), false)
  assert.equal((await runner.runFlow(b as never, 180_000, 't1')).status, 'success', 'sıra boşalınca yeniden çalışır')
})

test('siteden durdur: süren çalışmanın sohbeti durur ve sonraki adımı çalışmaz; sırada bekleyen hiç başlamaz', async () => {
  const chain = (id: string) => flow(id, { nodes: [node('t1', 'trigger'), node('a1', 'agent', { accountId: 'acc1', prompt: 'one' }), node('a2', 'agent', { accountId: 'acc1', prompt: 'two' })], edges: [{ source: 't1', target: 'a1' }, { source: 'a1', target: 'a2' }] })
  const [a, b] = [chain('sa'), chain('sb')]
  taskResult = { ok: true, summary: 'done' }
  const before = tasks.length
  onTask = (chatId) => {
    onTask = null
    runner.stopFlow('sa')
    runner.stopFlow('sb')
    assert.deepEqual(stoppedChats.slice(-1), [chatId], 'süren işin sohbeti durdurulur')
  }
  const out = await Promise.all([runner.runFlow(a as never, 60_000, 't1'), runner.runFlow(b as never, 60_000, 't1')])
  assert.deepEqual(out, [{ status: 'failed', error: runner.STOPPED }, { status: 'skipped', error: runner.STOPPED }])
  assert.deepEqual(tasks.slice(before).map((t) => t.title.split(' ·')[0]), ['Flow sa'], 'ikinci adım ve sıradaki akış çalışmaz')
  assert.equal((last(/runs\/run\d+$/).body as { status: string; error: string }).error, runner.STOPPED)
  assert.equal(runner.runnerBusy(), false)
  assert.equal((await runner.runFlow(b as never, 120_000, 't1')).status, 'success', 'durdurma kalıcı değil: sonraki çalışma normal')
})
