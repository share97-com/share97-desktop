import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { stuck, unfinished } from './guard.ts'

let n = 0
const call = (name: string, args: Record<string, unknown>, result: string) => {
  const id = String(++n)
  return [new AIMessage({ content: '', tool_calls: [{ id, name, args }] }), new ToolMessage({ content: result, tool_call_id: id })]
}

test('stuck: the same call with the same result three times, also with other calls in between', () => {
  const poll = () => call('list_downloads', {}, 'No downloads.')
  assert.equal(stuck([...poll(), ...call('read_page', { browser_id: 'a' }, 'URL: x'), ...poll()]), null)
  assert.match(stuck([...poll(), ...call('read_page', { browser_id: 'a' }, 'URL: x'), ...poll(), ...call('look_at_page', {}, 'A menu'), ...poll()])!, /list_downloads/)
})

test('stuck: a changing result or plain scrolling is progress', () => {
  assert.equal(stuck([1, 2, 3].flatMap((i) => call('read_page', { browser_id: 'a' }, `URL: page ${i}`))), null)
  assert.equal(stuck([1, 2, 3, 4].flatMap(() => call('scroll', { direction: 'down' }, 'Scrolled.'))), null)
})

test('stuck: four failed calls in a row, whatever the tool', () => {
  const fails = [call('click', { ref: 1 }, 'Error: Element [1] not found.'), call('click_by_vision', { target: 'a' }, 'Not found on the visible screen: "a".'), call('wait_for_text', { text: 'x' }, 'Timed out: text not found.'), call('click', { ref: 2 }, 'Error: Element [2] not found.')]
  assert.equal(stuck(fails.slice(0, 3).flat()), null)
  assert.match(stuck(fails.flat())!, /all failed/)
  assert.equal(stuck([...fails.slice(0, 3).flat(), ...call('read_page', {}, 'URL: x')]), null)
})

test('unfinished: an empty answer or open plan items send the model back once', () => {
  const done = new AIMessage('Here is the report.')
  assert.equal(unfinished(done, [{ content: 'Collect data', status: 'completed' }]), null)
  assert.match(unfinished(done, [{ content: 'Collect data', status: 'completed' }, { content: 'Write the PDF', status: 'in_progress' }])!, /1 unfinished item\(s\): "Write the PDF"/)
  assert.match(unfinished(new AIMessage(''), [])!, /empty/)
  // Araç çağıran mesaj bitiş değil; kullanıcı mesajı da değil.
  assert.equal(unfinished(new AIMessage({ content: '', tool_calls: [{ id: 'x', name: 'read_page', args: {} }] }), [{ content: 'a', status: 'pending' }]), null)
  assert.equal(unfinished(new HumanMessage('hi'), []), null)
})
