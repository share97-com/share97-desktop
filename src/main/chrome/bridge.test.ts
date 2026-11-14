import assert from 'node:assert/strict'
import { test } from 'node:test'
import WebSocket from 'ws'
import { ChromeBridge, newer, type SavedChrome } from './bridge.ts'

const PORT = 17699
const TOKEN = 'a'.repeat(40)
const hello = (token = TOKEN, instance = 'instance-1') => ({ type: 'hello', instance, token, name: 'Work Chrome', version: '1.0.0', chrome: '157.0' })

/** Eklentinin yerine geçen istemci: gelen mesajları sırayla veriyor, komutlara cevap veriyor. */
function fakeExtension(origin = 'chrome-extension://abcdef') {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin })
  const inbox: Record<string, unknown>[] = []
  const waiters: ((m: Record<string, unknown>) => void)[] = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.type === 'call') return ws.send(JSON.stringify(m.method === 'boom' ? { type: 'result', id: m.id, error: 'nope' } : { type: 'result', id: m.id, result: { echo: m.method, params: m.params } }))
    const w = waiters.shift()
    if (w) w(m)
    else inbox.push(m)
  })
  const next = () => new Promise<Record<string, unknown>>((r) => (inbox.length ? r(inbox.shift()!) : waiters.push(r)))
  const open = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve())
    ws.on('error', reject)
  })
  return { ws, next, open, send: (m: unknown) => ws.send(JSON.stringify(m)) }
}

test('Chrome bridge: approval, calls, reconnect, wrong token and web origins', async () => {
  let store: SavedChrome[] = []
  let changes = 0
  const bridge = new ChromeBridge({ load: () => store, save: (l) => (store = structuredClone(l)), onChange: () => changes++, bundledVersion: '1.0.0' })
  await bridge.start(PORT)
  assert.equal(bridge.listening, true)

  // Web sayfası kökeni: el sıkışma reddediliyor.
  await assert.rejects(fakeExtension('https://evil.example').open)

  // İlk bağlantı onay bekliyor; komut gitmiyor.
  const a = fakeExtension()
  await a.open
  a.send(hello())
  assert.deepEqual(await a.next(), { type: 'welcome', status: 'pending' })
  assert.equal(bridge.get('instance-1')?.status, 'pending')
  await assert.rejects(bridge.call('instance-1', 'windows.list'), /Unknown Chrome/)

  // Onay: sır özeti saklanıyor, komutlar gidiyor, hata metni geri geliyor.
  bridge.approve('instance-1')
  assert.equal((await a.next()).status, 'approved')
  assert.equal(store.length, 1)
  assert.notEqual(store[0].tokenHash, TOKEN)
  assert.deepEqual(await bridge.call('instance-1', 'tabs.get', { tabId: 5 }), { echo: 'tabs.get', params: { tabId: 5 } })
  await assert.rejects(bridge.call('instance-1', 'boom'), /nope/)

  // Eklentiden gelen sekme durumu ve ad değişikliği.
  a.send({ type: 'state', windows: [{ id: 1, focused: true, incognito: false, tabs: [] }] })
  a.send({ type: 'rename', name: '  Client   A ' })
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(bridge.get('instance-1')?.windows.length, 1)
  assert.equal(bridge.get('instance-1')?.name, 'Client A')

  // Kapanınca çevrimdışı; aynı sırla yeniden bağlanınca onay sormadan bağlı.
  a.ws.close()
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(bridge.get('instance-1')?.status, 'offline')
  await assert.rejects(bridge.call('instance-1', 'windows.list'), /not connected/)
  const b = fakeExtension()
  await b.open
  b.send(hello())
  assert.equal((await b.next()).status, 'approved')
  assert.equal(bridge.get('instance-1')?.status, 'connected')

  // Aynı kimlik, yanlış sır: yeniden onay bekliyor, komut gitmiyor.
  const c = fakeExtension()
  await c.open
  c.send(hello('b'.repeat(40)))
  assert.equal((await c.next()).status, 'pending')
  bridge.reject('instance-1')
  assert.equal((await c.next()).status, 'rejected')

  // Onayı kaldırınca bağlantı kapanıyor ve kayıt siliniyor.
  bridge.forget('instance-1')
  assert.equal(store.length, 0)
  assert.ok(changes > 0)
  bridge.stop()
})

test('extension version compare', () => {
  assert.equal(newer('1.0.10', '1.0.9'), true)
  assert.equal(newer('1.0.0', '1.0.0'), false)
  assert.equal(newer('1.0', '1.0.1'), false)
})
