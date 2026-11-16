import { Bot, Check, ExternalLink, FolderOpen, Loader2, LogIn, MessageSquare, MessagesSquare, Monitor, Pencil, Play, Plus, RefreshCw, RotateCcw, Server, Sparkles, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isExample, isPartial, MAX_GENERATE, usesContents, type ContentSettings, type GenerateInput, type LocalContent } from '../../shared/contents.ts'
import { platformOf } from '../../shared/platforms.ts'
import { FLOW_TEMPLATES, type FlowTemplate, type Overview, type Schedule, type SocialAccount } from '../../shared/types.ts'
import { ConfirmButton } from './Confirm.tsx'
import { api, errorText, useActivity, useChats, useConnections } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, Field, iconButton, input, Modal, Page, Pill, PlatformBadge, primary, serverError, Switch } from './ui.tsx'

const when = (v: string | number | null) => (v ? dateTime.format(new Date(v)) : t.never)

const TEMPLATE_ICON: Record<FlowTemplate, typeof Bot> = { post: FolderOpen, aiPost: Sparkles, reply: MessagesSquare, follow: UserPlus, task: Bot }

/**
 * **Akışlar.** Tanımı sunucuda duran (web ile aynı kayıt), **bu uygulamanın çalıştırdığı** akışlar: hazır akışlar
 * (tek tıkla: paylaşım, yanıt, takip, agent görevi), agent görevinin metni, çalışma geçmişi (atlananın nedeni ve işin
 * sohbeti); eşitlenir (kendiliğinden ve "Eşitle" düğmesiyle): aç/durdur, yeniden adlandır, sil, çalıştıracak cihazı seç, şimdi çalıştır; içerik ayarları
 * (sıra, tekrar), zamanlama ve paylaşılacak hesaplar, bu cihazdaki içerik klasörleri (ekle, yeniden sıraya al,
 * uyarılar) ve yapay zekâ ile içerik üretimi; sıradaki yuvalar, son
 * çalışmaların sonucu, hesaba bağlı bütün cihazlar (Worker'lar; bu bilgisayar en başta, vurgulu) ve bu
 * cihazın etkinlik günlüğü. Adımlar sitenin düzenleyicisinde.
 */
