import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNewer } from './version.ts'

test('sürüm karşılaştırma', () => {
  assert.ok(isNewer('v0.2.1', '0.2.0'))
  assert.ok(isNewer('0.10.0', '0.9.9'))
  assert.ok(isNewer('1.0', '0.99.99'))
  assert.ok(!isNewer('v0.2.0', '0.2.0'))
  assert.ok(!isNewer('0.1.9', '0.2.0'))
  assert.ok(!isNewer('0.2.0-beta', '0.2.0'))
})
