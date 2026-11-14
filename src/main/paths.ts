import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { FileKind } from '../shared/types.ts'

/**
 * Çalışma klasörü içinde kalan yol. Agent ve renderer'dan gelen her dosya adı buradan geçiyor:
 * `..`, mutlak yol ya da başka sürücü klasör dışına çıkıyorsa `null`.
 */
export function inside(root: string, path: string): string | null {
  if (!path || path.includes('\0')) return null
  const full = resolve(root, path)
  const rel = relative(root, full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return full
}

/**
 * Çalışma klasörüne yazılamadı: kullanıcıya nedeni ve ne yapacağı. İmzasız uygulamada en sık neden
 * koruma yazılımı (antivirüsün fidye yazılımı koruması, Windows'un "Denetimli klasör erişimi"): yazmayı EPERM,
 * EACCES ya da ENOENT ile reddediyor.
 */
export function writeProblem(error: unknown, dir: string, exe = 'Share97 Desktop.exe'): string {
  const { code, message } = error as NodeJS.ErrnoException
  const what =
    code === 'ENOSPC'
      ? 'The disk is full: free up space and try again.'
      : code === 'EBUSY'
        ? 'The file is open in another program: close it and try again.'
        : `Windows is blocking the app from writing there. Most often this is the ransomware protection of an antivirus or of Windows ("Controlled folder access"). Running the app as administrator does not help: the app has to be allowed. Fix: open Windows Security > Virus & threat protection > Manage ransomware protection > Allow an app through Controlled folder access > Add an allowed app, choose ${exe}, then try again. With another antivirus, add the app to its allowed (trusted) applications.`
  return `Cannot write files to ${dir} (${message}). ${what}`
}

const KINDS: Record<string, FileKind> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.opus': 'audio', '.aac': 'audio', '.flac': 'audio',
  '.mp4': 'video', '.webm': 'video', '.mov': 'video',
}

export const kindOf = (path: string): FileKind => KINDS[extname(path).toLowerCase()] ?? 'document'

/** Dosya adı olarak güvenli parça (Windows'un yasak karakterleri, baştaki nokta). */
export const safeName = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'dosya'
