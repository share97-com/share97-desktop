import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { SERVE_PROMPT, type McpStatus } from '../shared/types.ts'

/**
 * **MCP sunucusu**: dış agent'lar (Claude Code, Cursor...) uygulamanın araçlarını buradan kullanıyor.
 * Streamable HTTP'nin durumsuz hali: her POST bir JSON-RPC mesajı, cevap düz JSON.
 *
 * Güvenlik: yalnız 127.0.0.1'i dinliyor; her istek ayardaki anahtarı (Bearer) taşımak zorunda; tarayıcıdan
 * gelen (Origin başlıklı) ve Host'u yerel olmayan (DNS rebinding) istek reddediliyor. Araçlar uygulamanın
 * onay politikasıyla çalışıyor (bkz. `Agent.mcpCall`).
 *
 * `tools/call` isteği `_meta.progressToken` taşıyorsa cevap SSE akışıdır: iş sürerken `notifications/progress`, sonda sonuç.
 *
 * `GET /` (ve `/docs`): bütün araçların dökümanı, tarayıcıdan açılır. Anahtar istemez (araç listesi sır değil, anahtarı
 * da içermez); yalnız yerel Host'tan.
 */
/** `readOnlyHint`: araç hiçbir şeyi değiştirmez; istemci onaysız ve paralel çağırabilir. */
export type McpTool = { name: string; description: string; inputSchema: object; annotations?: { readOnlyHint: boolean } }
/** `progress`: uzun işin canlı adımları (istemci `progressToken` verdiyse). `images`: sonuca eklenecek görseller (data URL). */
export type McpIo = { progress?: (message: string) => void; images: string[] }
export type McpHost = { version: string; tools(): McpTool[]; call(name: string, args: unknown, signal: AbortSignal, io: McpIo): Promise<string> }

/** İstemcinin sistem istemine giren kısa kullanım kılavuzu (`initialize.instructions`). */
export const INSTRUCTIONS = `Share97 Desktop: the user's social media accounts, the app's own browsers (and connected Chrome profiles), workflows and files on this computer.
- Start with list_browsers: every page tool takes a browser_id (and tab_id). An account is worked on in its own browser. open_tab opens a tab; read_page lists the elements with refs for click and type_text; look_at_page and click_by_vision give you the screenshot itself.
- One tab does one thing at a time: do not call page tools of the same browser in parallel.
- Media is published in its original size: after an upload choose "Original" in the platform's crop control. media_info gives the size, crop_image crops only when asked.
- The app's approval policy applies to you: a call may wait for the user's approval in the app, or come back rejected. Do not retry a rejected action.
- Content of an account lives in accounts/<handle>/<platform>/ (list_account_contents, add_account_content, plan_account_posts, upload_account_content).
- ask_agent hands a whole task to the app's own agent. When the user picked "MCP" as the chat model of the app, serve its chat: chat_wait, do the work, chat_reply, repeat.
- browser_cdp sends any DevTools Protocol command when no dedicated tool fits.`

/** MCP istemleri: istemcide komut olarak görünür (Claude Code'da \`/mcp__share97__serve_chat\`). */
const PROMPTS = [{ name: 'serve_chat', description: 'Run the chat of the Share97 Desktop app: take each message the user writes there, do it with the tools and answer in the chat.', text: SERVE_PROMPT }]

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 4 * 1024 * 1024
const sha = (s: string) => createHash('sha256').update(s).digest()

