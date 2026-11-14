import { ExternalLink, Loader2, Monitor, Play, Plus, RefreshCw, Server } from 'lucide-react'
import { useState } from 'react'
import { api, errorText, useConnections } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, iconButton, input, Page, Pill, PlatformBadge, primary, serverError, Switch } from './ui.tsx'

const when = (v: string | number | null) => (v ? dateTime.format(new Date(v)) : t.never)

/**
 * **Akışlar.** Sunucudaki akışlar (web ile aynı kayıt): aç/durdur, çalıştıracak cihazı seç, şimdi
 * çalıştır; sıradaki yuvalar, son çalışmaların sonucu ve hesaba bağlı bütün cihazlar (Worker'lar).
 * Düzenleme sitenin düzenleyicisinde, bu cihazın oturumuyla açılıyor.
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
          <button className={iconButton} title={t.refresh} aria-label={t.refresh} onClick={() => act('refresh', api().connections.refresh(true))}>
            <RefreshCw className={`size-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
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
              <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel/80 p-3">
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
