import { Bot, Boxes, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Globe, History as HistoryIcon, Info, Keyboard, KeyRound, Loader2, Monitor, Moon, Palette, Puzzle, Star, Sun, Trash2, User, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Account, BrowserInfo, BrowserSettings, Effort, HistoryEntry, PowerState, Settings as SettingsT } from '../../shared/types.ts'
import { BrowserPanel } from './Bars.tsx'
import { balanceText, planLabel } from './Billing.tsx'
import { ModelPicker } from './Chat.tsx'
import { ConfirmButton } from './Confirm.tsx'
import { api, useBookmarks, useExtensions, useLogins, useSettings, useUpdate } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { Switch } from './ui.tsx'

export type SectionId = keyof typeof t.sections
const ICONS: Record<SectionId, typeof User> = { account: User, models: Boxes, agent: Bot, appearance: Palette, browsers: Globe, extensions: Puzzle, passwords: KeyRound, history: HistoryIcon, bookmarks: Star, shortcuts: Keyboard, about: Info }

const Card = ({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) => (
  <section className="rounded-lg bg-panel p-5">
    {title && <h3 className="text-sm font-medium">{title}</h3>}
    {hint && <p className="mb-4 mt-0.5 text-xs text-muted">{hint}</p>}
    {!hint && title && <div className="mb-3" />}
    {children}
  </section>
)

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
    <div className="min-w-0">
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
    <div className="flex items-center gap-2">{children}</div>
  </div>
)