export function Workflows({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const state = useConnections()
  const activity = useActivity()
  const chats = useChats()
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
      {(state?.accounts ?? [])
        .filter((a) => a.here && a.status !== 'connected')
        .map((a) => (
          <p key={a.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
            <PlatformBadge platform={a.platform} size="size-6" />
            <span className="min-w-0 flex-1">{t.flows.needsLogin(a.handle)}</span>
            <button
              className={button}
              disabled={busy === a.id}
              onClick={() =>
                act(a.id, api().connections.relogin(a.id), (r) => {
                  const out = r as { ok: boolean; error?: string }
                  if (!out.ok && out.error) toast(serverError(out.error), 'error')
                })
              }
            >
              <LogIn className="size-3.5" /> {t.conn.relogin}
            </button>
          </p>
        ))}
      {!ov ? (
        !state?.error && <Loader2 className="size-5 animate-spin text-muted" />
      ) : (
        <>
          <Card>
            <h2 className="text-[1.75rem]">{t.flows.templates}</h2>
            <p className="mb-3 mt-0.5 text-xs text-muted">{t.flows.templatesHint}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FLOW_TEMPLATES.map((id) => {
                const Icon = TEMPLATE_ICON[id]
                return (
                  <button key={id} type="button" disabled={busy !== null} className="flex flex-col items-start gap-1.5 rounded-lg border border-line p-3 text-left transition-colors duration-[var(--dur-micro)] hover:border-brand disabled:opacity-60" onClick={() => act(`tpl-${id}`, api().workflows.createLocal(t.flows.template[id].name, id), () => toast(t.flows.templateCreated(t.flows.template[id].name)))}>
                    {busy === `tpl-${id}` ? <Loader2 className="size-4 animate-spin text-brand" /> : <Icon className="size-4 text-brand" strokeWidth={1.5} />}
                    <span className="text-sm font-medium">{t.flows.template[id].name}</span>
                    <span className="text-xs text-muted">{t.flows.template[id].hint}</span>
                  </button>
                )
              })}
            </div>
          </Card>
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
                  <FlowName name={w.name} disabled={busy === w.id} onRename={(name) => act(w.id, api().workflows.rename(w.id, name))} />
                  <p className="truncate text-xs text-muted">
                    {w.active ? t.flows.active : t.flows.paused}, {t.flows.lastRun}: {when(w.lastRunAt)}
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
                      toast(`${w.name}: ${t.flows.runStatus[out.status] ?? out.status}${out.error ? `: ${out.error}` : ''}`, out.status === 'success' ? 'ok' : 'error')
                    })
                  }
                >
                  {busy === w.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} {t.flows.runNow}
                </button>
                <button className={iconButton} title={t.flows.openEditor} aria-label={t.flows.openEditor} onClick={() => void api().site.open(`/workflows/${w.slug}`)}>
                  <ExternalLink className="size-4" />
                </button>
                <ConfirmButton className={iconButton} title={t.flows.deleteHint} label={t.delete} onConfirm={() => act(w.id, api().workflows.remove(w.id), () => toast(t.flows.deleted(w.name)))}>
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </div>
              <ScheduleRow w={w} accounts={state?.accounts ?? []} disabled={busy === w.id} onSchedule={(s) => act(w.id, api().workflows.setSchedule(w.id, s), () => toast(t.flows.scheduleSaved))} onAccounts={(ids) => act(w.id, api().workflows.setAccounts(w.id, ids))} />
              {w.instruction !== null && <TaskRow key={w.instruction} value={w.instruction} disabled={busy === w.id} onSave={(text) => act(w.id, api().workflows.setInstruction(w.id, text), () => toast(t.flows.taskSaved))} />}
              {usesContents(w.nodes) && <ContentRow w={w} ov={ov} platforms={(state?.accounts ?? []).filter((a) => w.accountIds.includes(a.id)).map((a) => a.platform)} syncedAt={state?.syncedAt ?? 0} disabled={busy === w.id} onChange={(content) => act(w.id, api().workflows.setContent(w.id, content))} onUseThisDevice={() => act(w.id, api().workflows.setWorker(w.id, ov.me))} />}
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
                      {r.chatIds
                        .filter((id) => chats.some((c) => c.id === id))
                        .map((id) => (
                          <button key={id} className="shrink-0 text-brand" title={t.openChat} aria-label={t.openChat} onClick={() => onOpenChat(id)}>
                            <MessageSquare className="size-3.5" />
                          </button>
                        ))}
                      <span className="shrink-0 text-xs tabular-nums text-muted">{when(r.startedAt)}</span>
                    </div>
                    {r.error && <p className={`mt-0.5 line-clamp-3 text-xs ${r.status === 'skipped' ? 'text-warn' : 'text-danger'}`}>{r.error}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <h2 className="text-[1.75rem]">{t.flows.devices}</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted">{t.flows.devicesHint}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {[...ov.workers]
                .sort((a, b) => Number(b.id === ov.me) - Number(a.id === ov.me) || Number(b.online) - Number(a.online))
                .map((k) => (
                  <Device key={k.id} icon={<Monitor className="size-4" />} name={k.name} mine={k.id === ov.me} online={k.online} seen={k.lastUsedAt} accounts={k.accounts} flows={k.workflows.length} />
                ))}
              {(ov.server.accounts.length > 0 || ov.server.workflows.length > 0) && <Device icon={<Server className="size-4" />} name={t.flows.serverAccounts} mine={false} online seen={null} accounts={ov.server.accounts} flows={ov.server.workflows.length} />}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-[1.75rem]">{t.flows.activity}</h2>
            {!activity.length && <p className="text-sm text-muted">{t.flows.noActivity}</p>}
            <ul className="space-y-1.5 text-sm">
              {activity.slice(0, 30).map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-start gap-2">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.tone === 'ok' ? 'bg-ok' : a.tone === 'error' ? 'bg-danger' : 'bg-muted'}`} />
                  <span className="min-w-0 flex-1 break-words">{a.text}</span>
                  {a.chatId && (
                    <button className="shrink-0 text-brand" title={t.openChat} aria-label={t.openChat} onClick={() => onOpenChat(a.chatId!)}>
                      <MessageSquare className="size-3.5" />
                    </button>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted">{dateTime.format(a.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}

/** Akışın adı; kalem düğmesiyle yerinde değiştirilir (Enter kaydeder, Esc vazgeçer). */
/** Agent düğümünün görevi: akış her çalıştığında agent bu talimatı hesabın tarayıcısında yapar. */
function TaskRow({ value, disabled, onSave }: { value: string; disabled: boolean; onSave(text: string): void }) {
  const [text, setText] = useState(value)
  return (
    <div className="mt-3 border-t border-line pt-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        <Bot className="size-3.5" strokeWidth={1.5} /> {t.flows.task}
      </label>
      <textarea className={`${input} mt-1.5 min-h-20 text-sm`} value={text} maxLength={4000} disabled={disabled} placeholder={t.flows.taskPlaceholder} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1.5 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted">{t.flows.taskHint}</p>
        <button className={button} disabled={disabled || text === value || !text.trim()} onClick={() => onSave(text.trim())}>
          <Check className="size-3.5" /> {t.save}
        </button>
      </div>
    </div>
  )
}

function FlowName({ name, disabled, onRename }: { name: string; disabled: boolean; onRename(name: string): void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null)
    return (
      <p className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium">{name}</span>
        <button className="shrink-0 text-muted" title={t.flows.rename} aria-label={t.flows.rename} disabled={disabled} onClick={() => setDraft(name)}>
          <Pencil className="size-3.5" />
        </button>
      </p>
    )
  const save = () => {
    if (draft.trim() && draft.trim() !== name) onRename(draft.trim())
    setDraft(null)
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input className={`${input} py-1`} value={draft} maxLength={120} autoFocus aria-label={t.flows.rename} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setDraft(null)} />
      <button type="submit" className={iconButton} title={t.save} aria-label={t.save}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconButton} title={t.cancel} aria-label={t.cancel} onClick={() => setDraft(null)}>
        <X className="size-4" />
      </button>
    </form>
  )
}

// Pazartesiden başlayan hafta; gün numarası sunucudaki gibi 0 = pazar.
const DAYS = [1, 2, 3, 4, 5, 6, 0]
const dayName = (d: number) => new Intl.DateTimeFormat(dateTime.resolvedOptions().locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + d))
/** "9:00, 18:30" → ["09:00", "18:30"]; tanınmayan parça atılır. */
const parseTimes = (text: string) => [...new Set(text.split(/[,;\s]+/).flatMap((x) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(x) ? [x.padStart(5, '0')] : [])))].sort()

