import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import { ChatData, keywordScore, split } from './memory.ts'

/** Sahte embedding: anahtar kelimelere göre 3 boyut. */
const vec = (s: string) => ['kedi', 'fiyat', 'rapor'].map((w) => (s.toLowerCase().includes(w) ? 1 : 0.01))
const fake: EmbeddingsInterface = { embedDocuments: async (d) => d.map(vec), embedQuery: async (q) => vec(q) }
const broken: EmbeddingsInterface = { embedDocuments: async () => Promise.reject(new Error('no balance')), embedQuery: async () => Promise.reject(new Error('no balance')) }

test('split keeps every part of the text, with overlap', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Paragraf ${i} biraz metin.`).join('\n')
  const parts = split(text, 200, 40)
  assert.ok(parts.length > 3)
  assert.ok(parts.every((p) => p.length <= 200))
  for (let i = 0; i < 50; i++) assert.ok(parts.some((p) => p.includes(`Paragraf ${i} `)))
})

test('vector search ranks the relevant item first; reports and pages upsert by source', async () => {
  let changes = 0
  const d = new ChatData(fake, { items: [], chunks: [] }, () => changes++)
  d.add('page', 'Kedi maması', 'kedi maması fiyatları', 'https://a')
  const r = d.add('report', 'Rapor', '{"title":"rapor"}', 'q3')
  d.add('report', 'Rapor v2', '{"title":"rapor 2"}', 'q3')
  assert.equal(d.items.filter((x) => x.kind === 'report').length, 1)
  assert.equal(d.get(r.id)?.content, '{"title":"rapor 2"}')
  const { docs, mode } = await d.search('kedi', 1)
  assert.equal(mode, 'vector')
  assert.equal(docs[0].metadata.source, 'https://a')
  assert.ok(d.chunks.every((c) => c.vec))
  assert.ok(changes >= 3)
  assert.match(d.index(), /report: Rapor v2/)
})

test('search falls back to keywords when embeddings fail', async () => {
  const d = new ChatData(broken, { items: [], chunks: [] }, () => {})
  d.add('tool', 'extract_tables', 'Kampanya tıklama maliyeti tablosu')
  d.add('tool', 'read_page', 'Başka bir şey')
  const { docs, mode } = await d.search('tıklama maliyeti', 5)
  assert.equal(mode, 'keyword')
  assert.equal(docs.length, 1)
  assert.equal(keywordScore('a b', 'xyz'), 0)
})
