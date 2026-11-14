import { appendFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import type { HistoryEntry } from '../shared/types.ts'
import { dataPath } from './store.ts'

/**
 * Gezinme geçmişi: userData/history.jsonl (satır başına bir kayıt, yalnız sona ekleniyor).
 * Bellekte son `MAX` kayıt tutuluyor; ayarlardaki geçmiş ekranı ve agent'ın `search_history`
 * aracı buradan okuyor.
 */
const MAX = 5000
const file = () => dataPath('history.jsonl')
let entries: HistoryEntry[] | null = null

const load = () =>
  (entries ??= readLines()
    .map((l) => {
      try {
        return JSON.parse(l) as HistoryEntry
      } catch {
        return null
      }
    })
    .filter((e): e is HistoryEntry => e !== null)
    .slice(-MAX))

function readLines() {
  try {
    return readFileSync(file(), 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export function record(e: HistoryEntry) {
  const all = load()
  all.push(e)
  if (all.length > MAX) all.splice(0, all.length - MAX)
  void appendFile(file(), JSON.stringify(e) + '\n').catch(() => {})
}

/** En yeni önce; sorgu adres ve başlıkta aranıyor. */
export function search(query = '', browserId: string | null = null, limit = 500): HistoryEntry[] {
  return page(query, browserId, 0, limit).items
}

/** Ayarlardaki geçmiş ekranı için sayfa sayfa (en yeni önce) ve toplam eşleşme. */
export function page(query: string, browserId: string | null, offset: number, limit: number): { items: HistoryEntry[]; total: number } {
  const q = query.trim().toLowerCase()
  const items: HistoryEntry[] = []
  let total = 0
  const all = load()
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i]
    if (browserId && e.browserId !== browserId) continue
    if (q && !e.url.toLowerCase().includes(q) && !e.title.toLowerCase().includes(q)) continue
    if (total >= offset && items.length < limit) items.push(e)
    total++
  }
  return { items, total }
}

/** Tek kaydı siler (ayarlardaki geçmiş). */
export async function removeEntry(ts: number, url: string) {
  const all = load()
  const i = all.findIndex((e) => e.ts === ts && e.url === url)
  if (i < 0) return
  all.splice(i, 1)
  await writeFile(file(), all.map((e) => JSON.stringify(e)).join('\n') + (all.length ? '\n' : ''))
}

export async function clear() {
  entries = []
  await rm(file(), { force: true })
}
