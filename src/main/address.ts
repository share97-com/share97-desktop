/**
 * Adres çubuğu girdisi → gidilecek URL. Yalnız http(s): `file:`, `javascript:` ve benzeri
 * şemalar adres çubuğundan açılamıyor. Adres gibi durmayan her şey Google araması.
 */
export function toUrl(input: string): string {
  const text = input.trim()
  if (!text) return 'about:blank'
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(text)?.[1]?.toLowerCase()
  if (scheme === 'http' || scheme === 'https') return new URL(text).toString()
  const hostLike = !/\s/.test(text) && (/^localhost(:\d+)?(\/|$)/i.test(text) || /^[^/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text))
  if (hostLike && !scheme) return new URL(`${/^(localhost|\d)/i.test(text) ? 'http' : 'https'}://${text}`).toString()
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

/** Sekmenin açabileceği adresler (pencere açma isteği, sürükle-bırak, kayıtlı sekmeler). */
export const isWebUrl = (url: string) => /^https?:\/\//i.test(url) || url === 'about:blank'
