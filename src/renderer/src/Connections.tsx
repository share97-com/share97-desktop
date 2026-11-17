import { ExternalLink, Loader2, LogIn, Monitor, Plus, RefreshCw, Search, Smartphone, Tag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Account, Layout, SocialAccount } from '../../shared/types.ts'
import { PLATFORMS, PLATFORM_IDS, defaultLayout, platformOf } from '../../shared/platforms.ts'
import { ConfirmButton } from './Confirm.tsx'
import { api, errorText, useChrome, useConnections } from './hooks.ts'
import { t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, Field, iconButton, input, Modal, Page, Pill, PlatformBadge, primary, serverError } from './ui.tsx'

type GroupBy = 'platform' | 'group' | 'worker' | 'status'
const GROUP_KEY = 'share97:connections:groupBy'

/** Hesabın oturumunun nerede olduğu: bu cihaz (uygulama/Chrome), başka cihaz ya da resmî API. */
const viaLabel = (a: SocialAccount) => (a.via === 'api' ? t.conn.viaApi : a.where === 'app' ? t.conn.viaApp : a.where === 'chrome' ? t.conn.viaChrome : `${t.conn.viaOther}${a.worker ? `, ${a.worker}` : ''}`)

const groupName = (a: SocialAccount, by: GroupBy) =>
  by === 'platform' ? (platformOf(a.platform)?.label ?? a.platform) : by === 'group' ? a.group || t.conn.noGroup : by === 'status' ? (t.conn.status[a.status] ?? a.status) : a.via === 'api' ? t.conn.viaApi : (a.worker ?? t.conn.viaOther)

/**
 * **Bağlantılar.** Kullanıcının bütün sosyal medya hesapları: platforma, kendi grubuna, cihaza ya da
 * duruma göre gruplanmış. Buradan hesap eklenir (uygulamada ya da Chrome'da), yeniden giriş yapılır,
 * gruplanır ve kaldırılır.
 */
