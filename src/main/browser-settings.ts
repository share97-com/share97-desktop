import type { BrowserSettings } from '../shared/types.ts'
import { isWebUrl, toUrl } from './address.ts'

/** Tarayıcı başına ayarların ilk hali: sistem dili, doğrudan bağlantı, varsayılan user agent. */
export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = { language: null, proxy: null, userAgent: null, homeUrl: null }

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
