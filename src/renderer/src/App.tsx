import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Account, AuthState, Shortcut } from '../../shared/types.ts'
import { ArchiveRestore, Cable, Coins, MessageSquare, Puzzle, Settings as Gear, Workflow } from 'lucide-react'
import { Backups } from './Backups.tsx'
import { BrowserBar, BrowserStrip } from './Bars.tsx'
import { Billing, creditText, planLabel } from './Billing.tsx'
import { ChromeView } from './Chrome.tsx'
import { Connect } from './Connect.tsx'
import { Connections } from './Connections.tsx'
import { Home } from './Home.tsx'
import { api, useBrowsers, useChats, useChrome, useThumbnails } from './hooks.ts'
import { t } from './i18n.ts'
import { Settings, type SectionId } from './Settings.tsx'
import { Toaster } from './Toast.tsx'
import { BookmarksBar, FindBar, Toolbar } from './Toolbar.tsx'
import { Workflows } from './Workflows.tsx'

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  useEffect(() => {
    void api().auth.state().then(setAuth)
    return api().auth.onChange(setAuth)
  }, [])
  if (!auth) return null
  return (
    <>
      {auth.status === 'signed-in' ? <Shell account={auth.account} /> : <Connect state={auth} />}
      <Toaster />
    </>
  )
}

export type View = 'home' | 'connections' | 'workflows' | 'chrome' | 'backup' | 'billing' | 'settings'

/**
 * Kenar çubuğu: uygulamanın ekranları. Sohbet (agent), Bağlantılar (sosyal hesaplar), Akışlar
 * (sunucuyla eşit; cihazlar ve etkinlik de orada), Chrome (eklenti), altta paket/kredi
 * ve ayarlar. Çalışan ya da onay bekleyen iş varsa ilgili satırda işaret.
 */
function Sidebar({ account, view, onView }: { account: Account; view: View; onView: (v: View) => void }) {
  const chats = useChats()
  const chrome = useChrome()
  const waiting = chats.filter((c) => c.pending).length
  const badge: Partial<Record<View, React.ReactNode>> = {
    home: waiting ? <span className="readout !text-warn" aria-label={t.approvalWaiting}>{waiting} {t.waitingShort}</span> : chats.some((c) => c.running) ? <span className="readout !text-ok">{t.liveShort}</span> : null,
    chrome: chrome?.instances.some((x) => x.status === 'pending') ? <span className="readout !text-warn">{t.waitingShort}</span> : null,
  }
  const item = (v: View, Icon: typeof Cable, label: string) => (
    <button
      key={v}
      type="button"
      aria-current={view === v ? 'page' : undefined}
      className={`relative flex h-9 items-center gap-3 rounded-md px-3 text-left text-sm transition-colors duration-[var(--dur-micro)] ${view === v ? 'bg-raised font-medium text-fg before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand' : 'text-muted hover:bg-raised/50 hover:text-fg'}`}
      onClick={() => onView(v)}
    >
      <Icon className={`size-4 shrink-0 ${view === v ? 'text-brand' : ''}`} strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge[v]}
    </button>
  )
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-line bg-panel px-3 pb-3 pt-4" aria-label="Share97">
      {item('home', MessageSquare, t.nav.chat)}
      {item('connections', Cable, t.nav.connections)}
      {item('workflows', Workflow, t.nav.workflows)}
      {item('chrome', Puzzle, t.nav.chrome)}
      <div className="my-2 border-t border-line" />
      {item('backup', ArchiveRestore, t.nav.backup)}
      <div className="mt-auto flex flex-col gap-1">
        <button type="button" aria-current={view === 'billing' ? 'page' : undefined} className={`mb-2 rounded-md border px-3.5 pb-3 pt-2.5 text-left transition-colors duration-[var(--dur-micro)] ${view === 'billing' ? 'border-line-2 bg-raised' : 'border-line hover:border-line-2'}`} onClick={() => onView('billing')}>
          <span className="flex items-center gap-2 text-xs text-muted">
            <Coins className="size-3.5" strokeWidth={1.5} /> {planLabel(account.plan)}
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="figure text-[1.9rem]">{creditText(account)}</span>
            <span className="readout">{t.credits}</span>
          </span>
        </button>
        {item('settings', Gear, t.nav.settings)}
      </div>
    </nav>
  )
}

/**
 * Pencere: üstte tarayıcı şeridi (Share97 + tarayıcılar + hesap), tarayıcı seçili değilken solda
 * kenar çubuğu ve seçilen ekran; bir tarayıcı açıkken altında o tarayıcının sekmeleri ve adres çubuğu. Web sayfası (WebContentsView) `area` dikdörtgenine
 * main süreçte yerleşiyor; açılır menüler varken gizleniyor (görünüm DOM'un üstünde çiziliyor).
 */
