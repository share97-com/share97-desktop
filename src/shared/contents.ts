/**
 * **Yerel içerik** — saf kısım (main, renderer ve testler okuyor). Akışların içeriği yalnız cihazda
 * duruyor (sitede içerik alanı yok). Bu cihaza atanmış bir akışın klasörü:
 * `<çalışma klasörü>/workflow/<akış kimliği>/contents/1, 2, 3…`. Her numaralı klasör bir içerik:
 * bir metin dosyası (açıklama), görseller ya da videolar ve içeriğin durumu `status.txt`.
 *
 * Durumlar: `pending` paylaşılmayı bekliyor (dosya yoksa da böyle) · `publishing` akışa verildi, yayın
 * sürüyor · `published` paylaşıldı, bir daha alınmaz · `failed` yayın düştü (yeniden denemek için
 * `pending` yazılır). Akış yalnız `pending` olanı alır: sıra, tekrar ve "paylaşıldı" bilgisi burada.
 */
export const CONTENT_STATUSES = ['pending', 'publishing', 'published', 'failed'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

/** Akışın içerik ayarları: paylaşım sırası ve hepsi paylaşılınca baştan başlama. */
export type ContentSettings = { order: 'sequential' | 'random'; repeat: boolean }

export type LocalMedia = { file: string; kind: 'image' | 'video' }
/** `note`: `status.txt`in ikinci satırı (tarih, gönderinin adresi ya da hata). */
export type LocalContent = { folder: string; caption: string; media: LocalMedia[]; status: ContentStatus; note: string }

/** Örnek içeriğin (`1` numaralı klasör) `status.txt` notu. Örnek `published` durur ve hiç paylaşılmaz: tekrar açıkken de. */
export const EXAMPLE_NOTE = 'example content'
export const isExample = (i: Pick<LocalContent, 'note'>) => i.note.endsWith(EXAMPLE_NOTE)

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
 * Bekleyen kalmadıysa ve `repeat` açıksa paylaşılmış olanlar (örnek hariç) baştan başlar (`restart`: onların
 * `status.txt`i `pending`e çekilmeli). `items` klasör numarasına göre sıralı gelmeli.
 */
export function pickContent(items: LocalContent[], o: Pick<ContentSettings, 'order' | 'repeat'>, random = Math.random): { pick: LocalContent | null; restart: boolean } {
  let pool = items.filter((i) => i.status === 'pending')
  const restart = !pool.length && o.repeat
  if (restart) pool = items.filter((i) => i.status === 'published' && !isExample(i))
  if (!pool.length) return { pick: null, restart: false }
  return { pick: pool[o.order === 'random' ? Math.floor(random() * pool.length) : 0], restart }
}

/** Sunucudaki paylaşımın medya adresi (`local:<klasör>/<dosya>`) → klasör ve dosya; başka biçim `null`. */
export function parseLocalUrl(url: string): { folder: string; file: string } | null {
  const m = /^local:(\d{1,9})\/([^/\\:]+)$/.exec(url)
  return m ? { folder: m[1], file: m[2] } : null
}

/* ---------------- Yapay zekâ ile içerik üretimi ---------------- */

export const MAX_GENERATE = 10
/** `from`: örnek alınacak içerik klasörü (yoksa yalnız konu). `topic`: konu ya da ek talimat. */
export type GenerateInput = { from: string | null; topic: string; count: number; withImage: boolean }
export type GeneratedPost = { caption: string; imagePrompt: string }

/**
 * Metin modeline giden mesajlar. Üretilen her içerik **özgün** olmalı: örnek içeriğin konusunu ve sesini
 * taşır ama onun kopyası ya da yeniden yazımı değildir, kendi başına paylaşılır. Yanıt JSON.
 */
export function generationMessages(o: { count: number; topic: string; source: string | null }) {
  return [
    {
      role: 'system',
      content: [
        `You write social media posts. Write ${o.count} new post(s).`,
        o.source
          ? 'A reference post is given. Each new post is about the same subject and keeps its language and voice, but is an original post of its own: a new angle, a new hook and new wording. Never copy or paraphrase sentences of the reference.'
          : 'Write in the language of the topic.',
        'Every post is different from the others. Open with a strong hook, use short paragraphs and at most three emojis, end with a call to action.',
        'Never invent prices, statistics, quotes or claims about real people.',
        'Reply with JSON: {"posts": [{"caption": string, "imagePrompt": string}]}. imagePrompt is in English and describes one image for that post, with no text in it.',
      ].join('\n'),
    },
    { role: 'user', content: [o.source ? `Reference post:\n${o.source.slice(0, 4000)}` : '', o.topic.trim() ? `Topic and instructions:\n${o.topic.trim().slice(0, 2000)}` : ''].filter(Boolean).join('\n\n') },
  ]
}

/** Modelin yanıtından paylaşımlar: boş metinli olan atılır, en çok `count` tane. Bozuk JSON boş liste. */
export function parseGenerated(text: string, count: number): GeneratedPost[] {
  try {
    const posts = (JSON.parse(text) as { posts?: unknown }).posts
    if (!Array.isArray(posts)) return []
    return posts
      .map((p) => ({ caption: String((p as GeneratedPost)?.caption ?? '').trim(), imagePrompt: String((p as GeneratedPost)?.imagePrompt ?? '').trim() }))
      .filter((p) => p.caption)
      .slice(0, count)
  } catch {
    return []
  }
}

/** Sıradaki boş klasör numarası: var olanların en büyüğünün bir fazlası. */
export const nextFolder = (folders: string[]) => String(Math.max(0, ...folders.filter(isContentFolder).map(Number)) + 1)
