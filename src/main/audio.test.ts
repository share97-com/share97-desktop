import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pcmToWav, rateOf } from './audio.ts'

test('PCM → WAV başlığı', () => {
  const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]), 16_000)
  const v = new DataView(wav.buffer)
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE')
  assert.equal(v.getUint32(4, true), 40)
  assert.equal(v.getUint32(24, true), 16_000)
  assert.equal(v.getUint32(28, true), 32_000)
  assert.equal(v.getUint32(40, true), 4)
  assert.deepEqual([...wav.slice(44)], [1, 2, 3, 4])
  assert.equal(rateOf('audio/pcm; rate=44100'), 44_100)
  assert.equal(rateOf(null), 24_000)
})
