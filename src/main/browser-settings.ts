import type { BrowserSettings, Layout } from '../shared/types.ts'
import { isWebUrl, toUrl } from './address.ts'

/** Tarayıcı başına ayarların ilk hali: sistem dili, doğrudan bağlantı, varsayılan user agent, mobil görünüm. */
export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = { language: null, proxy: null, userAgent: null, homeUrl: null, layout: 'mobile', width: null }

/** Mobil görünümün varsayılan genişliği (CSS px, yaygın telefon); elle verilen genişliğin sınırları. */
export const MOBILE_WIDTH = 390
export const MIN_WIDTH = 320
export const MAX_WIDTH = 2560

export const isLayout = (v: unknown): v is Layout => v === 'mobile' || v === 'desktop'

/** Genişlik girdisi: sayı sınırlara çekiliyor, `null`/boş "görünümün varsayılanı"; geçersizse `undefined` (değişmez). */
export function cleanWidth(v: unknown): number | null | undefined {
  if (v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n))) : undefined
}

/** Sekmenin ekrandaki sayfa genişliği: mobilde telefon genişliği, masaüstünde alanın tamamı; alandan geniş olamaz. */
export const pageWidth = (layout: Layout, width: number | null, area: number) => Math.max(1, Math.min(area, width ?? (layout === 'mobile' ? MOBILE_WIDTH : area)))

/** Masaüstü Chrome user agent'ından aynı sürümün Android Chrome'u: siteler mobil sayfayı veriyor. */
export function mobileUserAgent(desktop: string) {
  const major = /Chrome\/(\d+)/.exec(desktop)?.[1] ?? '140'
  return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`
}

/** `socks5://host:port`, `socks4://…`, `http(s)://[kullanıcı:şifre@]host:port`. Chromium SOCKS'ta kullanıcı/şifre desteklemiyor. */
const PROXY = /^(socks5|socks4|http|https):\/\/(?:([^:@/\s]+):([^@/\s]*)@)?([a-z0-9.-]+|\[[0-9a-f:]+\]):(\d{1,5})\/?$/i
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export type ParsedProxy = { rules: string; username?: string; password?: string }

/** Geçersiz biçimde açıklamalı hata. */
export function parseProxy(input: string): ParsedProxy {
  const m = PROXY.exec(input.trim())
  if (!m) throw new Error('Proxy must look like socks5://host:port or http://user:pass@host:port')
  const [, scheme, user, pass, host, port] = m
  if (Number(port) < 1 || Number(port) > 65535) throw new Error('Proxy port must be 1-65535.')
  if (user && scheme.toLowerCase().startsWith('socks')) throw new Error('SOCKS proxies with a username and password are not supported by Chromium; use an http proxy for authentication.')
  return { rules: `${scheme.toLowerCase()}://${host}:${port}`, ...(user && { username: decodeURIComponent(user), password: decodeURIComponent(pass ?? '') }) }
}

/** Renderer'dan ya da agent'tan gelen yama: boş metin "varsayılana dön" demek. */
export function normalize(current: BrowserSettings, patch: Partial<Record<keyof BrowserSettings, unknown>>): BrowserSettings {
  const next = { ...current }
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null ? '' : undefined)
  const language = text(patch.language)
  if (language !== undefined) {
    if (language && !LANG.test(language)) throw new Error('Language must be a code like tr-TR or en.')
    next.language = language || null
  }
  const proxy = text(patch.proxy)
  if (proxy !== undefined) {
    if (proxy) parseProxy(proxy)
    next.proxy = proxy || null
  }
  const ua = text(patch.userAgent)
  if (ua !== undefined) next.userAgent = ua ? ua.slice(0, 500) : null
  if (patch.layout !== undefined) {
    if (!isLayout(patch.layout)) throw new Error('Layout must be mobile or desktop.')
    next.layout = patch.layout
  }
  const width = cleanWidth(patch.width)
  if (width !== undefined) next.width = width
  const home = text(patch.homeUrl)
  if (home !== undefined) {
    const url = home ? toUrl(home) : ''
    if (url && (!isWebUrl(url) || url === 'about:blank')) throw new Error('Home page must be a web address.')
    next.homeUrl = url || null
  }
  return next
}

/** `tr-TR` → `tr-TR,tr,en`: Chromium ağırlıkları (`;q=`) kendisi ekliyor. */
export function acceptLanguages(lang: string): string {
  const base = lang.split('-')[0]
  return [...new Set([lang, base, 'en'])].join(',')
}

/** Varsayılan user agent'tan `Electron/…` ve uygulama adı atılıyor: siteler (ör. Google girişi) normal Chrome görsün. */
export const chromeUserAgent = (ua: string) =>
  ua
    .replace(/\s(?:Electron|share97[- ]?Desktop)\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
