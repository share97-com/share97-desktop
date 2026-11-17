import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refusal, rpc, type McpHost } from './mcp.ts'

const host: McpHost = { tools: () => [{ name: 'echo', description: '', inputSchema: {} }], call: async (_n, a) => JSON.stringify(a) }
const signal = new AbortController().signal

test('mcp: only local, token-bearing, non-browser requests pass', () => {
  const ok = { host: '127.0.0.1:9797', authorization: 'Bearer secret' }
  assert.equal(refusal(ok, 'secret', 9797), 0)
  assert.equal(refusal({ ...ok, authorization: 'Bearer wrong' }, 'secret', 9797), 401)
  assert.equal(refusal({ host: ok.host }, 'secret', 9797), 401)
  assert.equal(refusal(ok, '', 9797), 401)
  assert.equal(refusal({ ...ok, origin: 'https://evil.example' }, 'secret', 9797), 403)
  assert.equal(refusal({ ...ok, host: 'evil.example:9797' }, 'secret', 9797), 403)
})

test('mcp: initialize, list, call, unknown tool, notification', async () => {
  const init = (await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, host, signal)) as { result: { protocolVersion: string } }
  assert.equal(init.result.protocolVersion, '2025-06-18')
  const list = (await rpc({ id: 2, method: 'tools/list' }, host, signal)) as { result: { tools: unknown[] } }
  assert.equal(list.result.tools.length, 1)
  const call = (await rpc({ id: 3, method: 'tools/call', params: { name: 'echo', arguments: { a: 1 } } }, host, signal)) as { result: { content: { text: string }[]; isError: boolean } }
  assert.equal(call.result.content[0].text, '{"a":1}')
  assert.equal(call.result.isError, false)
  const bad = (await rpc({ id: 4, method: 'tools/call', params: { name: 'nope' } }, host, signal)) as { error: { code: number } }
  assert.equal(bad.error.code, -32602)
  assert.equal(await rpc({ method: 'notifications/initialized' }, host, signal), null)
})