const input = 'w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand'
const button = 'rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised disabled:opacity-50'
/** IPC hatasının önündeki "Error invoking remote method…" kısmı kullanıcıya gösterilmiyor. */
const message = (e: unknown) => String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Ayarlar: solda bölümler, sağda içerik. `initial` Ctrl+H ile geçmişten açılış için. */
export function Settings({ account, browsers, onBilling, initial = 'account' }: { account: Account; browsers: BrowserInfo[]; onBilling: () => void; initial?: SectionId }) {
  const [section, setSection] = useState<SectionId>(initial)
  useEffect(() => setSection(initial), [initial])
  return (
    <div className="absolute inset-0 flex">
      <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-e border-line bg-panel p-3" aria-label={t.settings}>
        <h1 className="mb-3 px-3 pt-1 text-[2rem]">{t.settings}</h1>
        {(Object.keys(t.sections) as SectionId[]).map((id) => {
          const Icon = ICONS[id]
          return (
            <button key={id} aria-current={section === id ? 'page' : undefined} type="button" className={`flex h-9 items-center gap-3 rounded-full px-3 text-left text-sm ${section === id ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/50 hover:text-fg'}`} onClick={() => setSection(id)}>
              <Icon className={`size-4 shrink-0 ${section === id ? 'text-brand' : ''}`} strokeWidth={1.5} /> {t.sections[id]}
            </button>
          )
        })}
      </nav>
      <main className="min-w-0 flex-1 select-text overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
          <header className="border-b border-line pb-5">
            <h2 className="text-[2.6rem]">{t.sections[section]}</h2>
            <p className="mt-3 text-sm text-muted">{t.sectionHints[section]}</p>
          </header>
          {section === 'account' && <AccountSection account={account} onBilling={onBilling} />}
          {section === 'models' && <ModelsSection />}
          {section === 'agent' && <AgentSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'browsers' && <BrowsersSection browsers={browsers} />}
          {section === 'extensions' && <ExtensionsSection />}
          {section === 'passwords' && <PasswordsSection browsers={browsers} />}
          {section === 'history' && <HistorySection browsers={browsers} />}
          {section === 'bookmarks' && <BookmarksSection />}
          {section === 'shortcuts' && <ShortcutsSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </main>
    </div>
  )
}

function AccountSection({ account, onBilling }: { account: Account; onBilling: () => void }) {
  const [s, update] = useSettings()
  return (
    <>
      <Card>
        <div className="mb-4 flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-full border border-line-2 bg-raised font-display text-2xl text-fg">{(account.name || account.email || '?').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">{account.name || account.email}</p>
            <p className="truncate text-sm text-muted">{account.email}</p>
          </div>
          <div className="ms-auto text-right">
            <p className="flex items-baseline justify-end gap-1.5">
              <span className="figure text-[2.6rem]">{balanceText(account)}</span>
            </p>
            <p className="mt-1 text-xs text-muted">{planLabel(account.plan)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium" onClick={onBilling}>
            {t.nav.billing}
          </button>
          <ConfirmButton className="ms-auto whitespace-nowrap rounded-full border border-danger/40 px-3.5 py-1.5 text-sm text-danger hover:bg-danger/10" onConfirm={() => void api().auth.signOut()}>
            {t.signOut}
          </ConfirmButton>
        </div>
      </Card>
      {s && (
        <Card title={t.bg.title} hint={t.bg.hint}>
          {account.worker && (
            <Row label={t.bg.device}>
              <span className="text-sm text-muted">{account.worker.name}</span>
            </Row>
          )}
          <Row label={t.bg.background} hint={t.bg.backgroundHint}>
            <Switch on={s.background} label={t.bg.background} onChange={(on) => update({ background: on })} />
          </Row>
          <Row label={t.bg.autostart} hint={t.bg.autostartHint}>
            <Switch on={s.autostart} label={t.bg.autostart} onChange={(on) => update({ autostart: on })} />
          </Row>
          <PowerRow />
        </Card>
      )}
      <Card title={t.site.title} hint={t.site.hint}>
        <div className="flex flex-wrap gap-2">
          {(['brand', 'autoContent', 'email', 'export', 'delete'] as const).map((k) => (
            <button key={k} type="button" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 px-3 py-1.5 text-sm hover:bg-raised" onClick={() => void api().site.open('/settings')}>
              {t.site.items[k]} <ExternalLink className="size-3.5 text-muted" />
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

/** Sürekli çalışma: Windows güç ayarları (bkz. `main/power.ts`); powercfg birkaç saniye sürebiliyor. */
function PowerRow() {
  const [power, setPower] = useState<PowerState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void api().power.get().then(setPower)
  }, [])
  if (!power?.supported) return null
  const set = (on: boolean, battery: boolean) => {
    setBusy(true)
    setError(null)
    api()
      .power.set(on, battery)
      .then(setPower, (e) => setError(message(e)))
      .finally(() => setBusy(false))
  }
  return (
    <Row label={t.bg.power} hint={error ?? t.bg.powerHint}>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" className="accent-brand" checked={power.battery} disabled={busy || power.enabled} onChange={(e) => setPower({ ...power, battery: e.target.checked })} />
          {t.bg.powerBattery}
        </label>
        {busy && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
        <Switch on={power.enabled} label={t.bg.power} disabled={busy} onChange={(on) => set(on, power.battery)} />
      </div>
    </Row>
  )
}

function ModelsSection() {
  const [s, update] = useSettings()
  if (!s) return <Loader2 className="size-5 animate-spin" />
  return (
    <Card>
      <Row label={t.chatModel}>
        <ModelPicker value={s.chatModel} onChange={(id) => update({ chatModel: id })} />
      </Row>
      <Row label={t.visionModel}>
        <ModelPicker visionOnly toolsOnly={false} value={s.visionModel} onChange={(id) => update({ visionModel: id })} placeholder={t.sameAsChatVision} />
      </Row>
      <Row label={t.subagentModel}>
        <ModelPicker value={s.subagentModel} onChange={(id) => update({ subagentModel: id })} placeholder={t.sameAsChat} />
      </Row>
      {(['image', 'video', 'speech'] as const).map((c) => (
        <Row key={c} label={t[`${c}Model`]}>
          <ModelPicker category={c} toolsOnly={false} value={s[`${c}Model` as keyof SettingsT] as string | null} onChange={(id) => update({ [`${c}Model`]: id })} placeholder={t.auto} />
        </Row>
      ))}
    </Card>
  )
}

function AgentSection() {
  const [s, update] = useSettings()
  if (!s) return <Loader2 className="size-5 animate-spin" />
  return (
    <>
      <Card title={t.effort}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(t.efforts) as Effort[]).map((k) => (
            <button key={k} aria-pressed={s.effort === k} className={`rounded-lg border px-3 py-2 text-sm ${s.effort === k ? 'border-brand bg-brand/10 font-medium' : 'border-line hover:bg-raised'}`} onClick={() => update({ effort: k })}>
              {t.efforts[k]}
            </button>
          ))}
        </div>
      </Card>
      <Card title={t.approvals}>
        {(['ask', 'auto'] as const).map((v) => (
          <label key={v} className={`mb-2 flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm last:mb-0 ${s.approval === v ? 'border-brand bg-brand/10' : 'border-line hover:bg-raised'}`}>
            <input type="radio" name="approval" checked={s.approval === v} onChange={() => update({ approval: v })} className="accent-[var(--color-brand)]" />
            {v === 'ask' ? t.approvalAsk : t.approvalAuto}
          </label>
        ))}
      </Card>
      <McpCard s={s} update={update} />
    </>
  )
}

/** MCP sunucusu: dış agent'ların (Claude Code, Cursor...) bağlanacağı adres ve anahtar. */
function McpCard({ s, update }: { s: SettingsT; update: (patch: Partial<SettingsT>) => void }) {
  const [status, setStatus] = useState<{ running: boolean; error?: string }>({ running: false })
  useEffect(() => {
    const timer = setTimeout(() => void api().settings.mcpStatus().then(setStatus), 400)
    return () => clearTimeout(timer)
  }, [s.mcp, s.mcpPort, s.mcpToken])
  const url = `http://127.0.0.1:${s.mcpPort}/mcp`
  const config = JSON.stringify({ mcpServers: { share97: { type: 'http', url, headers: { Authorization: `Bearer ${s.mcpToken}` } } } }, null, 2)
  return (
    <Card title={t.mcp.title} hint={t.mcp.hint}>
      <Row label={t.mcp.enable} hint={s.mcp ? (status.error ? `${t.mcp.failed}: ${status.error}` : status.running ? url : '') : t.mcp.off}>
        <Switch on={s.mcp} label={t.mcp.enable} onChange={(on) => update({ mcp: on })} />
      </Row>
      <Row label={t.mcp.port} hint="1024-65535">
        <input
          type="number"
          min={1024}
          max={65535}
          defaultValue={s.mcpPort}
          className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-sm"
          onBlur={(e) => {
            const n = Number(e.target.value)
            // Geçersiz port yazılmış gibi kalmasın: kayıtlı değere döner.
            if (Number.isInteger(n) && n >= 1024 && n <= 65535) update({ mcpPort: n })
            else e.target.value = String(s.mcpPort)
          }}
        />
      </Row>
      {s.mcp && (
        <>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs select-all">{config}</pre>
          <div className="mt-2 flex gap-2 text-sm">
            <button type="button" className="rounded-md border border-line px-3 py-1 hover:bg-raised" onClick={() => void navigator.clipboard.writeText(config)}>
              {t.mcp.copy}
            </button>
            <button type="button" className="rounded-md border border-line px-3 py-1 hover:bg-raised" onClick={() => update({ mcpToken: '' })}>
              {t.mcp.renew}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}

/** Tema: sistem (Windows'u izler), açık, koyu. Web sayfaları da bu temayı görüyor (prefers-color-scheme). */
function AppearanceSection() {
  const [s, update] = useSettings()
  if (!s) return <Loader2 className="size-5 animate-spin" />
  const options = [
    ['system', Monitor, t.themeSystem],
    ['light', Sun, t.themeLight],
    ['dark', Moon, t.themeDark],
  ] as const
  return (
    <Card title={t.theme} hint={t.themeHint}>
      <div className="grid grid-cols-3 gap-2">
        {options.map(([value, Icon, label]) => (
          <button key={value} aria-pressed={s.theme === value} className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm ${s.theme === value ? 'border-brand bg-brand/10 font-medium' : 'border-line hover:bg-raised'}`} onClick={() => update({ theme: value })}>
            <Icon className="size-5" /> {label}
          </button>
        ))}
      </div>
    </Card>
  )
}

const LANGUAGES = ['tr-TR', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'pt-BR', 'pl-PL', 'sv-SE', 'ru-RU', 'ar-SA', 'hi-IN', 'id-ID', 'ja-JP', 'ko-KR', 'zh-CN']
const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function BrowsersSection({ browsers }: { browsers: BrowserInfo[] }) {
  const [id, setId] = useState<string | null>(browsers[0]?.id ?? null)
  const selected = browsers.find((b) => b.id === id) ?? browsers[0]
  if (!selected)
    return (
      <Card>
        <p className="text-sm text-muted">{t.noBrowsers}</p>
      </Card>
    )
  return (
    <div className="grid gap-5 md:grid-cols-[200px_1fr]">
      <div className="space-y-1">
        {browsers.map((b) => (
          <button key={b.id} aria-current={b.id === selected.id} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${b.id === selected.id ? 'bg-raised font-medium' : 'text-muted hover:bg-raised/60'}`} onClick={() => setId(b.id)}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            {b.settings.proxy && <span className="rounded bg-panel px-1 text-[10px] text-muted">proxy</span>}
            {b.settings.language && <span className="rounded bg-panel px-1 text-[10px] text-muted">{b.settings.language}</span>}
          </button>
        ))}
      </div>
      <div className="space-y-5">
        <BrowserSettingsForm key={selected.id} browser={selected} />
        <Card>
          <BrowserPanel key={selected.id} browser={selected} onDone={() => {}} />
        </Card>
      </div>
    </div>
  )
}

function BrowserSettingsForm({ browser }: { browser: BrowserInfo }) {
  const [form, setForm] = useState<BrowserSettings>(browser.settings)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null)
  const set = (k: keyof BrowserSettings) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value || null }))
  const save = async () => {
    try {
      setForm(await api().browsers.configure(browser.id, { language: form.language ?? '', proxy: form.proxy ?? '', userAgent: form.userAgent ?? '', homeUrl: form.homeUrl ?? '' } as never))
      setStatus({ kind: 'ok', text: t.saved })
    } catch (e) {
      setStatus({ kind: 'error', text: message(e) })
    }
  }
  const test = async () => {
    setStatus({ kind: 'busy', text: t.testing })
    try {
      setStatus({ kind: 'ok', text: t.publicIp(await api().browsers.testConnection(browser.id)) })
    } catch (e) {
      setStatus({ kind: 'error', text: message(e) })
    }
  }
  return (
    <Card title={browser.name}>
      <div className="space-y-4">
        <label className="block text-sm">
          {t.language}
          <span className="block text-xs text-muted">{t.languageHint}</span>
          <select value={form.language ?? ''} onChange={set('language')} className={`${input} mt-1`}>
            <option value="">{t.systemLanguage}</option>
            {[...new Set([...(form.language ? [form.language] : []), ...LANGUAGES])].map((code) => (
              <option key={code} value={code}>
                {languageName(code)} ({code})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t.proxy}
          <span className="block text-xs text-muted">{t.proxyHint}</span>
          <input value={form.proxy ?? ''} onChange={set('proxy')} placeholder="socks5://127.0.0.1:1080" spellCheck={false} className={`${input} mt-1 font-mono`} />
        </label>
        <label className="block text-sm">
          {t.homePage}
          <input value={form.homeUrl ?? ''} onChange={set('homeUrl')} placeholder={t.homePageHint} spellCheck={false} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm">
          {t.userAgent}
          <input value={form.userAgent ?? ''} onChange={set('userAgent')} placeholder={t.userAgentHint} spellCheck={false} className={`${input} mt-1 font-mono text-xs`} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary rounded-full px-4 py-2 text-sm font-medium" onClick={() => void save()}>
            {t.save}
          </button>
          <button className={button} onClick={() => void test()} disabled={status?.kind === 'busy'}>
            {t.testConnection}
          </button>
          {status && (
            <span role="status" className={`text-sm ${status.kind === 'error' ? 'text-danger' : status.kind === 'ok' ? 'text-ok' : 'text-muted'}`}>
              {status.kind === 'busy' && <Loader2 className="mr-1 inline size-3.5 animate-spin" />}
              {status.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

function HistorySection({ browsers }: { browsers: BrowserInfo[] }) {
  const [q, setQ] = useState('')
  const [browserId, setBrowserId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ items: HistoryEntry[]; total: number; pageSize: number }>({ items: [], total: 0, pageSize: 50 })
  const [version, setVersion] = useState(0)
  useEffect(() => setPage(0), [q, browserId])
  useEffect(() => {
    const timer = setTimeout(() => void api().history.page(q, browserId, page).then(setData), 150)
    return () => clearTimeout(timer)
  }, [q, browserId, page, version])
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const from = data.total ? page * data.pageSize + 1 : 0
  const to = Math.min(data.total, (page + 1) * data.pageSize)

  const openEntry = async (e: HistoryEntry) => {
    const b = api().browsers
    // Tarayıcısı silinmişse kaydın adıyla yeni bir tarayıcıda açılıyor.
    if (browsers.some((x) => x.id === e.browserId)) {
      await b.openTab(e.browserId, e.url)
      await b.activate(e.browserId)
    } else await b.create(e.browserName, e.url)
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.historySearch} className={`${input} min-w-48 flex-1`} />
        <select value={browserId ?? ''} onChange={(e) => setBrowserId(e.target.value || null)} className="rounded-lg border border-line bg-raised px-2 text-sm">
          <option value="">{t.allBrowsers}</option>
          {browsers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <ConfirmButton className="flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10" onConfirm={() => void api().history.clear().then(() => setVersion((v) => v + 1))}>
          <Trash2 className="size-4" /> {t.clearHistory}
        </ConfirmButton>
      </div>
      {data.items.length ? (
        <ul className="divide-y divide-line">
          {data.items.map((e, i) => (
            <li key={`${e.ts}-${i}`} className="group flex items-center gap-3 py-2">
              <span className="w-32 shrink-0 text-xs tabular-nums text-muted">{dateTime.format(e.ts)}</span>
              <span className="max-w-28 shrink-0 truncate rounded-full px-2 py-0.5 text-xs" style={{ background: `${browsers.find((b) => b.id === e.browserId)?.color ?? '#888888'}22` }}>
                {e.browserName}
              </span>
              <button className="min-w-0 flex-1 text-left" onClick={() => void openEntry(e)} title={t.openInBrowser}>
                <p className="truncate text-sm">{e.title}</p>
                <p className="truncate text-xs text-muted">{e.url}</p>
              </button>
              <button className="rounded p-1 text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100" aria-label={t.openInBrowser} title={t.openInBrowser} onClick={() => void openEntry(e)}>
                <ExternalLink className="size-4" />
              </button>
              <button className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={t.deleteEntry} title={t.deleteEntry} onClick={() => void api().history.remove(e.ts, e.url).then(() => setVersion((v) => v + 1))}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t.noHistory}</p>
      )}
      {data.total > data.pageSize && (
        <nav className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm" aria-label={t.page}>
          <span className="tabular-nums text-muted">{t.pageOf(from, to, data.total)}</span>
          <div className="flex items-center gap-1">
            <button className={button} disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t.previous}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 tabular-nums">
              {page + 1} / {pages}
            </span>
            <button className={button} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t.next}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </nav>
      )}
    </Card>
  )
}

function PasswordsSection({ browsers }: { browsers: BrowserInfo[] }) {
  const list = useLogins()
  return (
    <Card hint={t.passwordsNote}>
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((l) => {
            const b = browsers.find((x) => x.id === l.browserId)
            return (
              <li key={l.id} className="group flex items-center gap-3 py-2">
                <KeyRound className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{l.origin}</p>
                  <p className="truncate text-xs text-muted">
                    {l.username}, {b?.name ?? '?'}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted">••••••••</span>
                <ConfirmButton className="rounded p-1 text-muted hover:text-danger" armedClassName="bg-danger/15 !text-danger" label={t.delete} onConfirm={() => void api().passwords.remove(l.id)}>
                  <X className="size-4" />
                </ConfirmButton>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t.noLogins}</p>
      )}
    </Card>
  )
}

function ExtensionsSection() {
  const list = useExtensions()
  const [error, setError] = useState<string | null>(null)
  return (
    <Card hint={t.extensionHint}>
      {list.length ? (
        <ul className="mb-4 divide-y divide-line">
          {list.map((x) => (
            <li key={x.path} className="group flex items-center gap-3 py-2">
              <Puzzle className="size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {x.name} <span className="text-xs text-muted">{x.version}</span>
                </p>
                <p className={`truncate text-xs ${x.error ? 'text-danger' : 'text-muted'}`}>{x.error ?? x.path}</p>
              </div>
              <ConfirmButton className={button} onConfirm={() => void api().extensions.remove(x.path)}>
                {t.remove}
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">{t.noExtensions}</p>
      )}
      <button className="btn-primary rounded-full px-4 py-2 text-sm font-medium" onClick={() => void api().extensions.add().then(() => setError(null), (e) => setError(message(e)))}>
        {t.addExtension}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  )
}

function BookmarksSection() {
  const list = useBookmarks()
  return (
    <Card>
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((b) => (
            <li key={b.id} className="group flex items-center gap-3 py-2">
              <Star className="size-4 shrink-0 text-warn" />
              <div className="min-w-0 flex-1 select-text">
                <p className="truncate text-sm">{b.title}</p>
                <p className="truncate text-xs text-muted">{b.url}</p>
              </div>
              <button className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={t.bookmarkRemove} title={t.bookmarkRemove} onClick={() => void api().bookmarks.remove(b.id)}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t.noBookmarks}</p>
      )}
    </Card>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+N', 'Yeni sohbet / New chat'],
  ['Ctrl+T', 'Yeni sekme / New tab'],
  ['Ctrl+Shift+N', 'Yeni tarayıcı / New browser'],
  ['Ctrl+W', 'Sekmeyi kapat / Close tab'],
  ['Ctrl+Shift+T', 'Kapatılanı aç / Reopen closed tab'],
  ['Ctrl+Tab, Ctrl+1..9', 'Sekme değiştir / Switch tab'],
  ['Ctrl+L', 'Adres çubuğu / Address bar'],
  ['Ctrl+R, F5', 'Yenile / Reload'],
  ['Alt+← / Alt+→', 'Geri / İleri'],
  ['Ctrl+F', 'Sayfada bul / Find'],
  ['Ctrl+D', 'Yer imi / Bookmark'],
  ['Ctrl+H', 'Geçmiş / History'],
  ['Ctrl+J', 'İndirilenler / Downloads'],
  ['Ctrl+P', 'Yazdır / Print'],
  ['Ctrl + / - / 0', 'Yakınlaştır / Zoom'],
  ['F11', 'Tam ekran / Full screen'],
  ['F12, Ctrl+Shift+I', 'Geliştirici araçları / DevTools'],
]

function ShortcutsSection() {
  return (
    <Card>
      <dl className="grid gap-x-8 sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys} className="flex justify-between gap-3 border-b border-line py-2">
            <dt className="text-sm text-muted">{label}</dt>
            <dd>
              <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function AboutSection() {
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useUpdate()
  const [checking, setChecking] = useState(false)
  useEffect(() => void api().app.version().then(setVersion), [])
  const status =
    update.status === 'downloading'
      ? t.updateDownloading(update.version ?? '', update.percent ?? 0)
      : update.status === 'ready'
        ? t.updateReady(update.version ?? '')
        : update.status === 'error'
          ? `${t.updateError}: ${update.error ?? ''}`
          : update.status === 'checking' || checking
            ? '…'
            : t.upToDate
  return (
    <>
      <Card>
        <Row label="Share97 Desktop" hint={status}>
          <span className="font-mono text-sm">{version}</span>
          <button
            className={button}
            disabled={checking}
            onClick={() => {
              setChecking(true)
              void api().app.update().then(setUpdate).finally(() => setChecking(false))
            }}
          >
            {t.checkUpdates}
          </button>
        </Row>
      </Card>
      <Card title={t.workspace}>
        <button className={`${button} flex items-center gap-2`} onClick={() => void api().files.openFolder()}>
          <FolderOpen className="size-4" /> share97-desktop
        </button>
      </Card>
    </>
  )
}
