import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirOf, pickLocale, sitePath } from './locales.ts'

test('pickLocale: bölge ve alt çizgi atılıyor, tanınmayan İngilizce', () => {
  assert.equal(pickLocale('tr-TR'), 'tr')
  assert.equal(pickLocale('pt_BR'), 'pt')
  assert.equal(pickLocale('ZH-cn'), 'en')
  assert.equal(pickLocale(undefined), 'en')
})

test('sitePath: İngilizce öneksiz, kök yol önekin kendisi', () => {
  assert.equal(sitePath('en', '/calendar'), '/calendar')
  assert.equal(sitePath('tr', '/calendar'), '/tr/calendar')
  assert.equal(sitePath('ar', '/'), '/ar')
  assert.equal(sitePath('de', 'evil'), '/de')
  assert.equal(dirOf('ar'), 'rtl')
})
