import { randomUUID } from 'node:crypto'
import { Document, type DocumentInterface } from '@langchain/core/documents'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import type { DataItem, DataKind, DataSummary } from '../../shared/types.ts'

/**
 * **Sohbet verisi deposu.** Bir sohbette toplanan her şey (`DataItem`) burada kalıcı duruyor;
 * parçalara bölünüp LangChain `VectorStore` olarak aranıyor (geçidin embedding modeliyle).
 * Embedding yalnız arama yapılınca, henüz vektörü olmayan parçalar için hesaplanıyor.
 * Embedding alınamazsa (bağlantı, bakiye) arama kelime eşleşmesine düşüyor: veri kaybolmuyor.
 * ponytail: tam tarama (parça sayısı × boyut); sohbet başına birkaç bin parçayı rahat kaldırır.
 */

const CHUNK = 1500
const OVERLAP = 200
/** Tek veri en fazla bu kadar karakter saklanıyor (sayfa / araç çıktısı). */
export const MAX_ITEM = 200_000

export type Chunk = { item: string; text: string; vec: number[] | null }
export type Stored = { items: DataItem[]; chunks: Chunk[] }

/** Paragraf sınırında bölmeye çalışan basit bölücü. */
export function split(text: string, size = CHUNK, overlap = OVERLAP): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(text.length, i + size)
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end))
      if (cut > i + size / 2) end = cut + 1
    }
    const piece = text.slice(i, end).trim()
    if (piece) out.push(piece)
    if (end >= text.length) break
    i = Math.max(end - overlap, i + 1)
  }
  return out
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na * nb) || 1)
}

/** Kelime örtüşmesi: embedding yokken yedek sıralama. */
export function keywordScore(query: string, text: string) {
  const words = query.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)
  if (!words.length) return 0
  const t = text.toLocaleLowerCase()
  return words.filter((w) => t.includes(w)).length / words.length
}

export class ChatData extends VectorStore {
  declare FilterType: (doc: DocumentInterface) => boolean
  items: DataItem[]
  chunks: Chunk[]
  private onChange: () => void

  constructor(embeddings: EmbeddingsInterface, stored: Stored, onChange: () => void) {
    super(embeddings, {})
    this.items = stored.items
    this.chunks = stored.chunks
    this.onChange = onChange
  }

  _vectorstoreType() {
    return 'share97-chat-data'
  }

  stored(): Stored {
    return { items: this.items, chunks: this.chunks }
  }

  summaries(): DataSummary[] {
    return this.items.map(({ content, ...rest }) => ({ ...rest, size: content.length }))
  }

  get(id: string) {
    return this.items.find((x) => x.id === id) ?? null
  }

  /** Yeni veri; aynı türde aynı kaynak yeniden gelirse (aynı rapor, aynı sayfa) güncelleniyor. */
  add(kind: DataKind, title: string, content: string, source: string | null = null): DataItem {
    const text = content.length > MAX_ITEM ? `${content.slice(0, MAX_ITEM)}\n…(truncated)` : content
    const same = source && (kind === 'report' || kind === 'page') ? this.items.find((x) => x.kind === kind && x.source === source) : undefined
    const item: DataItem = same ? Object.assign(same, { title, content: text, ts: Date.now() }) : { id: randomUUID().slice(0, 8), kind, title: title.slice(0, 200), source, content: text, ts: Date.now() }
    if (!same) this.items.push(item)
    this.chunks = this.chunks.filter((c) => c.item !== item.id)
    for (const piece of split(`${item.title}\n${item.content}`)) this.chunks.push({ item: item.id, text: piece, vec: null })
    this.onChange()
    return item
  }

  /** Vektörü olmayan parçaları embedding'le. */
  private async embedPending() {
    const pending = this.chunks.filter((c) => !c.vec)
    if (!pending.length) return
    const vecs = await this.embeddings.embedDocuments(pending.map((c) => c.text))
    // Boyut kısaltma: JSON dosyası küçük kalsın, sıralama değişmiyor.
    pending.forEach((c, i) => (c.vec = vecs[i].map((v) => Math.round(v * 1e5) / 1e5)))
    this.onChange()
  }

  async addVectors(vectors: number[][], documents: DocumentInterface[]) {
    documents.forEach((d, i) => this.chunks.push({ item: String(d.metadata.item), text: d.pageContent, vec: vectors[i] }))
    this.onChange()
  }

  async addDocuments(documents: DocumentInterface[]) {
    await this.addVectors(await this.embeddings.embedDocuments(documents.map((d) => d.pageContent)), documents)
  }

  async similaritySearchVectorWithScore(query: number[], k: number, filter?: this['FilterType']): Promise<[DocumentInterface, number][]> {
    return this.chunks
      .filter((c) => c.vec)
      .map((c) => [this.doc(c), cosine(query, c.vec!)] as [DocumentInterface, number])
      .filter(([d]) => !filter || filter(d))
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
  }

  private doc(c: Chunk) {
    const it = this.get(c.item)
    return new Document({ pageContent: c.text, metadata: { item: c.item, kind: it?.kind, title: it?.title, source: it?.source } })
  }

  /** Sorguya en yakın parçalar; `only` verilirse yalnız o verilerde. */
  async search(query: string, k = 8, only?: Set<string>): Promise<{ docs: DocumentInterface[]; mode: 'vector' | 'keyword' }> {
    const filter = only ? (d: DocumentInterface) => only.has(String(d.metadata.item)) : undefined
    try {
      await this.embedPending()
      return { docs: (await this.similaritySearch(query, k, filter)).filter(Boolean), mode: 'vector' }
    } catch {
      const docs = this.chunks
        .filter((c) => !only || only.has(c.item))
        .map((c) => [c, keywordScore(query, c.text)] as const)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([c]) => this.doc(c))
      return { docs, mode: 'keyword' }
    }
  }

  /** Agent'ın her adımda gördüğü dizin: en yeni veriler, raporlar her zaman. */
  index(max = 40): string {
    if (!this.items.length) return ''
    const reports = this.items.filter((x) => x.kind === 'report')
    const recent = this.items.filter((x) => x.kind !== 'report').slice(-max)
    const line = (x: DataItem) => `- [${x.id}] ${x.kind}: ${x.title.replace(/\n/g, ' ').slice(0, 120)}${x.source ? ` (${x.source.slice(0, 120)})` : ''} · ${x.content.length} chars`
    const hidden = this.items.length - reports.length - recent.length
    return [...reports.map(line), ...(hidden > 0 ? [`- …${hidden} older item(s): search_chat_data finds them`] : []), ...recent.map(line)].join('\n')
  }
}
