import { BookOpen, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SERVE_PROMPT, type McpStatus } from '../../shared/types.ts'
import { api, useSettings } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, Page, primary, Switch } from './ui.tsx'

const m = t.mcp

/** Kopyalanabilir ayar bloğu: bir istemcinin (Claude Code, Codex...) bağlanma komutu ya da dosyası. */
function Snippet({ title, where, code }: { title: string; where?: string; code: string }) {
  return (
    <div className="border-t border-line pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {where && <code className="text-xs text-muted">{where}</code>}
        <button type="button" className={`${button} ms-auto`} onClick={() => void navigator.clipboard.writeText(code).then(() => toast(m.copied))}>
          <Copy className="size-3.5" /> {m.copy}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs select-all">{code}</pre>
    </div>
  )
}

/**
 * **MCP ekranı.** Uygulamanın araçlarını dış agent'lara (Claude Code, Codex, Claude Desktop, Cursor...) açan yerel sunucu:
 * aç/kapa, port, anahtar, araç dökümanı (tarayıcıda) ve her istemci için hazır bağlanma ayarı.
 */
export function McpView() {
  const [s, update] = useSettings()
  const [status, setStatus] = useState<McpStatus>({ running: false })
  useEffect(() => {
    // Durum ve son bağlanan agent: ayar değişince hemen, sonra ekran açıkken 5 saniyede bir.
    const read = () => void api().settings.mcpStatus().then(setStatus)
    const first = setTimeout(read, 400)
    const timer = setInterval(read, 5000)
    return () => (clearTimeout(first), clearInterval(timer))
  }, [s?.mcp, s?.mcpPort, s?.mcpToken])
  if (!s) return <Loader2 className="m-8 size-5 animate-spin" />
  const url = `http://127.0.0.1:${s.mcpPort}/mcp`
  const auth = `Bearer ${s.mcpToken}`
  return (
    <Page
      title={m.title}
      hint={m.hint}
      actions={
        <button type="button" className={primary} disabled={!status.running} onClick={() => void api().settings.mcpDocs()}>
          <BookOpen className="size-4" /> {m.docs}
        </button>
      }
    >
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Switch on={s.mcp} label={m.enable} onChange={(on) => update({ mcp: on })} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{m.enable}</p>
            <p className={`text-xs ${s.mcp && status.error ? 'text-danger' : 'text-muted'}`}>{s.mcp ? (status.error ? `${m.failed}: ${status.error}` : status.running ? url : '') : m.off}</p>
            {s.mcp && status.client && <p className="text-xs text-ok">{m.lastClient}: {status.client.name || 'MCP'}, {dateTime.format(status.client.at)}</p>}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            {m.port}
            <input
              type="number"
              min={1024}
              max={65535}
              defaultValue={s.mcpPort}
              className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-sm text-fg"
              onBlur={(e) => {
                const n = Number(e.target.value)
                // Geçersiz port yazılmış gibi kalmasın: kayıtlı değere döner.
                if (Number.isInteger(n) && n >= 1024 && n <= 65535) update({ mcpPort: n })
                else e.target.value = String(s.mcpPort)
              }}
            />
          </label>
          {s.mcp && (
            <button type="button" className={button} onClick={() => update({ mcpToken: '' })}>
              <RefreshCw className="size-3.5" /> {m.renew}
            </button>
          )}
        </div>
      </Card>
      {s.mcp && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-[1.75rem]">{m.connect}</h2>
            <p className="mt-1 text-xs text-muted">{m.connectHint}</p>
          </div>
          <Snippet title="Claude Code" code={`claude mcp add --transport http share97 ${url} --header "Authorization: ${auth}"`} />
          <Snippet title="Codex" where="~/.codex/config.toml" code={`[mcp_servers.share97]\nurl = "${url}"\nhttp_headers = { Authorization = "${auth}" }`} />
          <Snippet
            title="Claude Desktop"
            where="claude_desktop_config.json"
            code={JSON.stringify({ mcpServers: { share97: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${SHARE97_AUTH}'], env: { SHARE97_AUTH: auth } } } }, null, 2)}
          />
          <p className="border-t border-line pt-4 text-xs text-muted">{m.model}</p>
          <Snippet title={m.serve} code={SERVE_PROMPT} />
          <Snippet title={m.other} where="mcp.json" code={JSON.stringify({ mcpServers: { share97: { type: 'http', url, headers: { Authorization: auth } } } }, null, 2)} />
        </Card>
      )}
    </Page>
  )
}
