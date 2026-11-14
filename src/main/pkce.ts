import { createHash, randomBytes } from 'node:crypto'
import type { ConnectError } from '../shared/types.ts'

/**
 * "Share97 ile giriş" (OAuth 2.0 authorization code + PKCE S256) için saf yardımcılar.
 * Sunucu tarafı kurallar: share97 `modules/api/connect.ts`. Callback, RFC 8252 loopback:
 * `http://127.0.0.1:<port>/callback` (sunucu http'yi yalnız yerel adreslerde kabul ediyor).
 */

/** 32 bayt → 43 haneli base64url: hem verifier (43–128) hem state için yeterli. */
export const random = () => randomBytes(32).toString('base64url')

export const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export function authorizeUrl(base: string, callback: string, verifier: string, state: string) {
  const url = new URL('/api/connect/authorize', base)
  url.search = new URLSearchParams({ callback_url: callback, code_challenge: challengeOf(verifier), code_challenge_method: 'S256', state }).toString()
  return url.toString()
}

/** Callback sorgusu → kod ya da hata. State tutmuyorsa kod hiç kullanılmıyor. */
export function parseCallback(search: URLSearchParams, expectedState: string): { code: string } | { error: ConnectError } {
  if (search.get('state') !== expectedState) return { error: 'state-mismatch' }
  const error = search.get('error')
  if (error) return { error: error === 'key-limit' ? 'key-limit' : 'access_denied' }
  const code = search.get('code')
  return code ? { code } : { error: 'invalid-code' }
}