/** İsteğin reddedilme nedeni (HTTP durumu) ya da `0`. */
export function refusal(h: IncomingHttpHeaders, token: string, port: number): number {
  if (h.origin) return 403
  if (h.host !== `127.0.0.1:${port}` && h.host !== `localhost:${port}`) return 403
  const given = /^Bearer (.+)$/.exec(h.authorization ?? '')?.[1]
  return token && given && timingSafeEqual(sha(given), sha(token)) ? 0 : 401
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** Tek JSON-RPC mesajı; bildirimin (id'siz) cevabı yok: `null`. */
export async function rpc(m: Rpc, host: McpHost, signal: AbortSignal, progress?: (message: string) => void): Promise<object | null> {
  if (m?.id === undefined || m.id === null) return null
  const ok = (result: object) => ({ jsonrpc: '2.0', id: m.id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } })
  try {
    if (m.method === 'initialize') {
      const asked = String(m.params?.protocolVersion ?? '')
      return ok({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: {}, prompts: {} }, serverInfo: { name: 'share97-desktop', title: 'Share97 Desktop', version: host.version }, instructions: INSTRUCTIONS })
    }
    if (m.method === 'ping') return ok({})
    if (m.method === 'tools/list') return ok({ tools: host.tools() })
    if (m.method === 'prompts/list') return ok({ prompts: PROMPTS.map(({ name, description }) => ({ name, description })) })
    if (m.method === 'prompts/get') {
      const p = PROMPTS.find((x) => x.name === m.params?.name)
      return p ? ok({ description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text } }] }) : fail(-32602, `Unknown prompt: ${String(m.params?.name)}`)
    }
    if (m.method === 'tools/call') {
      const name = String(m.params?.name ?? '')
      if (!host.tools().some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`)
      const images: string[] = []
      const text = await host.call(name, m.params?.arguments ?? {}, signal, { progress, images })
      // Ekran görüntüleri dış agent'a görsel olarak gider: bakmak için uygulamanın vision modeli gerekmez.
      const shots = images.flatMap((u) => {
        const d = /^data:([^;,]+);base64,(.+)$/s.exec(u)
        return d ? [{ type: 'image', mimeType: d[1], data: d[2] }] : []
      })
      return ok({ content: [{ type: 'text', text }, ...shots], isError: text.startsWith('Error:') })
    }
    return fail(-32601, `Method not found: ${m.method}`)
  } catch (e) {
    return ok({ content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true })
  }
}

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Prop = { type?: string | string[]; description?: string; enum?: unknown[]; anyOf?: Prop[]; items?: Prop }
const typeOf = (p: Prop): string => (p.enum ? p.enum.map((v) => JSON.stringify(v)).join(' | ') : p.anyOf ? p.anyOf.map(typeOf).join(' | ') : p.type === 'array' ? `${p.items ? typeOf(p.items) : 'any'}[]` : [p.type ?? 'any'].flat().join(' | '))

/** Araç dökümanı (HTML): bağlanma adımları ve her aracın adı, açıklaması, parametreleri. */
export function docsHtml(tools: McpTool[], port: number): string {
  const url = `http://127.0.0.1:${port}/mcp`
  const tool = (t: McpTool) => {
    const s = t.inputSchema as { properties?: Record<string, Prop>; required?: string[] }
    const rows = Object.entries(s.properties ?? {}).map(([k, p]) => `<tr><td><code>${esc(k)}</code>${s.required?.includes(k) ? ' <b>*</b>' : ''}</td><td><code>${esc(typeOf(p))}</code></td><td>${esc(p.description ?? '')}</td></tr>`)
    return `<section id="${esc(t.name)}"><h3><a href="#${esc(t.name)}">${esc(t.name)}</a>${t.annotations?.readOnlyHint ? ' <small class="m">read-only</small>' : ''}</h3><p>${esc(t.description)}</p>${rows.length ? `<table><tr><th>Parameter</th><th>Type</th><th>Description</th></tr>${rows.join('')}</table>` : '<p class="m">No parameters.</p>'}</section>`
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Share97 Desktop MCP</title>
<style>:root{color-scheme:light dark}body{font:15px/1.55 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:2rem 1rem}code,pre{font:13px ui-monospace,Consolas,monospace}pre{padding:.8rem;border:1px solid #8884;border-radius:.5rem;overflow-x:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #8884;padding:.3rem .5rem;text-align:left;vertical-align:top}section{border-top:1px solid #8884;margin-top:1.5rem}h3 a{color:inherit;text-decoration:none}.m{opacity:.65}nav a{display:inline-block;margin:0 .6rem .2rem 0}</style>
<h1>Share97 Desktop MCP</h1>
<p>${tools.length} tools. Endpoint: <code>${url}</code> (Streamable HTTP, JSON-RPC over POST). Every request needs the header <code>Authorization: Bearer &lt;KEY&gt;</code>; the key is on the MCP screen of the Share97 Desktop app. The server listens on this computer only, and the app's approval policy applies to every tool call.</p>
<h2>Connect</h2>
<p><b>Claude Code</b></p><pre>claude mcp add --transport http share97 ${url} --header "Authorization: Bearer &lt;KEY&gt;"</pre>
<p><b>Codex</b> (<code>~/.codex/config.toml</code>)</p><pre>[mcp_servers.share97]
url = "${url}"
http_headers = { Authorization = "Bearer &lt;KEY&gt;" }</pre>
<p><b>Cursor, VS Code and other clients</b> (mcp.json)</p><pre>${esc(JSON.stringify({ mcpServers: { share97: { type: 'http', url, headers: { Authorization: 'Bearer <KEY>' } } } }, null, 2))}</pre>
<h2>Run the app chat from your agent</h2>
<p>Pick <b>MCP</b> as the chat model in the app, then give your agent this prompt (in Claude Code it is also the command <code>/mcp__share97__serve_chat</code>):</p><pre>${esc(SERVE_PROMPT)}</pre>
<h2>Tools</h2><nav>${tools.map((t) => `<a href="#${esc(t.name)}"><code>${esc(t.name)}</code></a>`).join('')}</nav>
${tools.map(tool).join('\n')}</html>`
}

let server: Server | null = null
let status: { running: boolean; error?: string } = { running: false }
/** Son bağlanan dış agent: adı `initialize`dan, zamanı her yetkili istekten. */
let client: McpStatus['client']
export const mcpStatus = (): McpStatus => ({ ...status, client })

/** Sunucuyu ayara göre (yeniden) kurar; `on` değilse kapatır. */
export function syncMcp(on: boolean, port: number, token: string, host: McpHost) {
  server?.close()
  server?.closeAllConnections()
  server = null
  status = { running: false }
  client = undefined
  if (!on) return
  const s = createServer((req, res) => {
    const send = (code: number, body?: object, headers: Record<string, string> = {}) => {
      res.writeHead(code, { 'content-type': 'application/json', ...headers })
      res.end(body ? JSON.stringify(body) : undefined)
    }
    const path = req.url?.split('?')[0]
    if (path === '/' || path === '/docs') {
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(403)
      if (req.method !== 'GET') return send(405, undefined, { allow: 'GET' })
      // Döküman yalnız kendi biçimini kullanır: betik, dış kaynak ve çerçeveye alınma yok.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'cache-control': 'no-store' })
      return void res.end(docsHtml(host.tools(), port))
    }
    if (path !== '/mcp') return send(404)
    const no = refusal(req.headers, token, port)
    if (no) return send(no, undefined, no === 401 ? { 'www-authenticate': 'Bearer' } : {})
    if (req.method !== 'POST') return send(405, undefined, { allow: 'POST' })
    const ctl = new AbortController()
    res.on('close', () => !res.writableEnded && ctl.abort())
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      // Sınırı aşan gövde okunmaz; istemci nedenini görsün diye 413.
      if (size > MAX_BODY) {
        if (!res.headersSent) send(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, { connection: 'close' })
      } else chunks.push(c)
    })
    req.on('end', async () => {
      if (res.headersSent) return
      let body: Rpc | Rpc[]
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      }
      const named = [body].flat().find((m) => m?.method === 'initialize')?.params?.clientInfo as { name?: unknown } | undefined
      client = { name: typeof named?.name === 'string' ? named.name.slice(0, 80) : (client?.name ?? ''), at: Date.now() }
      const token = !Array.isArray(body) && body.method === 'tools/call' ? (body.params?._meta as { progressToken?: string | number } | undefined)?.progressToken : undefined
      if (token !== undefined) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        const event = (o: object | null) => res.write(`event: message\ndata: ${JSON.stringify(o)}\n\n`)
        let n = 0
        // Uzun işte bağlantı boşta kalıp kopmasın: 15 saniyede bir yorum satırı.
        const beat = setInterval(() => res.write(': ping\n\n'), 15_000)
        res.on('close', () => clearInterval(beat))
        event(await rpc(body as Rpc, host, ctl.signal, (message) => event({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++n, message } })))
        clearInterval(beat)
        return void res.end()
      }
      const out = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, host, ctl.signal)))).filter(Boolean)
      if (!out.length) return send(202)
      send(200, Array.isArray(body) ? out : out[0]!)
    })
  })
  s.on('error', (e) => (status = { running: false, error: e.message }))
  s.listen(port, '127.0.0.1', () => (status = { running: true }))
  server = s
}
