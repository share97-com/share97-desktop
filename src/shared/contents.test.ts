import assert from 'node:assert/strict'
import test from 'node:test'
import { contentWarnings, isPartial, resultNote, stalePublishing, generationMessages, isContentFolder, nextFolder, parseGenerated, parseLocalUrl, parseStatus, pickContent, statusText, type LocalContent } from './contents.ts'

const item = (folder: string, status: LocalContent['status']): LocalContent => ({ folder, caption: folder, media: [], status, note: '', warnings: [] })

test('status.txt: ilk satır durum, gerisi not; boş ya da tanınmayan bekliyor sayılır', () => {
  assert.deepEqual(parseStatus('published\n2026-11-15 https://x.com/a/1\n'), { status: 'published', note: '2026-11-15 https://x.com/a/1' })
  assert.deepEqual(parseStatus('﻿  FAILED \r\nrate limit'), { status: 'failed', note: 'rate limit' })
  assert.equal(parseStatus('').status, 'pending')
  assert.equal(parseStatus('paylaşıldı').status, 'pending')
  assert.deepEqual(parseStatus(statusText('failed', 'a\nb')), { status: 'failed', note: 'a b' })
})

test('sıradaki içerik: yalnız bekleyenler, sırayla ya da rastgele; paylaşılan bir daha alınmaz', () => {
  const items = [item('1', 'published'), item('2', 'pending'), item('3', 'failed'), item('4', 'pending')]
  assert.equal(pickContent(items, { order: 'sequential', repeat: false }).pick?.folder, '2')
  assert.equal(pickContent(items, { order: 'random', repeat: false }, () => 0.99).pick?.folder, '4')
  const done = [item('1', 'published'), item('2', 'publishing'), item('3', 'published')]
  assert.deepEqual(pickContent(done, { order: 'sequential', repeat: false }), { pick: null, restart: false })
  // Tekrar açık: paylaşılanlar baştan; yayını süren ve düşen dahil değil.
  const again = pickContent(done, { order: 'sequential', repeat: true })
  assert.equal(again.pick?.folder, '1')
  assert.equal(again.restart, true)
  assert.deepEqual(pickContent([], { order: 'random', repeat: true }), { pick: null, restart: false })
})

test('klasör ve adres biçimleri klasörün dışına çıkamıyor', () => {
  assert.ok(isContentFolder('12') && !isContentFolder('1a') && !isContentFolder('..') && !isContentFolder(''))
  assert.deepEqual(parseLocalUrl('local:3/a b.jpg'), { folder: '3', file: 'a b.jpg' })
  assert.equal(parseLocalUrl('local:3/../x.jpg'), null)
  assert.equal(parseLocalUrl('local:../3/x.jpg'), null)
  assert.equal(parseLocalUrl('https://a/b.jpg'), null)
})

test('içerik üretimi: özgünlük talimatı, yanıtın ayrıştırılması ve sıradaki klasör', () => {
  const m = generationMessages({ count: 3, topic: 'kısa tut', source: 'Kahve demleme ipuçları' })
  assert.match(m[0].content, /Write 3 new post/)
  assert.match(m[0].content, /Never copy or paraphrase/)
  assert.match(m[1].content, /Kahve demleme ipuçları/)
  assert.doesNotMatch(generationMessages({ count: 1, topic: 'x', source: null })[0].content, /Reference/i)
  assert.deepEqual(parseGenerated('{"posts":[{"caption":" a ","imagePrompt":"p"},{"caption":""},{"caption":"b"},{"caption":"c"}]}', 2), [{ caption: 'a', imagePrompt: 'p' }, { caption: 'b', imagePrompt: '' }])
  assert.deepEqual(parseGenerated('not json', 2), [])
  assert.deepEqual(parseGenerated('{"posts":"x"}', 2), [])
  assert.equal(nextFolder(['1', '2', '10', 'README.txt']), '11')
  assert.equal(nextFolder([]), '1')
})

test('yayın sonucu: hesaplar aynı notta birikir, bir hesapta paylaşılan published kalır', () => {
  const first = resultNote({ status: 'publishing', note: '2026-11-15 10:00' }, 'a', false, 'rate limit')
  assert.deepEqual(first, { status: 'failed', note: '@a failed: rate limit' })
  const second = resultNote({ status: 'failed', note: `2026-11-15 10:01 ${first.note}` }, 'b', true, 'https://x.com/1')
  assert.deepEqual(second, { status: 'published', note: '@a failed: rate limit; @b ok https://x.com/1' })
  assert.ok(isPartial(second))
  assert.ok(!isPartial(resultNote({ status: 'publishing', note: '' }, 'a', true, '')))
  // Önceki çalışmanın notu taşınmaz: içerik alınırken `publishing` yazılmıştı.
  assert.equal(resultNote({ status: 'publishing', note: '2026-11-15 10:00 @x failed: old' }, 'a', true, '').note, '@a ok')
})

test('publishing durumunda takılan içerik: damgası 90 dakikadan eski ya da yok', () => {
  const now = Date.parse('2026-11-15T12:00:00Z')
  assert.ok(!stalePublishing({ status: 'publishing', note: '2026-11-15 11:00' }, now))
  assert.ok(stalePublishing({ status: 'publishing', note: '2026-11-15 10:00' }, now))
  assert.ok(stalePublishing({ status: 'publishing', note: '' }, now))
  assert.ok(!stalePublishing({ status: 'failed', note: '2026-11-01 10:00' }, now))
})

test('içerik uyarıları', () => {
  assert.deepEqual(contentWarnings({ caption: 10, media: 1, texts: 1, dirs: 0 }), [])
  assert.deepEqual(contentWarnings({ caption: 5001, media: 21, texts: 2, dirs: 1 }), ['long-text', 'many-files', 'many-texts', 'subfolders'])
})

test('hesap planı: günde N paylaşım gün içine dağılır, geçmiş yuva atlanır', async () => {
  const { dayTimes, planSlots } = await import('./contents.ts')
  assert.deepEqual(dayTimes(2), ['12:00', '18:00'])
  assert.deepEqual(dayTimes(3), ['11:00', '15:00', '19:00'])
  const from = new Date(2026, 10, 23, 13, 0)
  const plan = planSlots(['2', '3', '4', '5'], dayTimes(2), from)
  const local = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${d.getHours()}` }
  assert.deepEqual(Object.values(plan).map(local), ['23 18', '24 12', '24 18', '25 12'])
  assert.throws(() => planSlots(['2'], ['25:00'], from))
})

test('aralıklı plan: ilk zamandan başlayıp her N saatte bir içerik', async () => {
  const { intervalSlots } = await import('./contents.ts')
  const first = new Date(2026, 0, 5, 10, 0)
  const slots = intervalSlots(['1', '2', '3'], 36, first)
  assert.deepEqual(Object.keys(slots), ['1', '2', '3'])
  assert.equal(slots['1'], first.toISOString())
  assert.equal(Date.parse(slots['3']) - Date.parse(slots['1']), 72 * 3_600_000)
})
