import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { shell, type DownloadItem } from 'electron'
import type { Download } from '../shared/types.ts'
import { root } from './workspace.ts'

/**
 * İndirmeler (Chrome'daki indirme paneli): bütün tarayıcılardan, çalışma klasörü/downloads
 * içine; aynı adlı dosyanın üzerine yazılmıyor. Liste bu oturum boyunca bellekte.
 */
const items = new Map<string, { info: Download; item: DownloadItem }>()
let listener: (d: Download[]) => void = () => {}

export const onDownloadsChange = (cb: (d: Download[]) => void) => (listener = cb)
export const downloads = () => [...items.values()].map((x) => x.info).sort((a, b) => b.ts - a.ts)
const emit = () => listener(downloads())

export function track(item: DownloadItem) {
  const dir = join(root(), 'downloads')
  mkdirSync(dir, { recursive: true })
  // Kaydetme penceresi yok: Chrome varsayılanı gibi doğrudan indirme klasörüne.
  const name = item.getFilename()
  const dot = name.lastIndexOf('.')
  const taken = new Set([...items.values()].map((x) => basename(x.info.path)))
  let candidate = name
  for (let i = 2; taken.has(candidate) || existsSync(join(dir, candidate)); i++) candidate = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`
  const path = join(dir, candidate)
  item.setSavePath(path)
  const info: Download = { id: randomUUID(), name: candidate, path, url: item.getURL(), state: 'progressing', received: 0, total: item.getTotalBytes(), ts: Date.now() }
  items.set(info.id, { info, item })
  item.on('updated', (_e, state) => {
    info.state = state === 'interrupted' ? 'interrupted' : 'progressing'
    info.received = item.getReceivedBytes()
    info.total = item.getTotalBytes()
    emit()
  })
  item.once('done', (_e, state) => {
    info.state = state
    info.received = item.getReceivedBytes()
    emit()
  })
  emit()
}

const get = (id: string) => items.get(id)

export const open = async (id: string) => {
  const d = get(id)
  if (d?.info.state === 'completed') await shell.openPath(d.info.path)
}
export const reveal = (id: string) => {
  const d = get(id)
  if (d) shell.showItemInFolder(d.info.path)
}
export const cancel = (id: string) => get(id)?.item.cancel()
export function clear() {
  for (const [id, d] of items) if (d.info.state !== 'progressing') items.delete(id)
  emit()
}
