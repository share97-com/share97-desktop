import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TOPICS, planRound, randomTopic } from './auto.ts'

test('konu: yazılan listeden, boşsa varsayılandan', () => {
  assert.equal(randomTopic('  a \n\n b ', () => 0.99), 'b')
  assert.equal(randomTopic('', () => 0), DEFAULT_TOPICS[0])
})

test('tur: dil başına bir iş, hesaplar turn kadar kaydırılmış, bilinmeyen dil atlanır', () => {
  const jobs = planRound({ locales: ['tr', 'xx', 'en', 'de'], topics: 'k', tone: 'v', turn: 1 }, ['a', 'b'], () => 0)
  assert.deepEqual(jobs.map((j) => `${j.locale}:${j.accountId}`), ['tr:b', 'en:a', 'de:b'])
  assert.equal(jobs[0].tone, 'v')
  assert.deepEqual(planRound({ locales: ['tr'], topics: '', tone: '', turn: 0 }, []), [])
})
