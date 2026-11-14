import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isWebUrl, toUrl } from './address.ts'

test('adres çubuğu', () => {
  assert.equal(toUrl('ads.google.com'), 'https://ads.google.com/')
  assert.equal(toUrl('https://adsmanager.facebook.com/adsmanager'), 'https://adsmanager.facebook.com/adsmanager')
  assert.equal(toUrl('localhost:3000/x'), 'http://localhost:3000/x')
  assert.equal(toUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080/')
  assert.equal(toUrl('meta reklam bütçesi'), 'https://www.google.com/search?q=meta%20reklam%20b%C3%BCt%C3%A7esi')
  assert.equal(toUrl('javascript:alert(1)'), 'https://www.google.com/search?q=javascript%3Aalert(1)')
  assert.equal(toUrl('file:///C:/Windows'), 'https://www.google.com/search?q=file%3A%2F%2F%2FC%3A%2FWindows')
  assert.equal(toUrl('  '), 'about:blank')
})

test('yalnız web adresleri sekmede açılır', () => {
  assert.ok(isWebUrl('https://x.com'))
  assert.ok(!isWebUrl('file:///etc/passwd'))
  assert.ok(!isWebUrl('javascript:alert(1)'))
})
