import { Bot, Check, ChevronDown, Download, EyeOff, Globe, Loader2, LogOut, NotebookPen, Plus, Power, RefreshCw, Settings as Gear, Trash2, Volume2, VolumeX, Wallet, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BROWSER_COLORS, type Account, type BrowserInfo, type BrowsersState } from '../../shared/types.ts'
import type { View } from './App.tsx'
import { ConfirmButton } from './Confirm.tsx'
import { balanceText, planLabel } from './Billing.tsx'
import { api, useChats, useUpdate } from './hooks.ts'
import { t } from './i18n.ts'
import mark from './mark.svg'

/** Açık olduğu sürece web görünümünü gizleyen katman (menü, panel, onay penceresi). */
export function Overlay({ onOverlay, onClose, children, className }: { onOverlay: (open: boolean) => void; onClose: () => void; children: ReactNode; className: string }) {
  useEffect(() => {
    onOverlay(true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      onOverlay(false)
      window.removeEventListener('keydown', onKey)
    }
  }, [onOverlay, onClose])
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className={`z-20 rounded-lg border border-line bg-raised shadow-2xl ${className}`}>{children}</div>
    </>
  )
}

/** Satır 1: ana sayfa, açık tarayıcılar (her biri bir çerez deposu), yeni sekme penceresi (`Picker.tsx`), hesap, ayarlar. */
export function BrowserStrip({ state, account, view, onView, onOverlay, onNew }: { state: BrowsersState; account: Account; view: View | null; onView: (v: View) => void; onOverlay: (open: boolean) => void; onNew: () => void }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [list, setList] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [update] = useUpdate()
  const chats = useChats()
  const waiting = chats.filter((c) => c.pending).length
  const working = chats.some((c) => c.running)
  const closed = state.browsers.filter((b) => !b.open).length
  const edited = state.browsers.find((b) => b.id === editing)
  return (
    <div className="caption-bar drag flex items-center gap-1 bg-bg pl-2">
      <button className={`no-drag flex h-8 shrink-0 items-center gap-2 rounded-full px-3 wordmark text-base ${view ? 'bg-panel' : 'text-muted hover:bg-panel/60'}`} onClick={() => onView(view ?? 'home')}>
        <img src={mark} alt="" className="size-4 rounded" />
        {t.home}
        {/* Agent başka ekrandayken de görünsün: onay bekliyor (sarı) ya da çalışıyor. */}
        {waiting > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-warn/20 px-1.5 text-xs font-medium text-warn" title={t.approvalWaiting}>
            <Bot className="size-3 animate-pulse" /> {waiting}
          </span>
        ) : (
          working && <Bot className="size-3.5 animate-pulse text-brand" aria-label={t.agentWorking} />
        )}
      </button>
      <div className="mx-1 h-5 w-px bg-line" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {state.browsers.map((b, i) => {
          if (!b.open) return null
          const active = b.id === state.activeId
          const working = b.tabs.some((x) => x.agent)
          return (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== b.id) void api().browsers.move(dragId, i)
                setDragId(null)
              }}
              onClick={() => void api().browsers.activate(b.id)}
              onKeyDown={(e) => e.key === 'Enter' && void api().browsers.activate(b.id)}
              // Chrome sekmesi gibi: orta tık kapatır, sağ tık düzenler.
              onMouseDown={(e) => e.button === 1 && (e.preventDefault(), void api().browsers.close(b.id))}
              onContextMenu={(e) => (e.preventDefault(), setEditing(b.id))}
              title={b.note || b.name}
              className={`no-drag group flex h-8 min-w-0 max-w-52 shrink cursor-default items-center gap-2 rounded-lg pl-3 pr-1 text-sm ${active ? 'bg-panel font-medium' : 'text-muted hover:bg-panel/60'}`}
            >
              {working ? <Bot className="size-3.5 shrink-0 animate-pulse" style={{ color: b.color }} aria-label={t.agentWorking} /> : b.incognito ? <EyeOff className="size-3.5 shrink-0" aria-label={t.incognito} /> : <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color }} />}
              <span className="truncate">{b.name}</span>
              <span className="text-xs text-muted">{b.tabs.length}</span>
              <button
                className={`rounded p-0.5 hover:bg-raised ${active ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'} hover:!opacity-100`}
                aria-label={`${t.closeBrowser}: ${b.name}`}
                title={`${t.closeBrowser}. ${t.closeBrowserHint}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void api().browsers.close(b.id)
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
        <div className="no-drag relative shrink-0">
          <button className="flex items-center gap-1 rounded-md p-1.5 text-xs text-muted hover:bg-panel" title={t.allBrowsers} aria-label={t.allBrowsers} aria-expanded={list} onClick={() => setList(true)}>
            {closed > 0 && <span>{t.closedCount(closed)}</span>}
            <ChevronDown className="size-4" />
          </button>
          {list && (
            <Overlay onOverlay={onOverlay} onClose={() => setList(false)} className="absolute left-0 top-10 max-h-[70vh] w-80 overflow-y-auto p-2">
              <p className="px-3 pb-1 pt-1 text-xs font-medium text-muted">{t.allBrowsers}</p>
              {state.browsers.map((b) => (
                <div key={b.id} className="group flex items-center rounded-lg hover:bg-panel">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm"
                    onClick={() => {
                      void api().browsers.activate(b.id)
                      setList(false)
                    }}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color, opacity: b.open ? 1 : 0.4 }} />
                    <span className={`min-w-0 flex-1 truncate ${b.open ? '' : 'text-muted'}`}>{b.name}</span>
                    <span className="shrink-0 text-xs text-muted">{b.open ? t.tabs(b.tabs.length) : t.closed}</span>
                  </button>
                  <button className="rounded p-1.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100" aria-label={t.editBrowser} title={t.editBrowser} onClick={() => (setList(false), setEditing(b.id))}>
                    <NotebookPen className="size-3.5" />
                  </button>
                  {b.open && (
                    <button className="mr-1 rounded p-1.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100" aria-label={t.closeBrowser} title={t.closeBrowser} onClick={() => void api().browsers.close(b.id)}>
                      <Power className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </Overlay>
          )}
          {edited && (
            <Overlay onOverlay={onOverlay} onClose={() => setEditing(null)} className="absolute left-0 top-10 w-96 p-4">
              <BrowserPanel key={edited.id} browser={edited} onDone={() => setEditing(null)} />
            </Overlay>
          )}
        </div>
        <button className="no-drag shrink-0 rounded-md p-1.5 text-muted hover:bg-panel" title={`${t.newTab} (Ctrl+T)`} aria-label={t.newTab} onClick={onNew}>
          <Plus className="size-4" />
        </button>
      </div>
      <div className="no-drag relative flex items-center gap-1 pr-1">
        {update.status === 'downloading' && (
          <span className="flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-xs text-muted">
            <Download className="size-3.5 animate-pulse text-brand" /> {t.updateDownloading(update.version ?? '', update.percent ?? 0)}
          </span>
        )}
        {update.status === 'ready' && (
          <button className="flex items-center gap-1 rounded-full bg-ok px-2 py-1 text-xs font-medium text-brand-ink" onClick={() => void api().app.installUpdate()}>
            <RefreshCw className="size-3.5" /> {t.updateReady(update.version ?? '')}
          </button>
        )}
        <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-panel" onClick={() => setMenu(true)} aria-expanded={menu}>
          <span className="grid size-6 place-items-center rounded-full border border-line-2 bg-raised text-xs font-medium text-fg">{(account.name || account.email || '?').slice(0, 1).toUpperCase()}</span>
          <span className="text-xs tabular-nums text-muted">
            {balanceText(account)}
          </span>
        </button>
        {menu && (
          <Overlay onOverlay={onOverlay} onClose={() => setMenu(false)} className="absolute right-0 top-10 w-72 p-2">
            <div className="border-b border-line px-3 pb-3 pt-2">
              <p className="truncate font-medium">{account.name || account.email}</p>
              {account.name && <p className="truncate text-xs text-muted">{account.email}</p>}
              <p className="mt-2 text-xs text-muted">
                <span className="tabular-nums text-fg">
                  {balanceText(account)}
                </span>{' '}
                ({planLabel(account.plan)})
              </p>
            </div>
            <MenuItem icon={<Wallet className="size-4" />} label={t.nav.billing} onClick={() => (setMenu(false), onView('billing'))} />
            <MenuItem icon={<Gear className="size-4" />} label={t.settings} onClick={() => (setMenu(false), onView('settings'))} />
            <ConfirmButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel" onConfirm={() => void api().auth.signOut()}>
              <LogOut className="size-4" /> {t.signOut}
            </ConfirmButton>
          </Overlay>
        )}
      </div>
    </div>
  )
}

const MenuItem = ({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel ${danger ? 'text-danger' : ''}`} onClick={onClick}>
    {icon}
    {label}
  </button>
)

