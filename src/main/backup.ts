import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'
import { app, dialog, session, shell, type BrowserWindow, type CookiesSetDetails } from 'electron'
import type { BackupEntry } from '../shared/types.ts'
import { dataPath, readJson } from './store.ts'

/**
 * **Yedekler.** Bütün ayarlar (model, tarayıcılar, hesaplar, yer imleri, geçmiş, agent hafızası,
 * şifreli parola kasası) ve her uygulama tarayıcısının çerezleri tek `.share97` dosyasında: brotli ile
 * sıkıştırılmış JSON. Dosyalar Belgeler\Share97\Yedekler altında: uygulama kaldırılsa da kalıyor.
 * Parola kasası ve cihaz anahtarı zaten Windows DPAPI ile şifreli; yalnız aynı Windows kullanıcısında açılır.
 * Çerezler oturum demek: dosya kimseyle paylaşılmamalı (arayüz bunu söylüyor).
 */

const FORMAT = 'share97-backup'
const EXT = '.share97'
/** userData'daki ayar dosyaları. Sohbetler ve önizlemeler yok: ayar değil, büyük. */
const FILES = ['settings.json', 'browsers.json', 'accounts.json', 'auto.json', 'bookmarks.json', 'extensions.json', 'power.json', 'chrome.json', 'agent-memory.json', 'window.json', 'history.jsonl', 'passwords.bin', 'share97-key.bin']
const SITE = 'persist:share97-site'

type Cookie = Electron.Cookie
type Backup = { format: typeof FORMAT; version: 1; app: string; createdAt: string; files: Record<string, string>; cookies: Record<string, Cookie[]> }

export const backupDir = () => join(app.getPath('documents'), 'Share97', 'Yedekler')

/** Yalnız klasördeki `.share97` dosya adı; yol parçası kabul edilmiyor. */
function fileOf(name: string) {
  if (basename(name) !== name || !name.endsWith(EXT)) throw new Error('bad-argument')
  return join(backupDir(), name)
}

/** Kalıcı tarayıcıların bölümleri (gizli pencereler yedeklenmiyor) ve sitenin oturumu. */
function partitions(): string[] {
  const { browsers = [] } = readJson<{ browsers?: { id: string; incognito?: boolean }[] }>(dataPath('browsers.json'), {})
  return [...browsers.filter((b) => !b.incognito).map((b) => `persist:browser-${b.id}`), SITE]
}

async function snapshot(): Promise<Buffer> {
  const files: Record<string, string> = {}
  for (const f of FILES) if (existsSync(dataPath(f))) files[f] = readFileSync(dataPath(f)).toString('base64')
  const cookies: Record<string, Cookie[]> = {}
  for (const p of partitions()) cookies[p] = await session.fromPartition(p).cookies.get({})
  const body: Backup = { format: FORMAT, version: 1, app: app.getVersion(), createdAt: new Date().toISOString(), files, cookies }
  return brotliCompressSync(JSON.stringify(body), { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })
}

function parse(file: string): Backup {
  const b = JSON.parse(brotliDecompressSync(readFileSync(file)).toString('utf8')) as Backup
  if (b?.format !== FORMAT || typeof b.files !== 'object' || typeof b.cookies !== 'object') throw new Error('backup-invalid')
  return b
}

const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace('T', '-').replace(':', '')

export function listBackups(): BackupEntry[] {
  if (!existsSync(backupDir())) return []
  return readdirSync(backupDir())
    .filter((n) => n.endsWith(EXT))
    .map((name) => {
      const s = statSync(join(backupDir(), name))
      return { name, size: s.size, updatedAt: s.mtimeMs }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createBackup(prefix = 'share97-yedek'): Promise<string> {
  mkdirSync(backupDir(), { recursive: true })
  let name = `${prefix}-${stamp()}${EXT}`
  for (let i = 2; existsSync(join(backupDir(), name)); i++) name = `${prefix}-${stamp()}-${i}${EXT}`
  writeFileSync(join(backupDir(), name), await snapshot())
  return name
}

/** Var olan yedeğin içeriği bugünkü ayarlarla değişiyor; adı aynı kalıyor. */
export async function updateBackup(name: string) {
  const file = fileOf(name)
  if (!existsSync(file)) throw new Error('backup-missing')
  writeFileSync(file, await snapshot())
}

const cookieUrl = (c: Cookie) => `http${c.secure ? 's' : ''}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`

/**
 * Geri yükleme: önce bugünkü durum ayrı bir yedeğe alınıyor (geri dönüş yolu), sonra çerezler ve dosyalar
 * yazılıp uygulama yeniden başlıyor (bellekteki ayarlar eskiyle üzerine yazmasın diye `exit`, `quit` değil).
 */
export async function restoreBackup(name: string) {
  const b = parse(fileOf(name))
  await createBackup('geri-yukleme-oncesi')
  for (const [p, list] of Object.entries(b.cookies)) {
    if (p !== SITE && !/^persist:browser-[\w-]+$/.test(p)) continue
    const ses = session.fromPartition(p)
    for (const c of list) {
      const details: CookiesSetDetails = { url: cookieUrl(c), name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate }
      if (!c.hostOnly) details.domain = c.domain
      await ses.cookies.set(details).catch(() => {})
    }
    await ses.cookies.flushStore()
  }
  // Dosyalar en son ve eşzamanlı: arada bellekteki bir gecikmeli kayıt (tarayıcı listesi) üzerine yazamasın.
  for (const [f, data] of Object.entries(b.files)) if (FILES.includes(f)) writeFileSync(dataPath(f), Buffer.from(data, 'base64'))
  app.relaunch()
  app.exit(0)
}

/** Başka yerden (başka bilgisayar, USB) bir `.share97` dosyası yedek klasörüne kopyalanıyor. */
export async function importBackup(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Share97', extensions: ['share97'] }] })
  const src = r.filePaths[0]
  if (r.canceled || !src) return null
  parse(src)
  mkdirSync(backupDir(), { recursive: true })
  let name = basename(src)
  for (let i = 2; existsSync(join(backupDir(), name)); i++) name = basename(src, EXT) + `-${i}${EXT}`
  writeFileSync(join(backupDir(), name), readFileSync(src))
  return name
}

export const revealBackup = (name: string) => shell.showItemInFolder(fileOf(name))
export const removeBackup = (name: string) => shell.trashItem(fileOf(name))
export async function openBackupFolder() {
  mkdirSync(backupDir(), { recursive: true })
  await shell.openPath(backupDir())
}
