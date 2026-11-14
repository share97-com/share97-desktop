import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeUrl, challengeOf, parseCallback, random } from './pkce.ts'

test('verifier ve challenge Connect kurallarına uyuyor', () => {
  const v = random()
  assert.match(v, /^[A-Za-z0-9._~-]{43,128}$/)
  assert.match(challengeOf(v), /^[A-Za-z0-9_-]{43}$/)
  // RFC 7636 Ek B örneği
  assert.equal(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('authorize adresi gerekli parametreleri taşıyor', () => {
  const u = new URL(authorizeUrl('https://share97.com', 'http://127.0.0.1:5000/callback', 'x'.repeat(43), 'st'))
  assert.equal(u.pathname, '/api/connect/authorize')
  assert.equal(u.searchParams.get('callback_url'), 'http://127.0.0.1:5000/callback')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('state'), 'st')
  assert.equal(u.searchParams.get('code_challenge'), challengeOf('x'.repeat(43)))
})

test('callback ayrıştırma', () => {
  const q = (s: string) => new URLSearchParams(s)
  assert.deepEqual(parseCallback(q('code=abc&state=s1'), 's1'), { code: 'abc' })
  assert.deepEqual(parseCallback(q('code=abc&state=evil'), 's1'), { error: 'state-mismatch' })
  assert.deepEqual(parseCallback(q('code=abc'), 's1'), { error: 'state-mismatch' })
  assert.deepEqual(parseCallback(q('error=key-limit&state=s1'), 's1'), { error: 'key-limit' })
  assert.deepEqual(parseCallback(q('error=access_denied&state=s1'), 's1'), { error: 'access_denied' })
  assert.deepEqual(parseCallback(q('state=s1'), 's1'), { error: 'invalid-code' })
})
