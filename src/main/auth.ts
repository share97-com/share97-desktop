import { createServer, type Server } from 'node:http'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { app, safeStorage, shell } from 'electron'
import type { Account, AuthState, ConnectError } from '../shared/types.ts'
import { authorizeUrl, parseCallback, random } from './pkce.ts'

/**
 * Share97 sunucusu: Connect, hesap, Worker uçları (`/api/v1/worker/*`) ve yapay zekâ geçidi
 * (`/api/v1/ai/*`, sunucuda api14'e aktarılıyor). `SHARE97_URL` geliştirmede yerel sunucuyu gösteriyor.
 */
export const SHARE97 = (process.env.SHARE97_URL || 'https://share97.com').replace(/\/+$/, '')

/** Kullanıcı tarayıcıda onay vermezse yerel sunucu bu kadar bekleyip kapanıyor. */
const CONNECT_TIMEOUT_MS = 10 * 60_000

/**
 * Cihaz anahtarı yalnız main süreçte: safeStorage (Windows DPAPI / macOS Keychain / libsecret) ile
 * şifreli dosyada. Renderer anahtarı hiç görmüyor, IPC'den yalnız `AuthState` geçiyor. Anahtar aynı
 * zamanda bu kurulumun **Worker kimliği**: sunucu işleri bu cihaza onunla veriyor.
 */
const keyFile = () => join(app.getPath('userData'), 'share97-key.bin')
let key: string | null = null
let state: AuthState = { status: 'signed-out' }
let pending: { server: Server; finish: (s: AuthState) => void } | null = null
const listeners = new Set<(s: AuthState) => void>()

export const onAuthChange = (cb: (s: AuthState) => void) => void listeners.add(cb)
export const authState = () => state
/** Agent ve sunucu istekleri için; renderer'a asla gönderilmiyor. */
export const apiKey = () => key

function set(s: AuthState) {
  state = s
  for (const l of listeners) l(s)
  return s
}

async function saveKey(k: string) {
  // ponytail: düz metne düşmek yok; şifreleme yoksa anahtar yalnız bu oturumda bellekte kalıyor.
  if (await safeStorage.isAsyncEncryptionAvailable()) await writeFile(keyFile(), await safeStorage.encryptStringAsync(k))
  key = k
}

async function forgetKey() {
  key = null
  await rm(keyFile(), { force: true })
}

export class ServerError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

/**
 * Share97 sunucusuna cihaz anahtarıyla JSON isteği. 401: anahtar sitede iptal edilmiş (Workers
 * sayfasından kaldırılmış); yerelden siliniyor ve uygulama girişe dönüyor.
 */
export async function server<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!key) throw new ServerError('signed-out', 401)
  const res = await fetch(`${SHARE97}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    headers: { Authorization: `Bearer ${key}`, ...(init.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: unknown }
  if (res.status === 401) {
    await forgetKey()
    set({ status: 'signed-out' })
  }
  if (!res.ok) throw new ServerError(typeof data.error === 'string' ? data.error : `http-${res.status}`, res.status)
  return data
}

/** Anahtar varsa hesabı (paket, USD bakiye) tazeler; iptal edilmişse çıkış durumuna düşer. */
export async function refresh(): Promise<AuthState> {
  if (!key) return set({ status: 'signed-out' })
  try {
    return set({ status: 'signed-in', account: await server<Account>('/api/v1/worker/me') })
  } catch (e) {
    if (e instanceof ServerError && e.status === 401) return state
    // Ağ hatası: oturum düşmüyor, eldeki hesap bilgisi ekranda kalıyor.
    return state.status === 'signed-in' ? state : set({ status: 'error', error: 'network' })
  }
}

/** Açılışta: kayıtlı anahtar denenir (her onay yeni cihaz anahtarı açtığı için tekrar Connect yapılmıyor). */
export async function restore() {
  try {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(await readFile(keyFile()))
      key = result
      if (shouldReEncrypt) await saveKey(result)
    }
  } catch {
    key = null
  }
  return refresh()
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#0b0a14;color:#f1f5f9;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#94a3b8">${body}</p></div>`

/**
 * Connect akışı: 127.0.0.1'de rastgele portta tek kullanımlık sunucu → sistem tarayıcısında onay
 * → `?code&state` → `POST /api/connect/token` → cihaz anahtarı. Aynı anda tek akış.
 */
export async function connect(): Promise<AuthState> {
  cancel()
  const verifier = random()
  const expected = random()
  set({ status: 'connecting' })

  return new Promise<AuthState>((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const parsed = parseCallback(url.searchParams, expected)
      const result = 'error' in parsed ? parsed.error : await exchange(parsed.code, verifier)
      const ok = result === 'ok'
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(ok ? page('Share97 Desktop bağlandı', 'Bu sekmeyi kapatıp uygulamaya dönebilirsiniz.') : page('Bağlantı kurulamadı', 'Uygulamaya dönüp tekrar deneyin.'))
      finish(ok ? await refresh() : set({ status: 'error', error: result as ConnectError }))
    })
    const timer = setTimeout(() => finish(set({ status: 'error', error: 'timeout' })), CONNECT_TIMEOUT_MS)
    const finish = (s: AuthState) => {
      clearTimeout(timer)
      server.close()
      if (pending?.server === server) pending = null
      resolve(s)
    }
    pending = { server, finish }
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      void shell.openExternal(authorizeUrl(SHARE97, `http://127.0.0.1:${port}/callback`, verifier, expected))
    })
  })
}

async function exchange(code: string, verifier: string): Promise<'ok' | ConnectError> {
  try {
    const res = await fetch(new URL('/api/connect/token', SHARE97), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    })
    const body = (await res.json()) as { ok: boolean; key?: string; error?: string }
    if (!body.ok || !body.key) return body.error === 'key-limit' ? 'key-limit' : 'invalid-code'
    await saveKey(body.key)
    // Workers ekranında bu cihaz bilgisayarın adıyla görünsün (sunucu varsayılanı dönüş adresi).
    await server('/api/v1/worker/me', { method: 'PATCH', body: { name: hostname() } }).catch(() => {})
    return 'ok'
  } catch {
    return 'network'
  }
}

export function cancel() {
  pending?.finish(set({ status: 'signed-out' }))
}

export async function signOut() {
  cancel()
  // Sunucuya ulaşılamazsa da cihazdaki bağlantı kesiliyor.
  await server('/api/v1/worker/session', { method: 'DELETE' }).catch(() => {})
  await forgetKey()
  return set({ status: 'signed-out' })
}
