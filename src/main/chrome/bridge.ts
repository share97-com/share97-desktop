import { createHash, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import type { ChromeExtension, ChromeInstance, ChromeWindow } from '../../shared/types.ts'

/**
 * **Chrome köprüsü.** `share97-chrome` eklentisi (her Chrome profilinde bir tane) bu
 * WebSocket sunucusuna bağlanıyor; uygulama onun üzerinden sekmeleri listeliyor, açıp kapatıyor ve
 * sayfaları Chrome DevTools Protocol ile yönetiyor (eklentide `chrome.debugger`).
 *
 * Güvenlik:
 *  - Yalnız `127.0.0.1`. Web sayfaları da localhost'a WebSocket açabiliyor: yalnız
 *    `chrome-extension://` kökeninden gelen bağlantı kabul ediliyor.
 *  - Kökeni taklit eden başka bir eklenti ya da yerel program için: her eklenti kurulumda rastgele
 *    bir kimlik ve sır üretiyor; ilk bağlantı **kullanıcı onayı** bekliyor (`pending`). Onaylanınca
 *    sırrın özeti saklanıyor, sonraki bağlantılar onunla tanınıyor. Onaysız bağlantıya komut gitmiyor.
 *
 * Electron'a bağımlı değil (kalıcılık dışarıdan veriliyor): `bridge.test.ts` gerçek soketle sınıyor.
 */

export const CHROME_PORT = 17614
const HELLO_TIMEOUT_MS = 5_000
const CALL_TIMEOUT_MS = 60_000
/** Ekran görüntüsü ve PDF tek mesajda geliyor. */
const MAX_PAYLOAD = 64 * 1024 * 1024

export type SavedChrome = { id: string; name: string; tokenHash: string; agent: boolean; lastSeen: number }

export type BridgeOptions = {
  load(): SavedChrome[]
  save(list: SavedChrome[]): void
  onChange(): void
  /** Uygulamanın taşıdığı eklenti sürümü: daha eski eklenti kendini yeniden yüklüyor. */
  bundledVersion: string
}

const Hello = z.object({
  type: z.literal('hello'),
  instance: z.string().min(8).max(100),
  token: z.string().min(32).max(200),
  name: z.string().max(100),
  version: z.string().max(40),
  chrome: z.string().max(60),
})
type Hello = z.infer<typeof Hello>

type Call = { resolve(v: unknown): void; reject(e: Error): void; timer: NodeJS.Timeout }
type Live = { socket: WebSocket; hello: Hello; approved: boolean; windows: ChromeWindow[]; extensions: ChromeExtension[]; calls: Map<number, Call> }

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60)

/** `1.2.10` > `1.2.9`. */
export const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

export class ChromeBridge {
  private saved: SavedChrome[]
  private live = new Map<string, Live>()
  private server: WebSocketServer | null = null
  private seq = 0
  listening = false
  error: string | null = null
  port = CHROME_PORT

  private opts: BridgeOptions

  constructor(opts: BridgeOptions) {
    this.opts = opts
    this.saved = opts.load()
  }

