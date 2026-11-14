import { spawn } from 'node:child_process'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { ChromeState } from '../../shared/types.ts'
import { dataPath, readJson, writeJson } from '../store.ts'
import { ChromeBridge, type SavedChrome } from './bridge.ts'

/**
 * **Chrome eklentisi** (`share97-chrome`): kurulum, köprü ve arayüz durumu.
 *
 * Eklenti klasörü uygulamayla geliyor (geliştirmede proje kökünde, kurulumda `resources/`) ve her
 * açılışta userData altına kopyalanıyor: Chrome'un "Paketlenmemiş öğe yükle" ile gösterilen yolu
 * güncellemelerde ve kurulum klasörü değişince de aynı kalıyor. Kopya yenilenince eski sürümdeki
 * eklentiye köprü `update` gönderiyor, eklenti kendini yeniden yüklüyor.
 */

const FOLDER = 'share97-chrome'
const bundled = () => (app.isPackaged ? join(process.resourcesPath, FOLDER) : join(app.getAppPath(), FOLDER))
export const extensionPath = () => dataPath(FOLDER)

function installCopy() {
  try {
    cpSync(bundled(), extensionPath(), { recursive: true, force: true })
  } catch (e) {
    console.error('[chrome] eklenti klasörü kopyalanamadı', (e as Error).message)
  }
}

const bundledVersion = () => {
  try {
    return (JSON.parse(readFileSync(join(bundled(), 'manifest.json'), 'utf8')) as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

let listener: (s: ChromeState) => void = () => {}
let timer: NodeJS.Timeout | undefined
/** Sekme olayları sık geliyor: arayüze en fazla 150 ms'de bir. */
const changed = () => {
  clearTimeout(timer)
  timer = setTimeout(() => listener(chromeState()), 150)
}

export const bridge = new ChromeBridge({
  load: () => readJson<SavedChrome[]>(dataPath('chrome.json'), []),
  save: (list) => writeJson(dataPath('chrome.json'), list),
  onChange: () => changed(),
  get bundledVersion() {
    return bundledVersion()
  },
})

export const onChromeChange = (cb: (s: ChromeState) => void) => (listener = cb)

export function chromeState(): ChromeState {
  return { port: bridge.port, listening: bridge.listening, error: bridge.error, extensionPath: extensionPath(), instances: bridge.instances() }
}

export async function startChrome() {
  installCopy()
  await bridge.start()
}

export async function openFolder() {
  if (!existsSync(join(extensionPath(), 'manifest.json'))) installCopy()
  const err = await shell.openPath(extensionPath())
  if (err) throw new Error(err)
}

/** Windows'taki olağan Chrome kurulum yerleri (makine geneli ve kullanıcıya). */
function chromeExe(): string | null {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[]
  return roots.map((r) => join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((p) => existsSync(p)) ?? null
}

/** Kurulum yönlendirmesi: açık Chrome'da `chrome://extensions` yeni sekmede açılıyor. */
export function openChromeExtensions(): boolean {
  const exe = chromeExe()
  if (!exe) return false
  spawn(exe, ['chrome://extensions/'], { detached: true, stdio: 'ignore' }).unref()
  return true
}
