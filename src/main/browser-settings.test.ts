import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptLanguages, chromeUserAgent, cleanWidth, DEFAULT_BROWSER_SETTINGS, mobileUserAgent, normalize, pageWidth, parseProxy } from './browser-settings.ts'

test('görünüm: varsayılan mobil, genişlik sınırlı, sayfa alana sığıyor', () => {
  assert.equal(DEFAULT_BROWSER_SETTINGS.layout, 'mobile')
  const s = normalize(DEFAULT_BROWSER_SETTINGS, { layout: 'desktop', width: '1024' })
  assert.deepEqual([s.layout, s.width], ['desktop', 1024])
  assert.equal(normalize(s, { width: '' }).width, null)
  assert.throws(() => normalize(s, { layout: 'tablet' }), /mobile or desktop/)
  assert.deepEqual([cleanWidth(10), cleanWidth(99_999), cleanWidth('x')], [320, 2560, undefined])
  assert.equal(pageWidth('mobile', null, 1600), 390)
  assert.equal(pageWidth('desktop', null, 1600), 1600)
  assert.equal(pageWidth('desktop', 1024, 800), 800, 'alandan geniş olamaz')
  assert.equal(mobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.80 Safari/537.36'), 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')
})

test('proxy biçimi', () => {
  assert.deepEqual(parseProxy('socks5://127.0.0.1:1080'), { rules: 'socks5://127.0.0.1:1080' })
  assert.deepEqual(parseProxy(' SOCKS5://proxy.example.com:9050/ '), { rules: 'socks5://proxy.example.com:9050' })
  assert.deepEqual(parseProxy('http://u%40x:p%3Ass@10.0.0.1:8080'), { rules: 'http://10.0.0.1:8080', username: 'u@x', password: 'p:ss' })
  assert.throws(() => parseProxy('socks5://user:pass@host:1080'), /not supported/)
  assert.throws(() => parseProxy('ftp://host:21'))
  assert.throws(() => parseProxy('socks5://host'))
  assert.throws(() => parseProxy('socks5://host:99999'), /port/)
})

test('ayar yaması', () => {
  const s = normalize(DEFAULT_BROWSER_SETTINGS, { language: 'tr-TR', proxy: 'socks5://1.2.3.4:1080', homeUrl: 'ads.google.com' })
  assert.equal(s.language, 'tr-TR')
  assert.equal(s.proxy, 'socks5://1.2.3.4:1080')
  assert.equal(s.homeUrl, 'https://ads.google.com/')
  assert.equal(normalize(s, { proxy: '' }).proxy, null)
  assert.equal(normalize(s, { language: null }).language, null)
  assert.equal(normalize(s, {}).proxy, 'socks5://1.2.3.4:1080')
  assert.throws(() => normalize(s, { language: 'Türkçe' }))
  assert.throws(() => normalize(s, { proxy: 'x' }))
})

test('dil ve user agent', () => {
  assert.equal(acceptLanguages('tr-TR'), 'tr-TR,tr,en')
  assert.equal(acceptLanguages('en-US'), 'en-US,en')
  assert.equal(acceptLanguages('de'), 'de,en')
  assert.equal(
    chromeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) share97-desktop/0.2.0 Chrome/140.0.0.0 Electron/45.2.3 Safari/537.36'),
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  )
  assert.equal(chromeUserAgent('Mozilla/5.0 (KHTML, like Gecko) share97Desktop/0.2.0 Chrome/156.0 Safari/537.36'), 'Mozilla/5.0 (KHTML, like Gecko) Chrome/156.0 Safari/537.36')
})
