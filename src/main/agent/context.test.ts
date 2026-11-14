import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { compact, withNote } from './context.ts'

const PAGE = (n: number) => `URL: https://ads.example/campaigns\nTitle: Campaigns ${n}\n${'[1] button "x"\n'.repeat(200)}`
const read = (id: string, args: Record<string, unknown>, content: string) => [new AIMessage({ content: '', tool_calls: [{ id, name: 'read_page', args }] }), new ToolMessage({ id: `m${id}`, content, tool_call_id: id })]

test('compact: an older snapshot of the same tab shrinks to URL, title and a note; the newest stays', () => {
  const tab = { browser_id: 'b1', tab_id: '7' }
  const out = compact([...read('1', tab, PAGE(1)), ...read('2', { browser_id: 'b2' }, PAGE(2)), ...read('3', tab, PAGE(3))])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'm1')
  assert.equal(out[0].tool_call_id, '1')
  assert.match(String(out[0].content), /^URL: https:\/\/ads\.example\/campaigns\nTitle: Campaigns 1\n\[Older snapshot/)
  assert.ok(String(out[0].content).length < 300)
})

test('compact: already compacted, short and query reads are left alone', () => {
  const tab = { browser_id: 'b1' }
  const first = compact([...read('1', tab, PAGE(1)), ...read('2', tab, PAGE(2))])
  const after = [new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'read_page', args: tab }] }), first[0], ...read('2', tab, PAGE(2)), ...read('3', { ...tab, query: 'download' }, PAGE(3)), ...read('4', tab, 'URL: x\nTitle: y\n(none)')]
  assert.deepEqual(compact(after).map((m) => m.id), ['m2'])
})

test('withNote: appended after the conversation, later notes merge into the same message', () => {
  const messages = [new HumanMessage('do it')]
  const one = withNote({ messages, toolChoice: 'auto' }, 'index A')
  assert.equal(one.toolChoice, 'auto')
  assert.equal(one.messages.length, 2)
  assert.equal(one.messages[0], messages[0])
  const two = withNote(one, 'check B')
  assert.equal(two.messages.length, 2)
  assert.match(String(two.messages[1].content), /^<context from="app">\nindex A\n\ncheck B\n<\/context>/)
  assert.equal(messages.length, 1)
})