  start(port = CHROME_PORT): Promise<void> {
    this.port = port
    return new Promise((resolve) => {
      const server = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: MAX_PAYLOAD, verifyClient: ({ origin }: { origin?: string }) => typeof origin === 'string' && origin.startsWith('chrome-extension://') })
      server.on('listening', () => {
        this.server = server
        this.listening = true
        this.error = null
        this.opts.onChange()
        resolve()
      })
      server.on('error', (e: NodeJS.ErrnoException) => {
        this.listening = false
        this.error = e.code === 'EADDRINUSE' ? `Port ${port} is in use by another program.` : e.message
        this.opts.onChange()
        resolve()
      })
      server.on('connection', (socket) => this.accept(socket))
    })
  }

  stop() {
    for (const l of this.live.values()) l.socket.terminate()
    this.server?.close()
    this.server = null
    this.listening = false
  }

  private persist() {
    this.opts.save(this.saved)
  }

  private accept(socket: WebSocket) {
    let id: string | null = null
    const timer = setTimeout(() => !id && socket.close(4000, 'hello timeout'), HELLO_TIMEOUT_MS)
    socket.on('message', (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!id) {
        const hello = Hello.safeParse(msg)
        if (!hello.success) return socket.close(4001, 'bad hello')
        clearTimeout(timer)
        id = hello.data.instance
        this.hello(socket, hello.data)
        return
      }
      const l = this.live.get(id)
      if (!l || l.socket !== socket) return
      this.onMessage(l, msg)
    })
    socket.on('close', () => {
      clearTimeout(timer)
      if (!id) return
      const l = this.live.get(id)
      if (l?.socket !== socket) return
      for (const c of l.calls.values()) {
        clearTimeout(c.timer)
        c.reject(new Error('Chrome disconnected.'))
      }
      this.live.delete(id)
      this.opts.onChange()
    })
    socket.on('error', () => {})
  }

  private hello(socket: WebSocket, hello: Hello) {
    // Aynı kimlikle ikinci bağlantı (eklenti yeniden başladı): eskisi kapanıyor.
    this.live.get(hello.instance)?.socket.close(4002, 'replaced')
    const s = this.saved.find((x) => x.id === hello.instance)
    const approved = !!s && same(s.tokenHash, hash(hello.token))
    this.live.set(hello.instance, { socket, hello, approved, windows: [], extensions: [], calls: new Map() })
    if (approved) {
      s.lastSeen = Date.now()
      this.persist()
      this.welcome(hello.instance)
    } else socket.send(JSON.stringify({ type: 'welcome', status: 'pending' }))
    this.opts.onChange()
  }

  private welcome(id: string) {
    const l = this.live.get(id)
    const s = this.saved.find((x) => x.id === id)
    if (!l || !s) return
    l.socket.send(JSON.stringify({ type: 'welcome', status: 'approved', name: s.name }))
    if (newer(this.opts.bundledVersion, l.hello.version)) l.socket.send(JSON.stringify({ type: 'update' }))
  }

  private onMessage(l: Live, msg: Record<string, unknown>) {
    if (msg.type === 'result' && typeof msg.id === 'number') {
      const c = l.calls.get(msg.id)
      if (!c) return
      l.calls.delete(msg.id)
      clearTimeout(c.timer)
      if (typeof msg.error === 'string') c.reject(new Error(msg.error))
      else c.resolve(msg.result)
      return
    }
    // Durum bildirimleri yalnız onaylı bağlantıdan.
    if (!l.approved) return
    if (msg.type === 'state' && Array.isArray(msg.windows)) {
      l.windows = msg.windows as ChromeWindow[]
      this.opts.onChange()
    } else if (msg.type === 'extensions' && Array.isArray(msg.list)) {
      l.extensions = msg.list as ChromeExtension[]
      this.opts.onChange()
    } else if (msg.type === 'rename' && typeof msg.name === 'string') {
      const s = this.saved.find((x) => x.id === l.hello.instance)
      if (s && cleanName(msg.name)) {
        s.name = cleanName(msg.name)
        this.persist()
        this.opts.onChange()
      }
    }
  }

  /* ---------------- arayüz ve agent ---------------- */

  instances(): ChromeInstance[] {
    const out: ChromeInstance[] = []
    for (const s of this.saved) {
      const l = this.live.get(s.id)
      const version = l?.hello.version ?? ''
      out.push({ id: s.id, name: s.name, status: l?.approved ? 'connected' : 'offline', agent: s.agent, version, chrome: l?.hello.chrome ?? '', outdated: !!version && newer(this.opts.bundledVersion, version), lastSeen: s.lastSeen, windows: l?.approved ? l.windows : [], extensions: l?.approved ? l.extensions : [] })
    }
    for (const [id, l] of this.live)
      if (!l.approved) out.push({ id, name: cleanName(l.hello.name) || 'Chrome', status: 'pending', agent: false, version: l.hello.version, chrome: l.hello.chrome, outdated: false, lastSeen: Date.now(), windows: [], extensions: [] })
    return out
  }

  get(id: string) {
    return this.instances().find((x) => x.id === id) ?? null
  }

  approve(id: string) {
    const l = this.live.get(id)
    if (!l || l.approved) return
    this.saved = this.saved.filter((x) => x.id !== id)
    this.saved.push({ id, name: cleanName(l.hello.name) || `Chrome ${this.saved.length + 1}`, tokenHash: hash(l.hello.token), agent: true, lastSeen: Date.now() })
    l.approved = true
    this.persist()
    this.welcome(id)
    this.opts.onChange()
  }

  reject(id: string) {
    const l = this.live.get(id)
    if (!l || l.approved) return
    l.socket.send(JSON.stringify({ type: 'welcome', status: 'rejected' }))
    l.socket.close(4003, 'rejected')
  }

  /** Onayı kaldırır: eklenti bir sonraki bağlantıda yeniden onay bekler. */
  forget(id: string) {
    this.saved = this.saved.filter((x) => x.id !== id)
    this.persist()
    this.live.get(id)?.socket.close(4004, 'forgotten')
    this.opts.onChange()
  }

  rename(id: string, name: string) {
    const s = this.saved.find((x) => x.id === id)
    const n = cleanName(name)
    if (!s || !n) return
    s.name = n
    this.persist()
    this.live.get(id)?.socket.send(JSON.stringify({ type: 'rename', name: n }))
    this.opts.onChange()
  }

  setAgent(id: string, on: boolean) {
    const s = this.saved.find((x) => x.id === id)
    if (!s) return
    s.agent = on
    this.persist()
    this.opts.onChange()
  }

  /** Eklentide bir komut; onaylı ve bağlı değilse hata. */
  call<T = unknown>(id: string, method: string, params: Record<string, unknown> = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
    const l = this.live.get(id)
    if (!l?.approved) return Promise.reject(new Error(this.saved.some((x) => x.id === id) ? 'This Chrome is not connected (is Chrome open?).' : 'Unknown Chrome.'))
    const callId = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        l.calls.delete(callId)
        reject(new Error(`Chrome did not answer ${method} in ${Math.round(timeoutMs / 1000)} s.`))
      }, timeoutMs)
      l.calls.set(callId, { resolve: resolve as (v: unknown) => void, reject, timer })
      l.socket.send(JSON.stringify({ type: 'call', id: callId, method, params }))
    })
  }
}