/**
 * Akışın zamanlaması (haftanın günleri + saatler ya da her N saatte bir) ve paylaşacağı hesaplar. Sunucu
 * ikisini akışın grafına yazar: siteyi açmak gerekmez. Zamanlama "Kaydet" ile, hesap tıklanınca kaydedilir.
 */
function ScheduleRow({ w, accounts, disabled, onSchedule, onAccounts }: { w: Overview['workflows'][number]; accounts: SocialAccount[]; disabled: boolean; onSchedule(s: Schedule): void; onAccounts(ids: string[]): void }) {
  const [draft, setDraft] = useState<Schedule | null>(null)
  const [times, setTimes] = useState<string | null>(null)
  useEffect(() => (setDraft(null), setTimes(null)), [w.schedule])
  const s = draft ?? w.schedule
  if (!s) return null
  const dirty = draft !== null || times !== null
  const save = () => {
    const next = { ...s, times: times === null ? s.times : parseTimes(times) }
    if (next.mode === 'weekly' && (!next.days.length || !next.times.length)) return toast(t.flows.noTimes, 'error')
    onSchedule(next)
  }
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t.flows.schedule}</span>
        <select className={`${input} w-auto py-1`} value={s.mode} disabled={disabled} aria-label={t.flows.schedule} onChange={(e) => setDraft({ ...s, mode: e.target.value as Schedule['mode'] })}>
          <option value="weekly">{t.flows.modeWeekly}</option>
          <option value="interval">{t.flows.modeInterval}</option>
        </select>
        {s.mode === 'weekly' ? (
          <>
            {DAYS.map((d) => {
              const on = s.days.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on} disabled={disabled} className={`rounded border px-2 py-1 ${on ? 'border-brand bg-brand/10 text-fg' : 'border-line hover:bg-raised'}`} onClick={() => setDraft({ ...s, days: on ? s.days.filter((x) => x !== d) : [...s.days, d] })}>
                  {dayName(d)}
                </button>
              )
            })}
            <input className={`${input} w-40 py-1`} value={times ?? s.times.join(', ')} disabled={disabled} placeholder="09:00, 18:00" title={t.flows.timesHint} aria-label={t.flows.timesHint} onChange={(e) => setTimes(e.target.value)} />
          </>
        ) : (
          <label className="flex items-center gap-2">
            {t.flows.every}
            <input type="number" min={1} max={168} className={`${input} w-20 py-1`} value={s.everyHours} disabled={disabled} onChange={(e) => setDraft({ ...s, everyHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
            {t.flows.hours}
          </label>
        )}
        {dirty && (
          <button className={primary} disabled={disabled} onClick={save}>
            <Check className="size-3.5" /> {t.save}
          </button>
        )}
        <span className="ml-auto">{w.timezone}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{t.flows.shareTo}</span>
        {!accounts.length && <span>{t.flows.noAccountsYet}</span>}
        {accounts.map((a) => {
          const on = w.accountIds.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 ${on ? 'border-brand bg-brand/10 text-fg' : 'border-line hover:bg-raised'}`}
              onClick={() => {
                const next = on ? w.accountIds.filter((x) => x !== a.id) : [...w.accountIds, a.id]
                if (next.length) onAccounts(next)
                else toast(t.flows.needAccount, 'error')
              }}
            >
              <PlatformBadge platform={a.platform} size="size-5" /> @{a.handle}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STATUS_TONE = { pending: 'muted', publishing: 'warn', published: 'ok', failed: 'bad' } as const

/**
 * Akışın içeriği: paylaşım sırası ve tekrar ayarı; akış bu cihaza atanmışsa içerik klasörleri
 * (`workflow/<kimlik>/contents/1, 2, 3…`) durumlarıyla listelenir ve yapay zekâ ile yeni içerik üretilir.
 * İçerik yalnız cihazda durur: cihazı seçilmemiş akış bu bilgisayara atanabilir.
 */
function ContentRow({ w, ov, platforms, syncedAt, disabled, onChange, onUseThisDevice }: { w: Overview['workflows'][number]; ov: Overview; platforms: string[]; syncedAt: number; disabled: boolean; onChange(content: ContentSettings): void; onUseThisDevice(): void }) {
  const c = w.content
  const here = w.workerId === ov.me
  const [items, setItems] = useState<LocalContent[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [tick, setTick] = useState(0)
  const pending = items?.filter((i) => i.status === 'pending').length ?? 0
  // Platform görsel ya da video istiyor ama klasörde yok: sırası gelince düşerdi.
  const mediaLess = [...new Set(platforms)].filter((p) => platformOf(p)?.needsMedia).map((p) => platformOf(p)!.label)
  useEffect(() => {
    if (!here) return setItems(null)
    void api()
      .workflows.contents(w.id)
      .then(setItems, () => setItems([]))
  }, [here, w.id, syncedAt, tick])
  const select = `${input} w-auto py-1`

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{t.flows.content}</span>
        <select className={select} value={c.order} disabled={disabled} aria-label={t.flows.content} onChange={(e) => onChange({ ...c, order: e.target.value as ContentSettings['order'] })}>
          <option value="sequential">{t.flows.order.sequential}</option>
          <option value="random">{t.flows.order.random}</option>
        </select>
        <label className="flex items-center gap-2">
          <Switch on={c.repeat} label={t.flows.repeat} disabled={disabled} onChange={(repeat) => onChange({ ...c, repeat })} />
          {t.flows.repeat}
        </label>
        {here && (
          <span className="ml-auto flex gap-2">
            <button className={button} onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> {t.flows.addContent}
            </button>
            <button className={button} onClick={() => setGenerating(true)}>
              <Sparkles className="size-3.5" /> {t.flows.generate}
            </button>
            <button className={button} onClick={() => void api().workflows.openContents(w.id)}>
              <FolderOpen className="size-3.5" /> {t.flows.openFolder}
            </button>
          </span>
        )}
      </div>
      {!here && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {w.workerId ? t.flows.otherDevice(ov.workers.find((k) => k.id === w.workerId)?.name ?? '?') : t.flows.noDevice}
          <button className={button} disabled={disabled} onClick={onUseThisDevice}>
            <Monitor className="size-3.5" /> {t.flows.useThisDevice}
          </button>
        </p>
      )}
      {here && items && (
        <>
          <p className="mt-2 text-xs text-muted">
            workflow/{w.id}/contents · {t.flows.status.pending}: {pending} · {t.flows.folderHint}
          </p>
          {!items.length && <p className="mt-2 text-sm text-muted">{t.flows.noFolders}</p>}
          {pending <= 2 && (
            <p role={w.active ? 'alert' : undefined} className={`mt-2 rounded-lg border p-2 text-xs ${w.active ? 'border-warn/40 bg-warn/10 text-fg' : 'border-line text-muted'}`}>
              {pending ? t.flows.lowContent(pending) : t.flows.noContentLeft}
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.folder} title={i.note}>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted">{i.folder}</span>
                  <Pill tone={isPartial(i) ? 'warn' : STATUS_TONE[i.status]}>{isPartial(i) ? t.flows.partial : t.flows.status[i.status]}</Pill>
                  <span className="min-w-0 flex-1 truncate">{i.caption.split('\n')[0] || t.flows.noText}</span>
                  {i.media.length > 0 && <span className="shrink-0 text-xs text-muted">{t.flows.files(i.media.length)}</span>}
                  {i.status !== 'pending' && !isExample(i) && (
                    <button
                      className="shrink-0 text-muted hover:text-fg"
                      title={t.flows.requeue}
                      aria-label={t.flows.requeue}
                      onClick={() =>
                        void api()
                          .workflows.requeue(w.id, i.folder)
                          .then(
                            () => (setTick((x) => x + 1), toast(t.flows.requeued(i.folder))),
                            (e) => toast(errorText(e), 'error'),
                          )
                      }
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </div>
                {(i.status === 'failed' || isPartial(i)) && i.note && <p className="ml-10 line-clamp-2 text-xs text-danger">{i.note}</p>}
                {i.status === 'pending' && (i.warnings.length > 0 || (mediaLess.length > 0 && !i.media.length)) && (
                  <p className="ml-10 text-xs text-warn">{[...(mediaLess.length && !i.media.length ? [t.flows.needsMedia(mediaLess.join(', '))] : []), ...i.warnings.map((x) => t.flows.warn[x])].join(' ')}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {adding && (
        <AddForm
          workflowId={w.id}
          onClose={() => setAdding(false)}
          onDone={(folder) => {
            setAdding(false)
            setTick((x) => x + 1)
            toast(t.flows.added(folder))
          }}
        />
      )}
      {generating && (
        <GenerateForm
          workflowId={w.id}
          items={items ?? []}
          onClose={() => setGenerating(false)}
          onDone={(n) => {
            setGenerating(false)
            setTick((x) => x + 1)
            toast(t.flows.generated(n))
          }}
        />
      )}
    </div>
  )
}

/** Uygulamadan yeni içerik: metin ve seçilen görseller/videolar sıradaki numaralı klasöre yazılır (durumu `pending`). */
function AddForm({ workflowId, onClose, onDone }: { workflowId: string; onClose(): void; onDone(folder: string): void }) {
  const [caption, setCaption] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = () => {
    setBusy(true)
    void api()
      .workflows.addContent(workflowId, caption, files)
      .then(onDone, (e) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }
  return (
    <Modal title={t.flows.addContent} onClose={() => !busy && onClose()}>
      <p className="mb-4 text-sm text-muted">{t.flows.addContentHint}</p>
      <Field label={t.flows.contentText}>
        <textarea className={`${input} min-h-32 resize-y`} value={caption} maxLength={5000} autoFocus onChange={(e) => setCaption(e.target.value)} />
      </Field>
      <div className="mb-4">
        <button className={button} onClick={() => void api().workflows.pickMedia().then((picked) => setFiles((x) => [...new Set([...x, ...picked])].slice(0, 20)))}>
          <FolderOpen className="size-3.5" /> {t.flows.pickFiles}
        </button>
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{f.split(/[\\/]/).pop()}</span>
              <button className="shrink-0 text-muted hover:text-fg" title={t.delete} aria-label={t.delete} onClick={() => setFiles((x) => x.filter((y) => y !== f))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} disabled={busy} onClick={onClose}>
          {t.cancel}
        </button>
        <button className={primary} disabled={busy || (!caption.trim() && !files.length)} onClick={save}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t.flows.addContent}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Yapay zekâ ile içerik üretimi: bir içerik örnek alınır ya da yalnız konu yazılır; her biri özgün, yeni
 * numaralı klasörler (metin + isteğe bağlı görsel) `pending` durumuyla yazılır.
 */
function GenerateForm({ workflowId, items, onClose, onDone }: { workflowId: string; items: LocalContent[]; onClose(): void; onDone(count: number): void }) {
  const [v, setV] = useState<GenerateInput>({ from: null, topic: '', count: 3, withImage: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sources = items.filter((i) => i.caption)
  const run = () => {
    setBusy(true)
    setError('')
    void api()
      .workflows.generate(workflowId, v)
      .then(onDone, (e) => setError(serverError(errorText(e))))
      .finally(() => setBusy(false))
  }
  return (
    <Modal title={t.flows.generate} onClose={() => !busy && onClose()}>
      <p className="mb-4 text-sm text-muted">{t.flows.generateHint}</p>
      <Field label={t.flows.generateFrom}>
        <select className={input} value={v.from ?? ''} onChange={(e) => setV({ ...v, from: e.target.value || null })}>
          <option value="">{t.flows.generateFromNone}</option>
          {sources.map((i) => (
            <option key={i.folder} value={i.folder}>
              {i.folder} · {i.caption.split('\n')[0].slice(0, 70)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.flows.generateTopic}>
        <textarea className={`${input} min-h-24 resize-y`} value={v.topic} maxLength={2000} placeholder={t.flows.generateTopicPlaceholder} onChange={(e) => setV({ ...v, topic: e.target.value })} />
      </Field>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          {t.flows.generateCount}
          <input type="number" min={1} max={MAX_GENERATE} className={`${input} w-20`} value={v.count} onChange={(e) => setV({ ...v, count: Math.min(MAX_GENERATE, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="flex items-center gap-2">
          <Switch on={v.withImage} label={t.flows.generateImage} onChange={(withImage) => setV({ ...v, withImage })} />
          {t.flows.generateImage}
        </label>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} disabled={busy} onClick={onClose}>
          {t.cancel}
        </button>
        <button className={primary} disabled={busy || (!v.from && !v.topic.trim())} onClick={run}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy ? t.flows.generating : t.flows.generate}
        </button>
      </div>
    </Modal>
  )
}

/** Bir cihaz (Worker). Bu bilgisayar (`mine`) çerçevesi ve etiketiyle ayrışır: çalışan uygulama o. */
function Device({ icon, name, mine, online, seen, accounts, flows }: { icon: React.ReactNode; name: string; mine: boolean; online: boolean; seen: string | null; accounts: { id: string; platform: string; handle: string }[]; flows: number }) {
  return (
    <div className={`rounded-lg border p-3 ${mine ? 'border-brand bg-brand/10' : 'border-line'}`} aria-current={mine || undefined}>
      {mine && (
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-brand">
          <span className="size-2 animate-pulse rounded-full bg-ok" /> {t.flows.thisApp}
        </p>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <p className={`min-w-0 flex-1 truncate text-sm ${mine ? 'font-semibold' : 'font-medium'}`}>{name}</p>
        <Pill tone={online ? 'ok' : 'muted'}>{online ? t.online : t.offline}</Pill>
      </div>
      <p className="mt-1 text-xs text-muted">
        {t.flows.accountsCount(accounts.length)}, {t.flows.flowsCount(flows)}
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
