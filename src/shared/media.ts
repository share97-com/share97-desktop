/** Görsel / video boyutu: paylaşım özgün boyutta yapılır; agent platformun kırpma ekranında bu oranı seçer. */
export type MediaInfo = { width: number; height: number; ratio: string; duration?: number }

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** Oranın adı: sadeleşiyorsa `4:5`, `9:16`; yoksa `1.78:1`. */
export function ratioOf(width: number, height: number): string {
  const g = gcd(width, height)
  return width / g <= 20 && height / g <= 20 ? `${width / g}:${height / g}` : `${(width / height).toFixed(2)}:1`
}

/** `ratio` (`4:5` gibi) oranında, ortalanmış en büyük kırpma kutusu. */
export function centerCrop(width: number, height: number, ratio: string) {
  const [a, b] = ratio.split(':').map(Number)
  if (!(a > 0 && b > 0)) throw new Error(`Bad aspect ratio: ${ratio}`)
  const w = Math.min(width, Math.round((height * a) / b))
  const h = Math.min(height, Math.round((w * b) / a))
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h }
}
