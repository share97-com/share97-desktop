import { Bot, CircleAlert, FileText, FolderOpen, Image, MessageSquarePlus, Music, PanelRight, PencilLine, Plus, Power, Search, Trash2, Upload, Video, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { BrowsersState, ChatSummary, FileEntry, Thumbnails } from '../../shared/types.ts'
import { Chat, clearDraft } from './Chat.tsx'
import { ConfirmButton } from './Confirm.tsx'
import { api, fileUrl, useChats, useFiles } from './hooks.ts'
import { FileActions } from './FileActions.tsx'
import { dateTime, t } from './i18n.ts'

/** Sohbet listesinin grupları: bugün, dün, son 7 gün, daha eski. */
function groupOf(ts: number, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= day) return t.today
  if (ts >= day - 86_400_000) return t.yesterday
  if (ts >= day - 6 * 86_400_000) return t.lastWeek
  return t.older
}

/**
 * Ana sayfa: solda sohbetler, ortada agent sohbeti, sağda tarayıcılar (canlı) ve dosyalar.
 * `focus`: dışarıdan bir sohbeti açma isteği (bildirime tıklama, Ctrl+N ile yeni sohbet); `n` her istekte artıyor.
 */
export function Home({ state, thumbs, focus }: { state: BrowsersState; thumbs: Thumbnails; focus: { id: string | null; n: number } }) {
  const chats = useChats()
  const [chatId, setChatId] = useState<string | null>(focus.n ? focus.id : null)
  const [side, setSide] = useState(true)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ChatSummary[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  // İlk açılışta en son sohbet.
  const [picked, setPicked] = useState(focus.n > 0)
  useEffect(() => {
    if (picked || !chats.length) return
    setChatId(chats[0].id)
    setPicked(true)
  }, [chats, picked])
  useEffect(() => {
    if (focus.n) setChatId(focus.id)
  }, [focus])

  // Arama başlıkta ve mesajlarda (main süreçte); yazmayı bitirince.
  useEffect(() => {
    if (!query.trim()) return setFound(null)
    const timer = setTimeout(() => void api().agent.search(query).then(setFound), 200)
    return () => clearTimeout(timer)
  }, [query, chats])

  const shown = found ?? chats
  const groups = useMemo(() => {
    const out: [string, ChatSummary[]][] = []
    for (const c of shown) {
      const g = groupOf(c.updatedAt)
      const last = out.at(-1)
      if (last?.[0] === g) last[1].push(c)
      else out.push([g, [c]])
    }
    return out
  }, [shown])

  return (
    <div className="absolute inset-0 flex">
      <aside className="flex w-64 shrink-0 flex-col border-e border-line bg-bg">
        <button type="button" className="m-3 mb-2 flex h-9 items-center gap-2 rounded-full border border-line-2 px-3.5 text-sm hover:bg-panel" title={`${t.newChat} (Ctrl+N)`} onClick={() => setChatId(null)}>
          <MessageSquarePlus className="size-4" /> {t.newChat}
          <kbd className="readout ms-auto !text-muted">ctrl+n</kbd>
        </button>
        <label className="mx-3 mb-2 flex h-9 items-center gap-2 rounded-full border border-muted/70 px-3 text-sm focus-within:border-brand">
          <Search className="size-3.5 shrink-0 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} placeholder={t.searchChats} aria-label={t.searchChats} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
          {query && (
            <button className="text-muted hover:text-fg" aria-label={t.close} onClick={() => setQuery('')}>
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label={t.chats}>
          {groups.map(([label, items]) => (
            <div key={label} className="mb-2">
              <p className="px-3 pb-1 pt-3 text-xs text-muted">{label}</p>
              {items.map((c) => (
                <div key={c.id} className={`group flex items-center rounded-full ${c.id === chatId ? 'bg-raised text-fg' : 'text-fg-2 hover:bg-panel'}`}>
                  {editing === c.id ? (
                    <RenameChat chat={c} onDone={() => setEditing(null)} />
                  ) : (
                    <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm" title={`${c.title || t.newChat}\n${dateTime.format(c.updatedAt)}`} onClick={() => setChatId(c.id)} onDoubleClick={() => setEditing(c.id)}>
                      {c.pending ? <CircleAlert className="size-3.5 shrink-0 animate-pulse text-warn" aria-label={t.approvalWaiting} /> : c.running && <Bot className="size-3.5 shrink-0 animate-pulse text-brand" aria-label={t.agentWorking} />}
                      <span className="truncate">{c.title || t.newChat}</span>
                    </button>
                  )}
                  {editing !== c.id && (
                    <>
                      <button className="rounded p-1 text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100" aria-label={t.renameChat} title={t.renameChat} onClick={() => setEditing(c.id)}>
                        <PencilLine className="size-3.5" />
                      </button>
                      <ConfirmButton
                        className="mr-1 rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                        armedClassName="bg-danger/15 !text-danger !opacity-100"
                        label={t.deleteChat}
                        confirmLabel={t.deleteChatConfirm}
                        onConfirm={() => {
                          void api().agent.remove(c.id)
                          clearDraft(c.id)
                          if (c.id === chatId) setChatId(null)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </ConfirmButton>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {found && !found.length && <p className="px-3 py-2 text-sm text-muted">{t.noChatsFound}</p>}
        </nav>
      </aside>

      <main className="relative min-w-0 flex-1">
        <button type="button" aria-pressed={side} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted hover:bg-panel hover:text-fg" aria-label={t.browsers} title={t.browsers} onClick={() => setSide((s) => !s)}>
          <PanelRight className="size-4" />
        </button>
        <Chat key={chatId ?? `new-${focus.n}`} chatId={chatId} onCreated={setChatId} />
      </main>

      {side && (
        <aside className="hidden w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel lg:flex">
          <Browsers state={state} thumbs={thumbs} />
          <Files />
        </aside>
      )}
    </div>
  )
}

/** Sohbet adını yerinde değiştirme: Enter kaydeder, Esc vazgeçer. */
function RenameChat({ chat, onDone }: { chat: ChatSummary; onDone: () => void }) {
  const [value, setValue] = useState(chat.title)
  const save = () => {
    if (value.trim() && value !== chat.title) void api().agent.rename(chat.id, value)
    onDone()
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') onDone()
      }}
      aria-label={t.renameChat}
      className="m-1 min-w-0 flex-1 rounded-md border border-brand bg-bg px-2 py-1 text-sm outline-none"
    />
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

function Browsers({ state, thumbs }: { state: BrowsersState; thumbs: Thumbnails }) {
  const b = api().browsers
  return (
    <section className="border-b border-line p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[1.9rem]">{t.browsers}</h2>
        <button type="button" className="rounded-full border border-line-2 p-1.5 text-muted hover:bg-raised hover:text-fg" aria-label={t.newBrowser} title={t.newBrowser} onClick={() => void b.create(t.browserName(state.browsers.length + 1))}>
          <Plus className="size-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted">{t.browsersHint}</p>
      {state.browsers.length === 0 && <p className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-xs text-muted">{t.noBrowsers}</p>}
      {state.browsers.length > 0 && (
      <div className="space-y-3">
        {state.browsers.map((x) => {
          const tab = x.tabs.find((y) => y.id === x.activeTabId)
          const working = x.tabs.some((y) => y.agent)
          return (
            <div key={x.id} className="group relative">
            {/* Kapalı tarayıcı da son görüntüsüyle duruyor; tıklayınca sekmeleri yükleniyor. */}
            <button type="button" className={`block w-full overflow-hidden rounded-lg border bg-bg text-left transition-colors duration-[var(--dur-micro)] ${working ? 'border-ok/70' : 'border-line-2 hover:border-fg-2'}`} title={x.open ? x.name : `${x.name}: ${t.clickToOpen}`} onClick={() => void b.activate(x.id)}>
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

const ICONS = { image: Image, audio: Music, video: Video, document: FileText }
type Filter = 'all' | FileEntry['kind']

/** Tek dosya: görselde küçük önizleme, ses/videoda oynatıcı; altında ortak işlemler. */
export function FileRow({ f }: { f: FileEntry }) {
  const Icon = ICONS[f.kind]
  return (
    <div className="rounded-lg p-2 hover:bg-raised">
      <div className="flex items-center gap-2">
        {f.kind === 'image' ? <img src={fileUrl(f.path)} alt="" className="size-10 shrink-0 rounded object-cover" loading="lazy" /> : <Icon className="size-4 shrink-0 text-muted" aria-hidden />}
        <button className="min-w-0 flex-1 text-left" onClick={() => void api().files.open(f.path)} title={f.path}>
          <p className="truncate text-sm">{f.name}</p>
          <p className="truncate text-xs text-muted">
            {dateTime.format(f.mtime)}, {(f.size / 1024).toFixed(0)} KB
          </p>
        </button>
      </div>
      {f.kind === 'audio' && <audio src={fileUrl(f.path)} controls preload="none" className="mt-1 h-8 w-full" />}
      {f.kind === 'video' && <video src={fileUrl(f.path)} controls preload="metadata" className="mt-1 w-full rounded" />}
      <div className="mt-1">
        <FileActions path={f.path} kind={f.kind} compact />
      </div>
    </div>
  )
}

function Files() {
  const files = useFiles()
  const [filter, setFilter] = useState<Filter>('all')
  const shown = files.filter((f) => filter === 'all' || f.kind === filter)
  const tabs: [Filter, string][] = [['all', t.allFiles], ['image', t.images], ['audio', t.audio], ['video', t.videos], ['document', t.documents]]
  return (
    <section className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[1.9rem]">{t.files}</h2>
        <div className="flex gap-1">
          <button type="button" className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg" title={t.importHint} onClick={() => void api().files.importFiles()}>
            <Upload className="size-3.5" /> {t.importFiles}
          </button>
          <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" title={t.openFolder} aria-label={t.openFolder} onClick={() => void api().files.openFolder()}>
            <FolderOpen className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {tabs.map(([k, label]) => (
          <button key={k} className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === k ? 'border-fg-2 text-fg' : 'border-transparent text-muted hover:text-fg'}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {shown.length ? shown.slice(0, 40).map((f) => <FileRow key={f.path} f={f} />) : <p className="text-xs text-muted">{t.noFiles}</p>}
    </section>
  )
}
