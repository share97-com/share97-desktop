import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPost, cleanHandle, jobPrompt, profileUrl } from './platforms.ts'
import { cleanSchedule, nextRun } from './schedule.ts'

test('zamanlama: elle, aralık ve günlük', () => {
  assert.equal(nextRun({ kind: 'manual' }, 0), null)
  assert.equal(nextRun({ kind: 'interval', minutes: 30 }, 1000), 1000 + 30 * 60_000)
  // 2026-11-13 cuma 10:00 yerel; her gün 09:00 → ertesi gün 09:00.
  const fri10 = new Date(2026, 10, 13, 10, 0).getTime()
  assert.equal(nextRun({ kind: 'daily', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6] }, fri10), new Date(2026, 10, 14, 9, 0).getTime())
  // Aynı gün ileri saat.
  assert.equal(nextRun({ kind: 'daily', time: '18:30', days: [5] }, fri10), new Date(2026, 10, 13, 18, 30).getTime())
  // Yalnız pazartesi.
  assert.equal(nextRun({ kind: 'daily', time: '09:00', days: [1] }, fri10), new Date(2026, 10, 16, 9, 0).getTime())
})

test('zamanlama doğrulama: bozuk girdi elle çalıştırmaya düşer', () => {
  assert.deepEqual(cleanSchedule({ kind: 'interval', minutes: 1 }), { kind: 'interval', minutes: 5 })
  assert.deepEqual(cleanSchedule({ kind: 'daily', time: '25:00' }), { kind: 'manual' })
  assert.deepEqual(cleanSchedule({ kind: 'daily', time: '08:15', days: [9, 1, 1] }), { kind: 'daily', time: '08:15', days: [1] })
  assert.deepEqual(cleanSchedule(null), { kind: 'manual' })
})

test('platform kuralları', () => {
  assert.equal(cleanHandle(' @@ali '), 'ali')
  assert.equal(profileUrl('tiktok', '@ali'), 'https://www.tiktok.com/@ali')
  assert.equal(checkPost('instagram', { caption: 'x', media: [] }), 'Instagram needs an image or video')
  assert.equal(checkPost('x', { caption: 'x', media: [] }), null)
  assert.equal(checkPost('x', { caption: '', media: [] }), 'post is empty')
  assert.equal(checkPost('x', { caption: 'a', media: [{ url: 'http://a/b.png' }] }), 'media must be https')
  assert.equal(checkPost('instagram', { instruction: 'follow @a', media: [] }), null)
  assert.match(checkPost('myspace', { caption: 'x' }) ?? '', /unsupported/)
  const p = jobPrompt({ platform: 'x', handle: 'ali', browserId: 'b1', post: { caption: 'Hi "you"', type: 'feed' }, files: ['uploads/jobs/1/0.jpg'] })
  assert.match(p, /browser_id b1/)
  assert.match(p, /"Hi \\"you\\""/)
  assert.match(p, /uploads\/jobs\/1\/0\.jpg/)
})
