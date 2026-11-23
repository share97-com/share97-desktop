import assert from 'node:assert/strict'
import { test } from 'node:test'
import { docsHtml, refusal, rpc, type McpHost } from './mcp.ts'

const host: McpHost = {
  version: '9.9.9',
  tools: () => [{ name: 'echo', description: '', inputSchema: {} }],
  call: async (_n, a, _s, io) => {
    io.progress?.('working')
    if ((a as { shot?: boolean }).shot) io.images.push('data:image/jpeg;base64,AAAA')
    return JSON.stringify(a)
  },
}
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
  const init = (await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, host, signal)) as { result: { protocolVersion: string; serverInfo: { version: string }; instructions: string } }
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.equal(init.result.serverInfo.version, '9.9.9')
  assert.match(init.result.instructions, /list_browsers/)
  const prompts = (await rpc({ id: 6, method: 'prompts/list' }, host, signal)) as { result: { prompts: { name: string }[] } }
  const prompt = (await rpc({ id: 7, method: 'prompts/get', params: { name: prompts.result.prompts[0].name } }, host, signal)) as { result: { messages: { content: { text: string } }[] } }
  assert.match(prompt.result.messages[0].content.text, /chat_wait/)
  assert.equal(((await rpc({ id: 8, method: 'prompts/get', params: { name: 'nope' } }, host, signal)) as { error: { code: number } }).error.code, -32602)
  const list = (await rpc({ id: 2, method: 'tools/list' }, host, signal)) as { result: { tools: unknown[] } }
  assert.equal(list.result.tools.length, 1)
  const call = (await rpc({ id: 3, method: 'tools/call', params: { name: 'echo', arguments: { a: 1 } } }, host, signal)) as { result: { content: { text: string }[]; isError: boolean } }
  assert.equal(call.result.content[0].text, '{"a":1}')
  assert.equal(call.result.isError, false)
  const bad = (await rpc({ id: 4, method: 'tools/call', params: { name: 'nope' } }, host, signal)) as { error: { code: number } }
  assert.equal(bad.error.code, -32602)
  assert.equal(await rpc({ method: 'notifications/initialized' }, host, signal), null)
})

test('mcp: docs page lists every tool with its parameters, escaped, without a key', () => {
  const html = docsHtml([{ name: 'crop_image', description: 'Crop <b>', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File' }, ratio: { enum: ['1:1', '4:5'] } }, required: ['path'] } }], 9797)
  assert.match(html, /id="crop_image"/)
  assert.match(html, /Crop &lt;b&gt;/)
  assert.match(html, /<code>path<\/code> <b>\*<\/b>/)
  assert.match(html, /&quot;1:1&quot; \| &quot;4:5&quot;/)
  assert.match(html, /http:\/\/127\.0\.0\.1:9797\/mcp/)
})

test('mcp: a tool result carries screenshots as image content and reports progress', async () => {
  const seen: string[] = []
  const call = (await rpc({ id: 5, method: 'tools/call', params: { name: 'echo', arguments: { shot: true } } }, host, signal, (m) => seen.push(m))) as { result: { content: { type: string; mimeType?: string; data?: string }[] } }
  assert.deepEqual(call.result.content[1], { type: 'image', mimeType: 'image/jpeg', data: 'AAAA' })
  assert.deepEqual(seen, ['working'])
})
