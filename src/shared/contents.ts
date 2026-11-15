/**
 * **Yerel içerik** — saf kısım (main, renderer ve testler okuyor). İçeriği bu cihazda duran bir akışın
 * klasörü: `<çalışma klasörü>/workflow/<akış kimliği>/contents/1, 2, 3…`. Her numaralı klasör bir içerik:
 * bir metin dosyası (açıklama), görseller ya da videolar ve içeriğin durumu `status.txt`.
 *
 * Durumlar: `pending` paylaşılmayı bekliyor (dosya yoksa da böyle) · `publishing` akışa verildi, yayın
 * sürüyor · `published` paylaşıldı, bir daha alınmaz · `failed` yayın düştü (yeniden denemek için
 * `pending` yazılır). Akış yalnız `pending` olanı alır: sıra, tekrar ve "paylaşıldı" bilgisi burada.
 */
export const CONTENT_STATUSES = ['pending', 'publishing', 'published', 'failed'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export type ContentSettings = { source: 'cloud' | 'local'; order: 'sequential' | 'random'; repeat: boolean }

export type LocalMedia = { file: string; kind: 'image' | 'video' }
/** `note`: `status.txt`in ikinci satırı (tarih, gönderinin adresi ya da hata). */
export type LocalContent = { folder: string; caption: string; media: LocalMedia[]; status: ContentStatus; note: string }

/** İçerik klasörünün adı: yalnız rakam (`1`, `2`, `12`). */
export const isContentFolder = (name: string) => /^\d{1,9}$/.test(name)
/** Akış kimliği klasör adı oluyor: yol parçası taşıyamaz. */
export const isWorkflowId = (id: string) => /^[\w-]{1,64}$/.test(id)

/** `status.txt`: ilk satır durum, ikinci satır not. Boş ya da tanınmayan durum `pending`. */
export function parseStatus(text: string): { status: ContentStatus; note: string } {
  const [first = '', ...rest] = text.replace(/^﻿/, '').split(/\r?\n/)
  const word = first.trim().toLowerCase()
  return { status: (CONTENT_STATUSES as readonly string[]).includes(word) ? (word as ContentStatus) : 'pending', note: rest.join(' ').trim() }
}

export const statusText = (status: ContentStatus, note = '') => (note ? `${status}\n${note.replace(/\s+/g, ' ').trim()}\n` : `${status}\n`)

/**
 * Akışa verilecek içerik: `pending` olanlardan sıradaki (klasör numarasına göre) ya da rastgele biri.
 * Bekleyen kalmadıysa ve `repeat` açıksa paylaşılmış olanlar baştan başlar (`restart`: onların `status.txt`i
 * `pending`e çekilmeli). `items` klasör numarasına göre sıralı gelmeli.
 */
export function pickContent(items: LocalContent[], o: Pick<ContentSettings, 'order' | 'repeat'>, random = Math.random): { pick: LocalContent | null; restart: boolean } {
  let pool = items.filter((i) => i.status === 'pending')
  const restart = !pool.length && o.repeat
  if (restart) pool = items.filter((i) => i.status === 'published')
  if (!pool.length) return { pick: null, restart: false }
  return { pick: pool[o.order === 'random' ? Math.floor(random() * pool.length) : 0], restart }
}

/** Sunucudaki paylaşımın medya adresi (`local:<klasör>/<dosya>`) → klasör ve dosya; başka biçim `null`. */
export function parseLocalUrl(url: string): { folder: string; file: string } | null {
  const m = /^local:(\d{1,9})\/([^/\\:]+)$/.exec(url)
  return m ? { folder: m[1], file: m[2] } : null
}
