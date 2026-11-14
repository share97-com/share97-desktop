import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import type { UpdateState } from '../shared/types.ts'
import { isNewer } from './version.ts'

/**
 * **Kendi kendine güncelleme**, yalnız `.exe` ile: açılışta (ve 6 saatte bir) public
 * `share97-com/share97-desktop` reposunun son sürümüne bakılıyor. Daha yeniyse sürümdeki
 * kurulum `.exe`'si iniyor, GitHub'ın verdiği SHA-256 özetiyle (ve boyutla) doğrulanıyor;
 * agent boştayken sessiz kurulum (`/S --force-run`) başlatılıp uygulama kapanıyor, kurulum
 * bitince yeni sürüm kendiliğinden açılıyor. Geliştirme sırasında (paketlenmemiş) kapalı.
 */
export const RELEASES_REPO = 'share97-com/share97-desktop'
const RECHECK_MS = 6 * 60 * 60_000
const IDLE_POLL_MS = 15_000

type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; size: number; browser_download_url: string; digest?: string | null }[] }

let state: UpdateState = { status: 'idle' }
let listener: (s: UpdateState) => void = () => {}
let installer: string | null = null
let busy: () => boolean = () => false
let running = false

export const updateState = () => state
export const onUpdate = (cb: (s: UpdateState) => void) => (listener = cb)

function set(s: UpdateState) {
  state = s
  listener(s)
}

async function download(url: string, size: number, digest: string | null | undefined, version: string): Promise<string> {
  const file = join(app.getPath('temp'), `share97-desktop-setup-${version}.exe`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const hash = createHash('sha256')
  let received = 0
  let shown = -1
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.length
    const percent = Math.floor((received / size) * 100)
    if (percent !== shown) set({ status: 'downloading', version, percent: (shown = percent) })
  })
  await pipeline(body, createWriteStream(file))
  const sha = `sha256:${hash.digest('hex')}`
  if (received !== size || (digest && digest !== sha)) {
    await rm(file, { force: true })
    throw new Error('Downloaded installer failed verification.')
  }
  return file
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged || running || state.status === 'ready') return state
  running = true
  try {
    set({ status: 'checking' })
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'share97-desktop-updater' } })
    if (res.status === 404) return (set({ status: 'idle' }), state)
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    const r = (await res.json()) as Release
    const exe = r.assets.find((a) => a.name.toLowerCase().endsWith('.exe'))
    if (r.draft || r.prerelease || !exe || !isNewer(r.tag_name, app.getVersion())) return (set({ status: 'idle' }), state)
    const version = r.tag_name.replace(/^v/i, '')
    set({ status: 'downloading', version, percent: 0 })
    installer = await download(exe.browser_download_url, exe.size, exe.digest, version)
    set({ status: 'ready', version })
    const install = () => (busy() ? setTimeout(install, IDLE_POLL_MS) : installUpdate())
    install()
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  } finally {
    running = false
  }
  return state
}

/**
 * Sessiz kurulum; NSIS kurulum bitince uygulamayı yeniden açıyor (`--force-run`). Kurulum, uygulama
 * kapandıktan sonra (`quit`) başlıyor: pencereler ve sekme işlemleri kapanmış, dosyalar serbest oluyor.
 */
export function installUpdate() {
  const file = installer
  if (state.status !== 'ready' || !file) return
  app.once('quit', () => spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref())
  app.quit()
}

/** `isBusy`: agent bir iş yürütüyorsa kurulum beklesin. */
export function startUpdater(isBusy: () => boolean) {
  if (!app.isPackaged) return
  busy = isBusy
  void checkForUpdates()
  setInterval(() => void checkForUpdates(), RECHECK_MS)
}