function Shell({ account }: { account: Account }) {
  const state = useBrowsers()
  const thumbs = useThumbnails()
  const [view, setView] = useState<View>('home')
  const [section, setSection] = useState<SectionId>('account')
  const [overlays, setOverlays] = useState(0)
  const [finding, setFinding] = useState(false)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  /** Ana sayfada açılacak sohbet (bildirim, Ctrl+N); `null` yeni sohbet. */
  const [focus, setFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 })
  const openChat = useRef((id: string | null) => {
    setView('home')
    void api().browsers.activate(null)
    setFocus((f) => ({ id, n: f.n + 1 }))
  }).current
  useEffect(() => api().app.onOpenChat((id) => openChat(id)), [openChat])
  const area = useRef<HTMLDivElement>(null)
  const address = useRef<HTMLInputElement>(null)
  const active = state.browsers.find((b) => b.id === state.activeId) ?? null
  const hidden = overlays > 0 || !active

  const overlay = useRef((open: boolean) => setOverlays((n) => Math.max(0, n + (open ? 1 : -1)))).current

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const sync = () => {
      const r = el.getBoundingClientRect()
      void api().browsers.setBounds(hidden ? { x: 0, y: 0, width: 0, height: 0 } : { x: r.x, y: r.y, width: r.width, height: r.height })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hidden, active?.id])

  const latest = useRef(state)
  latest.current = state
  useEffect(
    () =>
      api().browsers.onShortcut((s: Shortcut) => {
        const { browsers, activeId } = latest.current
        const b = browsers.find((x) => x.id === activeId)
        const tab = b?.tabs.find((x) => x.id === b.activeTabId)
        if (s === 'new-chat') return openChat(null)
        if (typeof s === 'object') {
          // Ctrl+1..8 o sıradaki sekme, Ctrl+9 son sekme (Chrome gibi).
          const target = b && (s.tab === 9 ? b.tabs.at(-1) : b.tabs[s.tab - 1])
          if (b && target) void api().browsers.activateTab(b.id, target.id)
        } else if (s === 'find') setFinding(!!b)
        else if (s === 'bookmark' && tab && tab.url !== 'about:blank') void api().bookmarks.toggle(tab.url, tab.title)
        else if (s === 'downloads') setDownloadsOpen(!!b)
        else if (s === 'history') {
          setSection('history')
          setView('settings')
          void api().browsers.activate(null)
        } else if (s === 'new-browser' || (s === 'new-tab' && !b)) void api().browsers.create(t.browserName(browsers.length + 1))
        else if (s === 'new-tab' && b) void api().browsers.openTab(b.id)
        else if (s === 'close-tab' && b?.activeTabId) void api().browsers.closeTab(b.id, b.activeTabId)
        else if (s === 'focus-address') {
          address.current?.focus()
          address.current?.select()
        } else if ((s === 'next-tab' || s === 'prev-tab') && b && b.tabs.length > 1) {
          const i = b.tabs.findIndex((x) => x.id === b.activeTabId)
          const next = b.tabs[(i + (s === 'next-tab' ? 1 : -1) + b.tabs.length) % b.tabs.length]
          void api().browsers.activateTab(b.id, next.id)
        }
      }),
    [],
  )

  const show = (v: View) => {
    setView(v)
    void api().browsers.activate(null)
  }

  return (
    <div className="flex h-full flex-col">
      <BrowserStrip state={state} account={account} view={active ? null : view} onView={show} onOverlay={overlay} />
      {active && (
        <>
          <BrowserBar browser={active} onOverlay={overlay} />
          <Toolbar browser={active} addressRef={address} downloadsOpen={downloadsOpen} setDownloadsOpen={setDownloadsOpen} onOverlay={overlay} />
          {finding && <FindBar key={active.activeTabId} onClose={() => setFinding(false)} />}
          <BookmarksBar />
        </>
      )}
      <div className="flex min-h-0 flex-1">
        {!active && <Sidebar account={account} view={view} onView={show} />}
        <div ref={area} className="relative min-h-0 min-w-0 flex-1">
          {!active && view === 'home' && <Home state={state} thumbs={thumbs} focus={focus} />}
          {!active && view === 'connections' && <Connections account={account} />}
          {!active && view === 'workflows' && <Workflows onOpenChat={openChat} />}
          {!active && view === 'chrome' && <ChromeView />}
          {!active && view === 'backup' && <Backups />}
          {!active && view === 'billing' && <Billing account={account} />}
          {!active && view === 'settings' && <Settings account={account} browsers={state.browsers} initial={section} onBilling={() => show('billing')} />}
        </div>
      </div>
    </div>
  )
}
