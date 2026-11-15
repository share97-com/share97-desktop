import assert from 'node:assert/strict'
import test from 'node:test'
import { isContentFolder, isWorkflowId, parseLocalUrl, parseStatus, pickContent, statusText, type LocalContent } from './contents.ts'

const item = (folder: string, status: LocalContent['status']): LocalContent => ({ folder, caption: folder, media: [], status, note: '' })

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
  assert.ok(isWorkflowId('cmabc123_x-1') && !isWorkflowId('../x') && !isWorkflowId('a/b'))
  assert.deepEqual(parseLocalUrl('local:3/a b.jpg'), { folder: '3', file: 'a b.jpg' })
  assert.equal(parseLocalUrl('local:3/../x.jpg'), null)
  assert.equal(parseLocalUrl('local:../3/x.jpg'), null)
  assert.equal(parseLocalUrl('https://a/b.jpg'), null)
})
