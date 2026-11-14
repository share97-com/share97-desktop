/** `v0.2.10` > `0.2.9`: sürüm etiketlerini sayı sayı karşılaştırır (ön ek `v` ve ek etiketler yok sayılıyor). */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0)
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d > 0
  }
  return false
}
