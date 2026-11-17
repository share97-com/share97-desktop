import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'

/**
 * **MCP sunucusu**: dış agent'lar (Claude Code, Cursor...) uygulamanın araçlarını buradan kullanıyor.
 * Streamable HTTP'nin durumsuz hali: her POST bir JSON-RPC mesajı, cevap düz JSON.
 *
 * Güvenlik: yalnız 127.0.0.1'i dinliyor; her istek ayardaki anahtarı (Bearer) taşımak zorunda; tarayıcıdan
 * gelen (Origin başlıklı) ve Host'u yerel olmayan (DNS rebinding) istek reddediliyor. Araçlar uygulamanın
 * onay politikasıyla çalışıyor (bkz. `Agent.mcpCall`).
 */
export type McpTool = { name: string; description: string; inputSchema: object }
export type McpHost = { tools(): McpTool[]; call(name: string, args: unknown, signal: AbortSignal): Promise<string> }

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
export async function rpc(m: Rpc, host: McpHost, signal: AbortSignal): Promise<object | null> {
  if (m?.id === undefined || m.id === null) return null
  const ok = (result: object) => ({ jsonrpc: '2.0', id: m.id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } })
  try {
    if (m.method === 'initialize') {
      const asked = String(m.params?.protocolVersion ?? '')
      return ok({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'share97-desktop', version: '1' } })
    }
    if (m.method === 'ping') return ok({})
    if (m.method === 'tools/list') return ok({ tools: host.tools() })
    if (m.method === 'tools/call') {
      const name = String(m.params?.name ?? '')
      if (!host.tools().some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`)
      const text = await host.call(name, m.params?.arguments ?? {}, signal)
      return ok({ content: [{ type: 'text', text }], isError: text.startsWith('Error:') })
    }
    return fail(-32601, `Method not found: ${m.method}`)
  } catch (e) {
    return ok({ content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true })
  }
}

let server: Server | null = null
let status: { running: boolean; error?: string } = { running: false }
export const mcpStatus = () => status

/** Sunucuyu ayara göre (yeniden) kurar; `on` değilse kapatır. */
export function syncMcp(on: boolean, port: number, token: string, host: McpHost) {
  server?.close()
  server?.closeAllConnections()
  server = null
  status = { running: false }
  if (!on) return
  const s = createServer((req, res) => {
    const send = (code: number, body?: object, headers: Record<string, string> = {}) => {
      res.writeHead(code, { 'content-type': 'application/json', ...headers })
      res.end(body ? JSON.stringify(body) : undefined)
    }
    if (req.url?.split('?')[0] !== '/mcp') return send(404)
    const no = refusal(req.headers, token, port)
    if (no) return send(no, undefined, no === 401 ? { 'www-authenticate': 'Bearer' } : {})
    if (req.method !== 'POST') return send(405, undefined, { allow: 'POST' })
    const ctl = new AbortController()
    res.on('close', () => !res.writableEnded && ctl.abort())
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) req.destroy()
      else chunks.push(c)
    })
    req.on('end', async () => {
      let body: Rpc | Rpc[]
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
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
