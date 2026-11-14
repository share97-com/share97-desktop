import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withLesson } from './lessons.ts'

test('withLesson: one tidy line; the same text again only refreshes its date', () => {
  const a = withLesson([], '  Google Ads:\n export is the   download icon ', 1)
  assert.equal(a.lesson.text, 'Google Ads: export is the download icon')
  const b = withLesson(a.list, 'google ads: export is the download icon', 2)
  assert.equal(b.list.length, 1)
  assert.equal(b.lesson.id, a.lesson.id)
  assert.equal(b.lesson.ts, 2)
  assert.throws(() => withLesson([], '   '))
})

test('withLesson: the oldest lines drop when the memory is full', () => {
  let list = withLesson([], 'first').list
  for (let i = 0; i < 60; i++) list = withLesson(list, `line ${i}`).list
  assert.equal(list.length, 60)
  assert.equal(list[0].text, 'line 0')
})