/** Satır 2: seçili tarayıcının sekmeleri + not / ad / silme paneli. */
export function BrowserBar({ browser, onOverlay, onNew }: { browser: BrowserInfo; onOverlay: (open: boolean) => void; onNew: () => void }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [panel, setPanel] = useState(false)
  return (
    <div className="flex items-end gap-1 bg-bg pl-2 pr-2" style={{ boxShadow: `inset 0 -2px 0 ${browser.color}` }}>
      <div className="flex min-w-0 flex-1 items-end gap-1" role="tablist">
        {browser.tabs.map((tab, i) => {
          const active = tab.id === browser.activeTabId
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              draggable
              onDragStart={() => setDragId(tab.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== tab.id) void api().browsers.moveTab(browser.id, dragId, i)
                setDragId(null)
              }}
              onMouseDown={(e) => e.button === 1 && void api().browsers.closeTab(browser.id, tab.id)}
              onClick={() => void api().browsers.activateTab(browser.id, tab.id)}
              onContextMenu={(e) => (e.preventDefault(), void api().browsers.tabMenu(browser.id, tab.id))}
              className={`group flex h-8 min-w-0 max-w-56 flex-1 basis-56 cursor-default items-center gap-2 rounded-t-lg px-3 text-sm ${active ? 'bg-panel' : 'text-muted hover:bg-panel/60'} ${tab.agent ? 'ring-2 ring-inset' : ''}`}
              style={tab.agent ? ({ '--tw-ring-color': browser.color } as React.CSSProperties) : undefined}
            >
              {tab.agent ? <Bot className="size-4 shrink-0 animate-pulse" style={{ color: browser.color }} /> : tab.loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : tab.favicon ? <img src={tab.favicon} alt="" className="size-4 shrink-0" /> : <Globe className="size-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate" title={tab.url}>
                {tab.title || t.newTab}
              </span>
              {tab.muted ? <VolumeX className="size-3.5 shrink-0 text-muted" aria-label={t.muted} /> : tab.audible && <Volume2 className="size-3.5 shrink-0 text-brand" aria-label={t.playing} />}
              <button
                className="rounded p-0.5 opacity-60 hover:bg-raised hover:opacity-100"
                aria-label={t.close}
                onClick={(e) => {
                  e.stopPropagation()
                  void api().browsers.closeTab(browser.id, tab.id)
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
        <button className="mb-1 shrink-0 rounded-md p-1.5 text-muted hover:bg-panel" aria-label={t.newTab} title={`${t.newTab} (Ctrl+T)`} onClick={onNew}>
          <Plus className="size-4" />
        </button>
      </div>
      <div className="relative mb-1">
        <button className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${browser.note ? 'text-fg' : 'text-muted'} hover:bg-panel`} onClick={() => setPanel(true)} title={browser.note || t.noNote}>
          <NotebookPen className="size-4" style={{ color: browser.color }} />
          <span className="max-w-40 truncate">{browser.name}</span>
        </button>
        {panel && (
          <Overlay onOverlay={onOverlay} onClose={() => setPanel(false)} className="absolute right-0 top-10 w-96 p-4">
            <BrowserPanel browser={browser} onDone={() => setPanel(false)} />
          </Overlay>
        )}
      </div>
    </div>
  )
}

/** Tarayıcının adı, notu (agent da okuyor/yazıyor) ve silme. */
export function BrowserPanel({ browser, onDone }: { browser: BrowserInfo; onDone: () => void }) {
  const [name, setName] = useState(browser.name)
  const [note, setNote] = useState(browser.note)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setNote(browser.note), [browser.note])
  const save = () => void api().browsers.update(browser.id, { name, note })
  return (
    <div className="space-y-3">
      <label className="block text-xs text-muted">
        {t.rename}
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-brand" />
      </label>
      <label className="block text-xs text-muted">
        {t.note}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={save} rows={6} placeholder={t.notePlaceholder} className="mt-1 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-brand" />
      </label>
      <div className="text-xs text-muted">
        {t.color}
        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={t.color}>
          {BROWSER_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={browser.color === c}
              aria-label={c}
              className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-raised hover:ring-2"
              style={{ background: c, ['--tw-ring-color' as string]: c }}
              onClick={() => void api().browsers.update(browser.id, { color: c })}
            >
              {browser.color === c && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </div>
      {confirm ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium">{t.deleteTitle}</p>
          <p className="mb-3 text-muted">{t.deleteBody}</p>
          <div className="flex justify-end gap-2">
            <button className="rounded-lg px-3 py-1.5 text-muted hover:bg-panel" onClick={() => setConfirm(false)}>
              {t.cancel}
            </button>
            <button
              className="rounded-full bg-danger px-3 py-1.5 font-medium text-brand-ink"
              onClick={() => {
                void api().browsers.remove(browser.id)
                onDone()
              }}
            >
              {t.delete}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {browser.open && (
              <MenuItem
                icon={<Power className="size-4" />}
                label={t.closeBrowser}
                onClick={() => {
                  save()
                  void api().browsers.close(browser.id)
                  onDone()
                }}
              />
            )}
            <MenuItem icon={<Trash2 className="size-4" />} label={t.deleteBrowser} danger onClick={() => setConfirm(true)} />
          </div>
          <button
            className="btn-primary rounded-full px-4 py-2 text-sm font-medium"
            onClick={() => {
              save()
              onDone()
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
