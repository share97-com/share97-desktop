import { randomUUID } from 'node:crypto'
import type { Bookmark } from '../shared/types.ts'
import { isWebUrl } from './address.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/** Yer imleri: bütün tarayıcılarda ortak (Chrome'daki yer imi çubuğu gibi), userData/bookmarks.json. */
const file = () => dataPath('bookmarks.json')
let list: Bookmark[] | null = null
let listener: (b: Bookmark[]) => void = () => {}

export const onBookmarksChange = (cb: (b: Bookmark[]) => void) => (listener = cb)
export const bookmarks = () => (list ??= readJson<Bookmark[]>(file(), []))

function save() {
  writeJson(file(), bookmarks())
  listener(bookmarks())
}

export function add(url: string, title: string): Bookmark {
  if (!isWebUrl(url) || url === 'about:blank') throw new Error('Only web pages can be bookmarked.')
  const existing = bookmarks().find((b) => b.url === url)
  if (existing) return existing
  const b = { id: randomUUID(), url, title: title.trim().slice(0, 200) || url, ts: Date.now() }
  bookmarks().push(b)
  save()
  return b
}

export function remove(id: string) {
  list = bookmarks().filter((b) => b.id !== id)
  save()
}

/** Yıldız düğmesi: adres yer imlerindeyse kaldırır, değilse ekler. */
export function toggle(url: string, title: string) {
  const existing = bookmarks().find((b) => b.url === url)
  if (existing) remove(existing.id)
  else add(url, title)
}
