import { Bot, EyeOff, Plus, Power } from 'lucide-react'
import { platformOf } from '../../shared/platforms.ts'
import type { BrowsersState, Thumbnails } from '../../shared/types.ts'
import { Overlay } from './Bars.tsx'
import { api, useConnections, useThumbnails } from './hooks.ts'
import { t } from './i18n.ts'

/**
 * **Yeni sekme penceresi** (Ctrl+T ve "+"): sekmenin hangi hesapta ya da hangi tarayıcıda açılacağı burada seçilir.
 * Tarayıcılar ana ekranda listelenmez; bu cihazdaki hesaplar (her biri kendi tarayıcısında) ve tarayıcı kartları burada.
 */
export function Picker({ state, onOverlay, onClose }: { state: BrowsersState; onOverlay: (open: boolean) => void; onClose: () => void }) {
  const thumbs = useThumbnails()
  const accounts = (useConnections()?.accounts ?? []).filter((a) => a.browserId)
  return (
    <Overlay onOverlay={onOverlay} onClose={onClose} className="fixed left-1/2 top-14 max-h-[82vh] w-[46rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 space-y-5 overflow-y-auto p-5">
      <h2 className="text-[1.9rem]">{t.newTab}</h2>
      {accounts.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">{t.nav.connections}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {accounts.map((a) => {
              const p = platformOf(a.platform)
              return (
                <button key={a.id} type="button" className="flex min-w-0 items-center gap-2 rounded-lg border border-line-2 bg-bg px-3 py-2 text-left text-sm hover:border-fg-2" onClick={() => (void api().connections.open(a.id), onClose())}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: p?.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">@{a.handle}</span>
                    <span className="block truncate text-xs text-muted">{p?.label ?? a.platform}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
      <Browsers state={state} thumbs={thumbs} onDone={onClose} />
    </Overlay>
  )
}

/** Kartta adresin yalnız alan adı. */
const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return url ?? ''
  }
}

/** Tarayıcı kartları: kapalı olan son görüntüsüyle durur. Seçilen tarayıcı öne gelir; açıksa yeni sekmeyle. */
function Browsers({ state, thumbs, onDone }: { state: BrowsersState; thumbs: Thumbnails; onDone: () => void }) {
  const b = api().browsers
  const pick = (x: BrowsersState['browsers'][number]) => {
    void b.activate(x.id)
    if (x.open) void b.openTab(x.id)
    onDone()
  }
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t.browsers}</h3>
        <span className="flex gap-1">
          <button type="button" className="flex items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-xs text-muted hover:bg-panel hover:text-fg" onClick={() => (void b.create(t.browserName(state.browsers.length + 1)), onDone())}>
            <Plus className="size-3.5" /> {t.newBrowser}
          </button>
          <button type="button" className="flex items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-xs text-muted hover:bg-panel hover:text-fg" title={t.incognitoHint} onClick={() => (void b.create(undefined, undefined, true), onDone())}>
            <EyeOff className="size-3.5" /> {t.incognito}
          </button>
        </span>
      </div>
      <p className="mb-4 text-xs text-muted">{t.browsersHint}</p>
      {state.browsers.length === 0 && <p className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-xs text-muted">{t.noBrowsers}</p>}
      {state.browsers.length > 0 && (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {state.browsers.map((x) => {
          const tab = x.tabs.find((y) => y.id === x.activeTabId)
          const working = x.tabs.some((y) => y.agent)
          return (
            <div key={x.id} className="group relative">
            {/* Kapalı tarayıcı da son görüntüsüyle duruyor; tıklayınca sekmeleri yükleniyor. */}
            <button type="button" className={`block w-full overflow-hidden rounded-lg border bg-bg text-left transition-colors duration-[var(--dur-micro)] ${working ? 'border-ok/70' : 'border-line-2 hover:border-fg-2'}`} title={x.open ? x.name : `${x.name}: ${t.clickToOpen}`} onClick={() => pick(x)}>
              {thumbs[x.id] && (
              <div className="relative aspect-video bg-bg">
                <img src={thumbs[x.id]} alt="" className={`size-full object-cover object-top ${x.open ? '' : 'opacity-70 grayscale-[40%]'}`} />
                {!x.open && (
                  <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-full border border-line-2 bg-bg/90 px-3 py-1 text-xs text-fg">
                      <Power className="size-3.5" /> {t.clickToOpen}
                    </span>
                  </span>
                )}
                {working && (
                  <span className="readout absolute left-2 top-2 flex items-center gap-1 rounded-full border border-ok/50 bg-bg/90 px-2 py-0.5 !text-ok">
                    <Bot className="size-3 animate-pulse" /> {t.agentWorking}
                  </span>
                )}
              </div>
              )}
              <div className={`space-y-1 px-3 py-2.5 ${thumbs[x.id] ? 'border-t border-line' : ''}`}>
                {!thumbs[x.id] && working && <p className="readout flex items-center gap-1 !text-ok"><Bot className="size-3" aria-hidden /> {t.agentWorking}</p>}
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden />
                  <span className="truncate">{x.name}</span>
                  <span className="readout ms-auto shrink-0 !text-muted">{x.open ? t.tabs(x.tabs.length) : t.closedTabs(x.savedTabs)}</span>
                </p>
                <p className="readout truncate !text-muted">{(x.open && tab?.title) || hostOf(x.lastUrl)}</p>
                {x.note && <p className="line-clamp-2 text-xs text-fg/80">{x.note}</p>}
              </div>
            </button>
            {x.open && (
              <button type="button" className="absolute right-2 top-2 rounded-full border border-line-2 bg-bg/90 p-1.5 text-fg opacity-0 transition-opacity duration-[var(--dur-micro)] hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={`${t.closeBrowser}: ${x.name}`} title={`${t.closeBrowser}. ${t.closeBrowserHint}`} onClick={() => void b.close(x.id)}>
                <Power className="size-3.5" />
              </button>
            )}
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}