export function Connections({ account }: { account: Account }) {
  const state = useConnections()
  const [by, setBy] = useState<GroupBy>(() => (localStorage.getItem(GROUP_KEY) as GroupBy | null) ?? 'platform')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (state?.accounts ?? []).filter((a) => !q || `${a.handle} ${a.name ?? ''} ${a.group} ${a.platform}`.toLowerCase().includes(q))
    const out = new Map<string, SocialAccount[]>()
    for (const a of list) out.set(groupName(a, by), [...(out.get(groupName(a, by)) ?? []), a])
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [state, by, query])
  const known = useMemo(() => [...new Set((state?.accounts ?? []).map((a) => a.group).filter(Boolean))].sort(), [state])

  const refresh = () => {
    setBusy(true)
    void api().connections.refresh(true).finally(() => setBusy(false))
  }

  return (
    <Page
      title={t.conn.title}
      hint={t.conn.hint}
      actions={
        <>
          <button className={iconButton} title={t.refresh} aria-label={t.refresh} onClick={refresh}>
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
          <button className={primary} onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t.conn.add}
          </button>
        </>
      }
    >
      {state?.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {serverError(state.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-full border border-muted/70 bg-bg px-3.5 py-1.5 text-sm focus-within:border-brand">
          <Search className="size-4 shrink-0 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.conn.search} aria-label={t.conn.search} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        </label>
        <div className="flex items-center gap-1 rounded-full border border-line p-0.5 text-sm" role="group" aria-label={t.conn.groupBy}>
          <span className="px-2 text-xs text-muted">{t.conn.groupBy}</span>
          {(['platform', 'group', 'worker', 'status'] as const).map((g) => (
            <button key={g} type="button" aria-pressed={by === g} className={`rounded-full px-2.5 py-1 ${by === g ? 'bg-raised font-medium' : 'text-muted hover:text-fg'}`} onClick={() => { setBy(g); try { localStorage.setItem(GROUP_KEY, g) } catch {} }}>
              {{ platform: t.conn.byPlatform, group: t.conn.byGroup, worker: t.conn.byWorker, status: t.conn.byStatus }[g]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{t.conn.limit(state?.accounts.length ?? 0, account.limits.maxAccounts)}</span>
      </div>

      {!state ? (
        <Loader2 className="size-5 animate-spin text-muted" />
      ) : !state.accounts.length ? (
        <Card className="text-center">
          <p className="mx-auto mb-4 max-w-md text-sm text-muted">{t.conn.empty}</p>
          <button className={primary} onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t.conn.add}
          </button>
        </Card>
      ) : (
        groups.map(([name, list]) => (
          <section key={name}>
            <h2 className="mb-2 flex items-baseline gap-2 font-sans text-sm font-medium normal-case tracking-normal text-fg-2">
              {name} <span className="readout !text-muted">{list.length}</span>
            </h2>
            <div className="grid gap-2">
              {list.map((a) => (
                <AccountCard key={a.id} account={a} groups={known} />
              ))}
            </div>
          </section>
        ))
      )}
      <button type="button" className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted underline-offset-4 hover:text-fg hover:underline" onClick={() => void api().site.open('/accounts')}>
        <ExternalLink className="size-3.5" /> {t.conn.manageOnSite}
      </button>
      {adding && <AddAccount onClose={() => setAdding(false)} />}
    </Page>
  )
}

function AccountCard({ account: a, groups }: { account: SocialAccount; groups: string[] }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const act = (p: Promise<{ ok: boolean; error?: string } | void>) => {
    setBusy(true)
    void p
      .then((r) => r && !r.ok && toast(serverError(r.error), 'error'))
      .catch((e) => toast(serverError(errorText(e)), 'error'))
      .finally(() => setBusy(false))
  }
  return (
    <div className="rounded-lg border border-line bg-panel/80 p-3">
      <div className="flex items-center gap-3">
        <PlatformBadge platform={a.platform} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            @{a.handle} {a.name && <span className="font-normal text-muted">({a.name})</span>}
          </p>
          <p className="truncate text-xs text-muted">
            {platformOf(a.platform)?.label ?? a.platform}, {viaLabel(a)}
          </p>
        </div>
        <Pill tone={a.status === 'connected' ? 'ok' : a.status === 'expired' ? 'warn' : 'bad'}>{t.conn.status[a.status] ?? a.status}</Pill>
        {busy && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void api().connections.setGroup(a.id, String(new FormData(e.currentTarget).get('group') ?? ''))
              setEditing(false)
            }}
          >
            <input name="group" defaultValue={a.group} autoFocus list={`groups-${a.id}`} placeholder={t.conn.groupPlaceholder} className={`${input} py-1`} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
            <datalist id={`groups-${a.id}`}>
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <button className={button}>{t.save}</button>
          </form>
        ) : (
          <button className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-raised hover:text-fg" title={t.conn.group} onClick={() => setEditing(true)}>
            <Tag className="size-3.5 shrink-0" /> <span className="truncate">{a.group || t.conn.noGroup}</span>
          </button>
        )}
        {!editing && (
          <div className="ml-auto flex items-center gap-1">
            {a.layout && <LayoutSwitch value={a.layout} disabled={busy} onChange={(l) => act(api().connections.setLayout(a.id, l))} />}
            {a.here && a.status !== 'connected' && (
              <button className={button} disabled={busy} onClick={() => act(api().connections.relogin(a.id))}>
                <LogIn className="size-3.5" /> {t.conn.relogin}
              </button>
            )}
            {a.here && (
              <button className={iconButton} title={t.conn.open} aria-label={t.conn.open} onClick={() => act(api().connections.open(a.id))}>
                <ExternalLink className="size-4" />
              </button>
            )}
            {a.via === 'worker' && (
              <ConfirmButton className={iconButton} title={t.conn.removeTitle} label={t.conn.removeTitle} onConfirm={() => act(api().connections.remove(a.id))}>
                <Trash2 className="size-4" />
              </ConfirmButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Mobil / masaüstü seçici: hesap eklerken ve hesap kartında aynı. */
function LayoutSwitch({ value, onChange, disabled }: { value: Layout; onChange: (l: Layout) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label={t.layout} title={t.layoutHint} className="flex shrink-0 overflow-hidden rounded-full border border-line text-xs">
      {(['mobile', 'desktop'] as const).map((l) => {
        const Icon = l === 'mobile' ? Smartphone : Monitor
        return (
          <button key={l} type="button" disabled={disabled} aria-pressed={value === l} className={`flex items-center gap-1 px-2 py-1 ${value === l ? 'bg-brand/15 font-medium text-fg' : 'text-muted hover:bg-raised hover:text-fg'}`} onClick={() => value !== l && onChange(l)}>
            <Icon className="size-3.5" /> {t.layouts[l]}
          </button>
        )
      })}
    </div>
  )
}

/** Hesap ekleme: platform, kullanıcı adı ve oturumun yeri (uygulama tarayıcısı ya da bağlı bir Chrome). */
function AddAccount({ onClose }: { onClose: () => void }) {
  const chrome = useChrome()
  const chromes = chrome?.instances.filter((c) => c.status === 'connected') ?? []
  const [platform, setPlatform] = useState<string>(PLATFORM_IDS[0])
  const [handle, setHandle] = useState('')
  const [where, setWhere] = useState('app')
  // Seçilmediyse platformun varsayılanı (YouTube Studio ve TikTok yüklemesi masaüstünde).
  const [picked, setLayout] = useState<Layout | null>(null)
  const layout = picked ?? defaultLayout(platform)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    setWaiting(true)
    void api()
      .connections.add(platform, handle, where === 'app' ? undefined : where, layout)
      .then((r) => {
        if (r.ok) {
          toast(t.conn.added)
          onClose()
        } else setError(serverError(r.error))
      })
      .catch((e) => setError(serverError(errorText(e))))
      .finally(() => setWaiting(false))
  }
  const cancel = () => {
    if (waiting) void api().connections.cancelAdd()
    onClose()
  }

  return (
    <Modal title={t.conn.addTitle} onClose={cancel}>
      <Field label={t.conn.platform}>
        <div className="grid grid-cols-3 gap-2">
          {PLATFORM_IDS.map((id) => (
            <button key={id} type="button" disabled={waiting} aria-pressed={platform === id} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm ${platform === id ? 'border-brand bg-brand/10 font-medium' : 'border-line hover:bg-raised'}`} onClick={() => (setPlatform(id), setLayout(null))}>
              <PlatformBadge platform={id} size="size-6" /> {PLATFORMS[id].label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t.conn.handle}>
        <input value={handle} disabled={waiting} onChange={(e) => setHandle(e.target.value)} placeholder={t.conn.handlePlaceholder} className={input} autoFocus onKeyDown={(e) => e.key === 'Enter' && handle.trim() && submit()} />
      </Field>
      <Field label={t.conn.where} hint={where === 'app' ? t.conn.whereAppHint : t.conn.whereChromeHint}>
        <select value={where} disabled={waiting} onChange={(e) => setWhere(e.target.value)} className={input}>
          <option value="app">{t.conn.whereApp}</option>
          {chromes.map((c) => (
            <option key={c.id} value={c.id}>
              {t.conn.whereChrome(c.name)}
            </option>
          ))}
        </select>
      </Field>
      {!chromes.length && <p className="-mt-2 mb-4 text-xs text-muted">{t.conn.noChrome}</p>}
      {where === 'app' && (
        <Field label={t.layout} hint={t.layoutHint}>
          <LayoutSwitch value={layout} onChange={setLayout} disabled={waiting} />
        </Field>
      )}
      {waiting && where === 'app' && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-raised p-3 text-sm">
          <Loader2 className="size-4 shrink-0 animate-spin text-brand" /> {t.conn.waiting}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} onClick={cancel}>
          {t.cancel}
        </button>
        <button className={primary} disabled={waiting || !handle.trim()} onClick={submit}>
          {where === 'app' ? t.conn.start : t.conn.addChrome}
        </button>
      </div>
    </Modal>
  )
}
