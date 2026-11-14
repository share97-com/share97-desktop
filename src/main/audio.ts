/**
 * Ham PCM (16 bit, işaretli, little-endian) → WAV. Bazı ses modelleri (ör. Gemini TTS) yalnız
 * `pcm` döndürüyor; başlık eklenince her oynatıcıda ve tarayıcıda çalan bir dosya oluyor.
 */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000, channels = 1, bits = 16): Uint8Array {
  const header = new DataView(new ArrayBuffer(44))
  const text = (at: number, s: string) => [...s].forEach((c, i) => header.setUint8(at + i, c.charCodeAt(0)))
  const blockAlign = (channels * bits) / 8
  text(0, 'RIFF')
  header.setUint32(4, 36 + pcm.length, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, channels, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * blockAlign, true)
  header.setUint16(32, blockAlign, true)
  header.setUint16(34, bits, true)
  text(36, 'data')
  header.setUint32(40, pcm.length, true)
  const out = new Uint8Array(44 + pcm.length)
  out.set(new Uint8Array(header.buffer), 0)
  out.set(pcm, 44)
  return out
}

/** `audio/pcm;rate=24000` gibi içerik türünden örnekleme hızı. */
export const rateOf = (contentType: string | null) => Number(/rate=(\d+)/.exec(contentType ?? '')?.[1]) || 24_000
