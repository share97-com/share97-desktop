import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, EyeOff, Globe, History, KeyRound, Languages, Monitor, RotateCw, Smartphone, Star, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { BrowserInfo, BrowserTab, FindResult, Layout, SavedLogin } from '../../shared/types.ts'
import { Overlay } from './Bars.tsx'
import { api, useBookmarks, useDownloads } from './hooks.ts'
import { t } from './i18n.ts'

const IconButton = ({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) => (
  <button className={`rounded-full p-2 hover:bg-raised hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent ${active ? 'text-brand' : 'text-muted'}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    {children}
  </button>
)

type Suggestion = { title: string; url: string; bookmark: boolean }

/** Sekme görünümünün hazır genişlikleri; elle verilen başka genişlik "özel" olarak görünüyor. */
const VIEWS: Record<string, { layout: Layout; width: number | null }> = {
  mobile: { layout: 'mobile', width: null },
  mobileL: { layout: 'mobile', width: 430 },
  tablet: { layout: 'mobile', width: 768 },
  laptop: { layout: 'desktop', width: 1280 },
  desktop: { layout: 'desktop', width: null },
}
const viewOf = (tab: BrowserTab) => Object.keys(VIEWS).find((k) => VIEWS[k].layout === tab.layout && VIEWS[k].width === tab.width) ?? 'custom'

/** Sekmenin görünümü: mobil (dar sayfa, telefon user agent'ı) ya da masaüstü, hazır genişliklerle. */
function LayoutPicker({ browserId, tab }: { browserId: string; tab: BrowserTab }) {
  const current = viewOf(tab)
  const Icon = tab.layout === 'mobile' ? Smartphone : Monitor
  return (
    <label className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-muted hover:bg-raised hover:text-fg" title={t.layoutHint}>
      <Icon className="size-4" />
      <select
        value={current}
        aria-label={t.layout}
        className="max-w-28 bg-transparent text-xs outline-none"
        onChange={(e) => {
          const v = VIEWS[e.target.value]
          if (v) void api().browsers.setLayout(browserId, tab.id, v.layout, v.width)
        }}
      >
        {Object.keys(VIEWS).map((k) => (
          <option key={k} value={k}>
            {t.layouts[k as keyof typeof t.layouts]}
          </option>
        ))}
        {current === 'custom' && <option value="custom">{`${tab.layout === 'mobile' ? t.layouts.mobile : t.layouts.desktop} · ${tab.width}px`}</option>}
      </select>
    </label>
  )
}

/**
 * Chrome'un adres satırı: gezinme düğmeleri, geçmiş + yer imi önerileri, yakınlaştırma göstergesi,
 * yer imi yıldızı, indirmeler. Öneri listesi ve indirme paneli web sayfasının üstüne geldiği için
 * açıkken `onOverlay` ile sayfa gizleniyor.
 */
export function Toolbar({ browser, addressRef, downloadsOpen, setDownloadsOpen, onOverlay }: { browser: BrowserInfo; addressRef: RefObject<HTMLInputElement | null>; downloadsOpen: boolean; setDownloadsOpen: (o: boolean) => void; onOverlay: (open: boolean) => void }) {
  const tab = browser.tabs.find((x) => x.id === browser.activeTabId)
  const [text, setText] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(-1)
  const [typing, setTyping] = useState(false)
  const [keys, setKeys] = useState(false)
  const bookmarks = useBookmarks()
  const downloads = useDownloads()
  const b = api().browsers
  const url = !tab || tab.url === 'about:blank' ? '' : tab.url
  const starred = bookmarks.some((x) => x.url === url)
  const active = downloads.filter((d) => d.state === 'progressing').length

  useEffect(() => setText(url), [tab?.id, url])
  useEffect(() => {
    if (!typing || !text.trim()) return setSuggestions([])
    const timer = setTimeout(() => void api().history.suggest(text).then((s) => (setSuggestions(s), setSelected(-1))), 80)
    return () => clearTimeout(timer)
  }, [text, typing])

  const go = (target: string) => {
    if (!target.trim()) return
    void b.navigate(target)
    setTyping(false)
    setSuggestions([])
    addressRef.current?.blur()
  }

  return (
    <div className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1.5">
      <IconButton label={`${t.back} (Alt+←)`} disabled={!tab?.canGoBack} onClick={() => void b.back()}>
        <ArrowLeft className="size-4" />
      </IconButton>
      <IconButton label={`${t.forward} (Alt+→)`} disabled={!tab?.canGoForward} onClick={() => void b.forward()}>
        <ArrowRight className="size-4" />
      </IconButton>
      <IconButton label={tab?.loading ? t.stop : `${t.reload} (Ctrl+R)`} disabled={!tab} onClick={() => void (tab?.loading ? b.stop() : b.reload())}>
        {tab?.loading ? <X className="size-4" /> : <RotateCw className="size-4" />}
      </IconButton>
      <form
        className="relative mx-1 flex-1"
        onSubmit={(e) => {
          e.preventDefault()
          go(selected >= 0 ? suggestions[selected].url : text)
        }}
      >
        <div className="flex h-9 items-center gap-2 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-brand">
          {browser.incognito ? <EyeOff className="size-4 shrink-0 text-muted" aria-label={t.incognito} /> : <span className="size-2.5 shrink-0 rounded-full" style={{ background: browser.color }} title={browser.name} />}
          <input
            ref={addressRef}
            value={text}
            onChange={(e) => (setText(e.target.value), setTyping(true))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setTimeout(() => (setTyping(false), setSuggestions([])), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSelected((i) => Math.min(suggestions.length - 1, i + 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setSelected((i) => Math.max(-1, i - 1)))
              if (e.key === 'Escape') (setText(url), setTyping(false), e.currentTarget.blur())
            }}
            placeholder={t.addressPlaceholder}
            aria-label={t.addressPlaceholder}
            aria-autocomplete="list"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
          {tab && Math.abs(tab.zoom - 1) > 0.001 && (
            <button type="button" className="rounded-full bg-panel px-2 text-xs tabular-nums text-muted hover:text-fg" title={t.zoomReset} onClick={() => void b.zoom(null)}>
              {Math.round(tab.zoom * 100)}%
            </button>
          )}
          {url && (
            <button type="button" className="rounded-full p-1 text-muted hover:text-fg" title={t.translate} aria-label={t.translate} onClick={() => void b.translate(navigator.language)}>
              <Languages className="size-4" />
            </button>
          )}
          {url && (
            <button type="button" className={`rounded-full p-1 ${starred ? 'text-warn' : 'text-muted hover:text-fg'}`} title={starred ? t.bookmarkRemove : t.bookmarkAdd} aria-label={starred ? t.bookmarkRemove : t.bookmarkAdd} onClick={() => void api().bookmarks.toggle(url, tab?.title ?? url)}>
              <Star className={`size-4 ${starred ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>
        {suggestions.length > 0 && (
          <Overlay onOverlay={onOverlay} onClose={() => setSuggestions([])} className="absolute left-0 right-0 top-11 py-1">
            <ul role="listbox">
              {suggestions.map((s, i) => (
                <li key={s.url} role="option" aria-selected={i === selected}>
                  <button type="button" className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === selected ? 'bg-panel' : 'hover:bg-panel'}`} onMouseDown={(e) => (e.preventDefault(), go(s.url))}>
                    {s.bookmark ? <Star className="size-4 shrink-0 text-warn" /> : <History className="size-4 shrink-0 text-muted" />}
                    <span className="min-w-0 truncate">{s.title}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Overlay>
        )}
      </form>
      {tab && <LayoutPicker browserId={browser.id} tab={tab} />}
      {url && !browser.incognito && (
        <div className="relative">
          <IconButton label={t.passwords} active={keys} onClick={() => setKeys(!keys)}>
            <KeyRound className="size-4" />
          </IconButton>
          {keys && (
            <Overlay onOverlay={onOverlay} onClose={() => setKeys(false)} className="absolute right-0 top-11 w-80 p-3">
              <LoginsPanel origin={new URL(url).origin} onDone={() => setKeys(false)} />
            </Overlay>
          )}
        </div>
      )}
      <div className="relative">
        <IconButton label={`${t.downloads} (Ctrl+J)`} active={active > 0} onClick={() => setDownloadsOpen(!downloadsOpen)}>
          <Download className={`size-4 ${active ? 'animate-pulse' : ''}`} />
        </IconButton>
        {downloadsOpen && (
          <Overlay onOverlay={onOverlay} onClose={() => setDownloadsOpen(false)} className="absolute right-0 top-11 w-96 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{t.downloads}</h3>
              {downloads.length > 0 && (
                <button className="text-xs text-muted hover:text-fg" onClick={() => void api().downloads.clear()}>
                  {t.clearDownloads}
                </button>
              )}
            </div>
            {downloads.length ? (
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {downloads.map((d) => (
                  <li key={d.id} className="rounded-lg p-2 hover:bg-panel">
                    <button className="block w-full text-left" disabled={d.state !== 'completed'} onClick={() => void api().downloads.open(d.id)}>
                      <p className={`truncate text-sm ${d.state === 'cancelled' || d.state === 'interrupted' ? 'text-muted line-through' : ''}`}>{d.name}</p>
                      {d.state === 'progressing' && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                          <div className="h-full bg-brand" style={{ width: d.total ? `${Math.round((d.received / d.total) * 100)}%` : '30%' }} />
                        </div>
                      )}
                    </button>
                    <div className="mt-1 flex gap-3 text-xs text-muted">
                      {d.state === 'progressing' ? (
                        <button className="hover:text-fg" onClick={() => void api().downloads.cancel(d.id)}>
                          {t.cancel}
                        </button>
                      ) : (
                        d.state === 'completed' && (
                          <button className="hover:text-fg" onClick={() => void api().downloads.reveal(d.id)}>
                            {t.reveal}
                          </button>
                        )
                      )}
                      <span className="tabular-nums">{(d.received / 1048576).toFixed(1)} MB</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t.noDownloads}</p>
            )}
          </Overlay>
        )}
      </div>
    </div>
  )
}

/** Adres çubuğundaki anahtar: bu sitenin kayıtlı girişlerini doldur ya da yeni giriş kaydet. Şifre geri okunmuyor. */
function LoginsPanel({ origin, onDone }: { origin: string; onDone: () => void }) {
  const [logins, setLogins] = useState<SavedLogin[]>([])
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const p = api().passwords
  useEffect(() => void p.forCurrent().then(setLogins), [p])
  const run = (job: Promise<unknown>) => job.then(onDone, (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  return (
    <div>
      <h3 className="font-medium">{t.passwords}</h3>
      <p className="mb-2 truncate text-xs text-muted">{origin}</p>
      {logins.length ? (
        <ul className="mb-3 space-y-1">
          {logins.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{l.username || '(no username)'}</span>
              <button className="rounded-full bg-brand px-2 py-1 text-xs font-medium text-brand-ink" onClick={() => void run(p.fillCurrent(l.id))}>
                {t.fill}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">{t.noLogins}</p>
      )}
      <form
        className="space-y-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(p.saveCurrent(user, pass))
        }}
      >
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder={t.username} aria-label={t.username} autoComplete="off" className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-brand" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder={t.password} aria-label={t.password} autoComplete="new-password" className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-brand" />
        <button type="submit" disabled={!pass} className="btn-primary w-full rounded-full py-1.5 text-sm font-medium disabled:opacity-40">
          {t.saveLogin}
        </button>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <p className="text-[11px] leading-snug text-muted">{t.passwordsNote}</p>
      </form>
    </div>
  )
}

/** Ctrl+F: sayfada bul (sayfanın üstüne binmiyor, kendi satırında). */
export function FindBar({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const b = api().browsers
  useEffect(() => {
    input.current?.focus()
    const off = b.onFind(setResult)
    return () => {
      off()
      void b.stopFind()
    }
  }, [b])
  useEffect(() => {
    if (!text) setResult(null)
    void b.find(text, true)
  }, [text, b])
  const close = () => onClose()
  return (
    <div className="flex items-center justify-end gap-2 border-b border-line bg-panel px-3 py-1.5">
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void b.find(text, !e.shiftKey)
          if (e.key === 'Escape') close()
        }}
        placeholder={t.findPlaceholder}
        aria-label={t.find}
        className="w-64 rounded-lg border border-line bg-raised px-3 py-1 text-sm outline-none focus:border-brand"
      />
      <span className="w-14 text-xs tabular-nums text-muted">{result && text ? t.matches(result.active, result.matches) : ''}</span>
      <IconButton label={t.previous} disabled={!text} onClick={() => void b.find(text, false)}>
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton label={t.next} disabled={!text} onClick={() => void b.find(text, true)}>
        <ArrowDown className="size-4" />
      </IconButton>
      <IconButton label={t.close} onClick={close}>
        <X className="size-4" />
      </IconButton>
    </div>
  )
}

/** Yer imi çubuğu (Chrome gibi adres satırının altında); yer imi yoksa gizli. */
export function BookmarksBar() {
  const bookmarks = useBookmarks()
  if (!bookmarks.length) return null
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-1">
      {bookmarks.map((x) => (
        <div key={x.id} className="group flex shrink-0 items-center rounded-md hover:bg-raised">
          <button className="flex max-w-48 items-center gap-1.5 px-2 py-1 text-xs" title={x.url} onClick={() => void api().browsers.navigate(x.url)}>
            <Globe className="size-3.5 shrink-0 text-muted" />
            <span className="truncate">{x.title}</span>
          </button>
          <button className="mr-1 hidden rounded p-0.5 text-muted hover:text-fg group-hover:block" aria-label={t.bookmarkRemove} title={t.bookmarkRemove} onClick={() => void api().bookmarks.remove(x.id)}>
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
