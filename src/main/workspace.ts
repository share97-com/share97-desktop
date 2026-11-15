import { existsSync, realpathSync } from 'node:fs'
import { copyFile, mkdir, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, relative } from 'node:path'
import { app, clipboard, ClipboardItem, dialog, nativeImage, shell, type BrowserWindow } from 'electron'
import type { FileEntry } from '../shared/types.ts'
import { inside, kindOf, writeProblem } from './paths.ts'

/**
 * Agent'ın dosya yazabildiği tek yer: kullanıcı klasörü/share97-desktop (C:\Users\ad\share97-desktop).
 * Belgelerim değil: orası Windows'un "Denetimli klasör erişimi" ile korunuyor (imzasız uygulamanın
 * yazması engelleniyor, yönetici yetkisi de aşmıyor) ve OneDrive'a taşınmış olabiliyor.
 */
export const root = () => join(app.getPath('home'), 'share97-desktop')

let listener = () => {}
export const onFilesChange = (cb: () => void) => (listener = cb)
/** Çalışma klasörüne bu modülün dışında yazıldı (akış içerikleri): dosya listesi tazelensin. */
export const changed = () => listener()

/** Yazılacak yeni dosya: klasör içinde, var olanın üzerine yazmıyor (`ad-2.xlsx`). */
export async function newFile(relPath: string): Promise<string> {
  const full = inside(root(), relPath)
  if (!full) throw new Error(`Path must stay inside the workspace folder: ${relPath}`)
  await mkdir(dirname(full), { recursive: true })
  const ext = extname(full)
  const base = full.slice(0, full.length - ext.length)
  let candidate = full
  for (let i = 2; existsSync(candidate); i++) candidate = `${base}-${i}${ext}`
  return candidate
}

/** `overwrite`: aynı dosya güncelleniyor (devam ettirilen rapor); yoksa yeni ad. */
export async function save(relPath: string, data: string | Uint8Array, overwrite = false): Promise<string> {
  const full = overwrite && inside(root(), relPath)
  try {
    if (full) await mkdir(dirname(full), { recursive: true })
    let path = full || (await newFile(relPath))
    await writeFile(path, data).catch(async (e) => {
      if (!full) throw e
      // Güncellenecek dosya başka programda açık (PDF görüntüleyici kilitliyor): yeni adla yazılıyor.
      path = await newFile(relPath)
      await writeFile(path, data)
    })
    listener()
    return path
  } catch (e) {
    throw new Error(writeProblem(e, dirname(inside(root(), relPath) ?? root()), process.execPath))
  }
}

/**
 * Yazma denemesi: klasöre küçük bir dosya yazıp siliyor. Uzun işten (PDF çizimi) önce çağrılıyor:
 * klasör yazılamıyorsa kullanıcı nedenini ve çözümünü hemen görüyor.
 */
export async function check(relDir: string): Promise<void> {
  const dir = join(root(), relDir)
  const probe = join(dir, `.write-test-${randomUUID()}`)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(probe, 'Share97 Desktop write test')
    await unlink(probe)
  } catch (e) {
    throw new Error(writeProblem(e, dir, process.execPath))
  }
}

/** Var olan dosya: sembolik bağlantıyla dışarı çıkan yol da reddediliyor. */
export async function existing(relPath: string): Promise<string> {
  const full = inside(root(), relPath)
  if (!full) throw new Error(`Path must stay inside the workspace folder: ${relPath}`)
  const [real, realRoot] = await Promise.all([realpath(full), realpath(root())])
  if (!inside(realRoot, relative(realRoot, real))) throw new Error('Path leaves the workspace folder.')
  return real
}

export const rel = (full: string) => relative(root(), full).replace(/\\/g, '/')

/** En yeni önce, en fazla `limit` dosya. */
export async function list(limit = 300): Promise<FileEntry[]> {
  await mkdir(root(), { recursive: true })
  const entries = await readdir(root(), { recursive: true, withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const full = join(e.parentPath, e.name)
        const s = await stat(full)
        return { path: rel(full), name: basename(full), size: s.size, mtime: s.mtimeMs, kind: kindOf(full) }
      }),
  )
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

/** Eşzamanlı sürüm (sürükle-bırak `startDrag` olay içinde çağrılmalı). */
export function existingSync(relPath: string): string {
  const full = inside(root(), relPath)
  if (!full) throw new Error('Path must stay inside the workspace folder.')
  const real = realpathSync(full)
  if (!inside(realpathSync(root()), relative(realpathSync(root()), real))) throw new Error('Path leaves the workspace folder.')
  return real
}

/** Kullanıcının kendi dosyaları (ürün fotoğrafı, logo, tablo) çalışma klasörüne: agent onları kullanabilsin. */
export async function importFiles(win: BrowserWindow): Promise<string[]> {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
  if (r.canceled) return []
  const out: string[] = []
  for (const src of r.filePaths) {
    const dest = await newFile(`uploads/${basename(src)}`)
    await copyFile(src, dest)
    out.push(rel(dest))
  }
  listener()
  return out
}

/** Dışarıdaki dosya (Chrome'un indirdiği) çalışma klasörüne taşınıyor; farklı sürücüdeyse kopyalanıp siliniyor. */
export async function moveIn(src: string, relPath: string): Promise<string> {
  const dest = await newFile(relPath)
  try {
    await rename(src, dest)
  } catch {
    await copyFile(src, dest)
    await unlink(src)
  }
  listener()
  return dest
}

/** Sürükle-bırak / yapıştır: dosyanın içeriği uploads/ altına, aynı ad varsa numaralı. */
export async function saveUpload(name: string, data: Uint8Array): Promise<string> {
  const dest = await newFile(`uploads/${basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'dosya'}`)
  await writeFile(dest, data)
  listener()
  return rel(dest)
}

/** Görsel panoya PNG olarak (web formlarına ve sohbetlere yapıştırılır); diğer dosyalarda tam yolu. */
export async function copy(relPath: string) {
  const full = await existing(relPath)
  const img = kindOf(full) === 'image' ? nativeImage.createFromPath(full) : null
  if (img && !img.isEmpty()) return clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(img.toPNG())], { type: 'image/png' }) })])
  await clipboard.writeText(full)
}

export async function remove(relPath: string) {
  await shell.trashItem(await existing(relPath))
  listener()
}

export const open = async (relPath: string) => void (await shell.openPath(await existing(relPath)))
export const reveal = async (relPath: string) => shell.showItemInFolder(await existing(relPath))
export const openFolder = async () => {
  await mkdir(root(), { recursive: true })
  await shell.openPath(root())
}
