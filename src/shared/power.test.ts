import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePowercfg, powerApply, powerRestore } from './power.ts'

test('powercfg: son iki onaltılık değer AC ve pil', () => {
  assert.deepEqual(parsePowercfg('GUID 0x00000000 ...\n  AC Index: 0x00000708\n  DC Index: 0x0000012c'), [1800, 300])
  assert.throws(() => parsePowercfg('nothing'), /power-read-failed/)
})

test('pil seçilmezse yalnız AC değişir; geri yükleme ikisini de yazar', () => {
  assert.equal(powerApply(false).filter((a) => a[0] === '/setdcvalueindex').length, 0)
  assert.equal(powerApply(true).filter((a) => a[0] === '/setdcvalueindex').length, 4)
  const back = powerRestore({ STANDBYIDLE: [1800, 300] })
  assert.deepEqual(back[0], ['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE', '1800'])
  assert.deepEqual(back.at(-1), ['/setactive', 'SCHEME_CURRENT'])
})
