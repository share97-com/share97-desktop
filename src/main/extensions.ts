import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dialog, type BrowserWindow, type Session } from 'electron'
import type { ExtensionInfo } from '../shared/types.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/**
 * Chrome uzantıları (paketlenmemiş klasör, `manifest.json`). Liste userData/extensions.json'da;
 * her uzantı bütün tarayıcıların oturumlarına yükleniyor (gizli tarayıcılar dahil).
 * Chrome Web Store'dan doğrudan kurulum Electron'da yok: uzantının klasörü (ör. açılmış .crx) seçiliyor.
 * ponytail: Electron Chrome uzantı API'lerinin bir kısmını destekliyor; desteklenmeyen API kullanan uzantı yüklenir ama tam çalışmayabilir.
 */
const file = () => dataPath('extensions.json')
let paths: string[] | null = null
const info = new Map<string, ExtensionInfo>()
const sessions = new Set<Session>()
let listener: (list: ExtensionInfo[]) => void = () => {}

export const onExtensionsChange = (cb: (list: ExtensionInfo[]) => void) => (listener = cb)
const all = () => (paths ??= readJson<string[]>(file(), []).filter((p) => existsSync(join(p, 'manifest.json'))))
export const extensions = (): ExtensionInfo[] => all().map((p) => info.get(p) ?? { id: '', name: p, version: '', path: p, error: null })

async function loadInto(ses: Session, path: string) {
  try {
    const ext = await ses.extensions.loadExtension(path, { allowFileAccess: false })
    info.set(path, { id: ext.id, name: ext.name, version: ext.version, path, error: null })
  } catch (e) {
    info.set(path, { id: '', name: path.split(/[\\/]/).pop() ?? path, version: '', path, error: (e as Error).message })
  }
}

/** Yeni tarayıcı oturumu: kayıtlı bütün uzantılar yükleniyor. */
export async function attach(ses: Session) {
  sessions.add(ses)
  for (const p of all()) await loadInto(ses, p)
  listener(extensions())
}

export async function add(win: BrowserWindow): Promise<ExtensionInfo | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'manifest.json içeren uzantı klasörü' })
  const path = r.filePaths[0]
  if (r.canceled || !path) return null
  if (!existsSync(join(path, 'manifest.json'))) throw new Error('This folder has no manifest.json (unpacked Chrome extension expected).')
  if (!all().includes(path)) {
    all().push(path)
    writeJson(file(), all())
  }
  for (const ses of sessions) await loadInto(ses, path)
  listener(extensions())
  return info.get(path) ?? null
}

export function remove(path: string) {
  const id = info.get(path)?.id
  paths = all().filter((p) => p !== path)
  writeJson(file(), paths)
  if (id) for (const ses of sessions) ses.extensions.removeExtension(id)
  info.delete(path)
  listener(extensions())
}
