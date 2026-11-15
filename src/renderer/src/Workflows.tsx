import { ExternalLink, FolderOpen, Loader2, Monitor, Play, Plus, RefreshCw, Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ContentSettings, LocalContent } from '../../shared/contents.ts'
import type { Overview } from '../../shared/types.ts'
import { api, errorText, useConnections } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, iconButton, input, Page, Pill, PlatformBadge, primary, serverError, Switch } from './ui.tsx'

const when = (v: string | number | null) => (v ? dateTime.format(new Date(v)) : t.never)

/**
 * **Akışlar.** Sunucudaki akışlar (web ile aynı kayıt), bu cihazla eşitlenir (kendiliğinden ve "Eşitle"
 * düğmesiyle): aç/durdur, çalıştıracak cihazı seç, şimdi çalıştır; içerik ayarları (kaynak: site ya da bu
 * bilgisayardaki klasör, sıra, tekrar) ve yerel içerik klasörleri; sıradaki yuvalar, son çalışmaların
 * sonucu ve hesaba bağlı bütün cihazlar (Worker'lar). Düzenleme sitenin düzenleyicisinde.
 */
export function Workflows() {
  const state = useConnections()
  const [busy, setBusy] = useState<string | null>(null)
  const ov = state?.overview
  const act = (key: string, p: Promise<unknown>, done?: (v: unknown) => void) => {
    setBusy(key)
    void p
      .then(done)
      .catch((e) => toast(serverError(errorText(e)), 'error'))
      .finally(() => setBusy(null))
  }

  return (
    <Page
      title={t.flows.title}
      hint={t.flows.hint}
      actions={
        <>
          {state?.syncedAt ? <span className="text-xs tabular-nums text-muted">{t.flows.synced(when(state.syncedAt))}</span> : null}
          <button className={button} disabled={busy === 'refresh'} onClick={() => act('refresh', api().connections.refresh(true), () => toast(t.flows.syncDone))}>
            <RefreshCw className={`size-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> {t.flows.sync}
          </button>
          <button className={button} disabled={busy === 'local'} onClick={() => act('local', api().workflows.createLocal(t.flows.localName), () => toast(t.flows.localCreated))}>
            <FolderOpen className="size-4" /> {t.flows.createLocal}
          </button>
          <button className={primary} onClick={() => void api().site.open('/workflows')}>
            <Plus className="size-4" /> {t.flows.create}
          </button>
        </>
      }
    >
      {state?.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {serverError(state.error)}
        </p>
      )}
      {!ov ? (
        !state?.error && <Loader2 className="size-5 animate-spin text-muted" />
      ) : (
        <>
          {!ov.workflows.length && (
            <Card className="text-center">
              <p className="text-sm text-muted">{t.flows.empty}</p>
            </Card>
          )}
          <div className="space-y-2">
            {ov.workflows.map((w) => (
              <div key={w.id} className="rounded-lg border border-line bg-panel/80 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Switch on={w.active} label={w.active ? t.flows.active : t.flows.paused} disabled={busy === w.id} onChange={(on) => act(w.id, api().workflows.setActive(w.id, on))} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="truncate text-xs text-muted">
                    {w.active ? t.flows.active : t.flows.paused}, {t.flows.queued(w.queued)}, {t.flows.lastRun}: {when(w.lastRunAt)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  {t.flows.worker}
                  <select className={`${input} w-44 py-1`} value={w.workerId ?? ''} disabled={busy === w.id} onChange={(e) => act(w.id, api().workflows.setWorker(w.id, e.target.value || null))}>
                    <option value="">{t.flows.workerAuto}</option>
                    {ov.workers.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                        {k.id === ov.me ? ` (${t.thisDevice})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={button}
                  disabled={busy === w.id}
                  onClick={() =>
                    act(w.id, api().workflows.run(w.id), (r) => {
                      const out = r as { status: string; error: string | null }
                      toast(`${w.name}: ${t.flows.runStatus[out.status] ?? out.status}${out.error ? `, ${out.error}` : ''}`, out.status === 'failed' ? 'error' : 'ok')
                    })
                  }
                >
                  {busy === w.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} {t.flows.runNow}
                </button>
                <button className={iconButton} title={t.flows.openEditor} aria-label={t.flows.openEditor} onClick={() => void api().site.open(`/workflows/${w.slug}`)}>
                  <ExternalLink className="size-4" />
                </button>
              </div>
              <ContentRow w={w} ov={ov} syncedAt={state?.syncedAt ?? 0} disabled={busy === w.id} onChange={(content, workerId) => act(w.id, api().workflows.setContent(w.id, content, workerId))} />
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-[1.75rem]">{t.flows.upcoming}</h2>
              {!ov.upcoming.length && <p className="text-sm text-muted">{t.flows.noUpcoming}</p>}
              <ul className="space-y-1.5 text-sm">
                {ov.upcoming.slice(0, 10).map((s, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{when(s.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-3 text-[1.75rem]">{t.flows.runs}</h2>
              {!ov.runs.length && <p className="text-sm text-muted">{t.flows.noRuns}</p>}
              <ul className="space-y-2 text-sm">
                {ov.runs.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center gap-2">
                      <Pill tone={r.status === 'success' ? 'ok' : r.status === 'failed' ? 'bad' : r.status === 'running' ? 'warn' : 'muted'}>{t.flows.runStatus[r.status] ?? r.status}</Pill>
                      <span className="min-w-0 flex-1 truncate">
                        {r.workflow}
                        {r.handle && <span className="text-muted">, @{r.handle}</span>}
                      </span>
                      {r.permalink && (
                        <a className="shrink-0 text-brand" href={r.permalink} target="_blank" rel="noreferrer" aria-label={r.permalink}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-muted">{when(r.startedAt)}</span>
                    </div>
                    {r.error && <p className="mt-0.5 line-clamp-2 text-xs text-danger">{r.error}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <h2 className="text-[1.75rem]">{t.flows.devices}</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted">{t.flows.devicesHint}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {ov.workers.map((k) => (
                <Device key={k.id} icon={<Monitor className="size-4" />} name={k.name} mine={k.id === ov.me} online={k.online} seen={k.lastUsedAt} accounts={k.accounts} flows={k.workflows.length} tasks={k.tasks?.length ?? 0} />
              ))}
              {(ov.server.accounts.length > 0 || ov.server.workflows.length > 0) && <Device icon={<Server className="size-4" />} name={t.flows.serverAccounts} mine={false} online seen={null} accounts={ov.server.accounts} flows={ov.server.workflows.length} tasks={0} />}
            </div>
          </Card>
        </>
      )}
    </Page>
  )
}

const STATUS_TONE = { pending: 'muted', publishing: 'warn', published: 'ok', failed: 'bad' } as const

/**
 * Akışın içerik ayarları: kaynak (sitedeki İçerikler / bu bilgisayardaki klasör), paylaşım sırası ve tekrar.
 * Kaynak bu cihazın klasörüyse içerikler (`workflow/<kimlik>/contents/1, 2, 3…`) durumlarıyla listelenir.
 */
function ContentRow({ w, ov, syncedAt, disabled, onChange }: { w: Overview['workflows'][number]; ov: Overview; syncedAt: number; disabled: boolean; onChange(content: ContentSettings, workerId?: string): void }) {
  const c = w.content
  const here = c.source === 'local' && w.workerId === ov.me
  const [items, setItems] = useState<LocalContent[] | null>(null)
  useEffect(() => {
    if (!here) return setItems(null)
    void api()
      .workflows.contents(w.id)
      .then(setItems, () => setItems([]))
  }, [here, w.id, syncedAt])
  const select = `${input} w-auto py-1`

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{t.flows.content}</span>
        {/* Yerel içerik bir cihazın klasöründe: cihazı seçilmemiş akış bu cihaza atanır. */}
        <select className={select} value={c.source} disabled={disabled} aria-label={t.flows.content} onChange={(e) => onChange({ ...c, source: e.target.value as ContentSettings['source'] }, e.target.value === 'local' && !w.workerId ? ov.me : undefined)}>
          <option value="cloud">{t.flows.source.cloud}</option>
          <option value="local">{t.flows.source.local}</option>
        </select>
        <select className={select} value={c.order} disabled={disabled} onChange={(e) => onChange({ ...c, order: e.target.value as ContentSettings['order'] })}>
          <option value="sequential">{t.flows.order.sequential}</option>
          <option value="random">{t.flows.order.random}</option>
        </select>
        <label className="flex items-center gap-2">
          <Switch on={c.repeat} label={t.flows.repeat} disabled={disabled} onChange={(repeat) => onChange({ ...c, repeat })} />
          {t.flows.repeat}
        </label>
        {here && (
          <button className={`${button} ml-auto`} onClick={() => void api().workflows.openContents(w.id)}>
            <FolderOpen className="size-3.5" /> {t.flows.openFolder}
          </button>
        )}
      </div>
      {c.source === 'local' && !here && <p className="mt-2 text-xs text-muted">{t.flows.otherDevice(ov.workers.find((k) => k.id === w.workerId)?.name ?? '?')}</p>}
      {here && items && (
        <>
          <p className="mt-2 text-xs text-muted">
            workflow/{w.id}/contents · {t.flows.folderHint}
          </p>
          {!items.length && <p className="mt-2 text-sm text-muted">{t.flows.noFolders}</p>}
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.folder} className="flex items-center gap-2" title={i.note}>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted">{i.folder}</span>
                <Pill tone={STATUS_TONE[i.status]}>{t.flows.status[i.status]}</Pill>
                <span className="min-w-0 flex-1 truncate">{i.caption.split('\n')[0] || t.flows.noText}</span>
                {i.media.length > 0 && <span className="shrink-0 text-xs text-muted">{t.flows.files(i.media.length)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Device({ icon, name, mine, online, seen, accounts, flows, tasks }: { icon: React.ReactNode; name: string; mine: boolean; online: boolean; seen: string | null; accounts: { id: string; platform: string; handle: string }[]; flows: number; tasks: number }) {
  return (
    <div className={`rounded-lg border p-3 ${mine ? 'border-line-2 bg-raised' : 'border-line'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        {mine && <Pill tone="muted">{t.thisDevice}</Pill>}
        <Pill tone={online ? 'ok' : 'muted'}>{online ? t.online : t.offline}</Pill>
      </div>
      <p className="mt-1 text-xs text-muted">
        {t.flows.accountsCount(accounts.length)}, {t.flows.flowsCount(flows)}
        {tasks > 0 ? `, ${t.flows.tasksCount(tasks)}` : ''}
        {seen && !online ? `, ${when(seen)}` : ''}
      </p>
      {accounts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {accounts.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-raised py-0.5 pl-0.5 pr-2 text-xs">
              <PlatformBadge platform={a.platform} size="size-5" /> @{a.handle}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
