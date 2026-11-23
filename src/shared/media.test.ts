import assert from 'node:assert/strict'
import { test } from 'node:test'
import { centerCrop, ratioOf } from './media.ts'

test('medya: oran adı ve ortalanmış kırpma', () => {
  assert.equal(ratioOf(1080, 1350), '4:5')
  assert.equal(ratioOf(1080, 1920), '9:16')
  assert.equal(ratioOf(1920, 1088), '1.76:1')
  assert.deepEqual(centerCrop(1920, 1080, '1:1'), { x: 420, y: 0, width: 1080, height: 1080 })
  assert.deepEqual(centerCrop(1080, 1920, '4:5'), { x: 0, y: 285, width: 1080, height: 1350 })
  assert.throws(() => centerCrop(10, 10, '0:1'))
})
