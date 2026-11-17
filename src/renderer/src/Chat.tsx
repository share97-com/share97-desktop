import { ArrowDown, ArrowUp, Brain, Check, ChevronDown, ChevronRight, CircleDashed, Clock, Copy, Database, ExternalLink, FileUp, Loader2, MonitorPlay, PenLine, Pencil, RotateCcw, Square, Table2, TriangleAlert, Users, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mark from './mark.svg'
import type { Chat as ChatT, ChatMessage, Effort, Part, QueuedMessage } from '../../shared/types.ts'
import { ChatDataPanel } from './ChatData.tsx'
import { api, fileUrl, useConnections, useModels, useSettings } from './hooks.ts'
import { cost as costFormat, t } from './i18n.ts'
import { ATTACH_EVENT, FileActions } from './FileActions.tsx'
import { toast } from './Toast.tsx'
import { PlatformBadge } from './ui.tsx'

/** Mesajı yazma kutusuna geri koymak için ("Düzenle"). */
const EDIT_EVENT = 'share97:edit-message'

const textOf = (m: ChatMessage) =>
  m.parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join(m.role === 'user' ? '' : '\n\n')
    .trim()

/** Panoya kopyalar; kısa süre onay işareti gösterir. */
function CopyButton({ text, label = t.copy, className = '' }: { text: string | (() => string); label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`rounded-md p-1 text-muted hover:bg-raised hover:text-fg ${className}`}
      aria-label={label}
      title={done ? t.copied : label}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(typeof text === 'function' ? text() : text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/** Canlı süreler için saniyede bir yeniden çizim (yalnız `on` iken). */
function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}

/** Yeni araç hatası ve bekçi uyarısı: sohbet açıkken köşede bildirim (eskiler bir kez sayılıyor). */
function useAlerts(chat: ChatT | null) {
  const seen = useRef<{ id: string | null; keys: Set<string> }>({ id: null, keys: new Set() })
  useEffect(() => {
    if (!chat) return
    const fresh = seen.current.id !== chat.id
    if (fresh) seen.current = { id: chat.id, keys: new Set() }
    chat.messages.forEach((m, mi) =>
      m.parts.forEach((p, pi) => {
        const key = p.type === 'tool' && p.status === 'error' ? `t:${p.id}` : p.type === 'notice' ? `n:${mi}:${pi}` : null
        if (!key || seen.current.keys.has(key)) return
        seen.current.keys.add(key)
        if (fresh) return
        if (p.type === 'tool') toast(`${t.toolFailed}: ${p.name}. ${(p.result ?? '').replace(/^Error:\s*/, '').slice(0, 160)}`, 'error')
        else if (p.type === 'notice') toast(p.text, 'error')
      }),
    )
  }, [chat])
}

/** ChatGPT benzeri sohbet: mesajlar ortada, yazma alanı altta, model ve düşünme seviyesi seçimi. */
export function Chat({ chatId, onCreated }: { chatId: string | null; onCreated: (id: string) => void }) {
  const [chat, setChat] = useState<ChatT | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [dataOpen, setDataOpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useAlerts(chat)

  useEffect(() => {
    setDataOpen(false)
    if (!chatId) return setChat(null)
    void api().agent.chat(chatId).then(setChat)
    return api().agent.onChat((c) => c.id === chatId && setChat(c))
  }, [chatId])
  // Sohbete sağ tık > "Sohbet verileri" (menü main'de).
  useEffect(() => api().agent.onShowData((id) => id === chatId && setDataOpen(true)), [chatId])

  // Kullanıcı yukarı kaydırmadıysa akış boyunca en altta kal.
  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat])

  // Öneri ve "yeniden dene" o sohbette işaretli hesaplarla gider.
  const send = async (text: string, accountIds: string[] = readPicked(chatId)) => {
    let id = chatId
    if (!id) {
      id = await api().agent.create()
      onCreated(id)
    }
    stick.current = true
    await api().agent.send(id, text, accountIds)
  }
  const toBottom = () => {
    const el = scroller.current
    if (!el) return
    stick.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
  const messages = chat?.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          data-chat-id={chatId ?? undefined}
          className="h-full overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            stick.current = near
            setAtBottom(near)
          }}
        >
          {messages.length ? (
            // Sohbetin tamamı seçilebilir ve kopyalanabilir (düğmeler hariç).
            <div className="mx-auto max-w-3xl select-text space-y-6 px-4 py-8">
              {messages.map((m, i) => (
                <Message key={m.id} m={m} live={!!chat?.running && i === messages.length - 1} tab={chat?.running && i === messages.length - 1 ? (chat.live ?? null) : null} onRetry={!chat?.running && i === messages.length - 1 && lastUser ? () => void send(textOf(lastUser)) : undefined} />
              ))}
            </div>
          ) : (
            <Welcome onPick={(s) => void send(s)} />
          )}
        </div>
        {!atBottom && messages.length > 0 && (
          <button className="absolute bottom-3 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-line bg-raised text-muted shadow-lg hover:text-fg" aria-label={t.scrollDown} title={t.scrollDown} onClick={toBottom}>
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
      <Composer
        chatId={chatId}
        running={!!chat?.running}
        cost={chat?.costUsd ?? 0}
        queued={chat?.queued ?? []}
        dataCount={chat?.dataCount ?? 0}
        onData={() => setDataOpen(true)}
        lastSent={lastUser ? textOf(lastUser) : ''}
        onSend={(text, accountIds) => void send(text, accountIds)}
        // Durdurunca gönderilmemiş (sıradaki) mesajlar yazma kutusuna geri geliyor.
        onStop={() => chatId && void api().agent.stop(chatId).then((texts) => texts.length && window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: texts.join('\n\n') })))}
      />
      {dataOpen && chatId && <ChatDataPanel chatId={chatId} onClose={() => setDataOpen(false)} />}
    </div>
  )
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-8 py-10">
      <h1 className="text-[clamp(2.75rem,5vw,4rem)] leading-[0.95]">{t.welcome}</h1>
      <p className="mb-9 mt-4 max-w-[52ch] text-sm text-fg-2">{t.welcomeHint}</p>
      <ol className="border-t border-line">
        {t.suggestions.map((s) => (
          <li key={s}>
            <button type="button" className="group flex w-full items-baseline gap-5 border-b border-line px-1 py-3.5 text-left text-sm text-fg-2 transition-colors duration-[var(--dur-micro)] hover:text-fg" onClick={() => onPick(s)}>
              <span>{s}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Message({ m, live, tab, onRetry }: { m: ChatMessage; live: boolean; tab?: ChatT['live']; onRetry?: () => void }) {
  if (m.role === 'user') {
    const text = textOf(m)
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg border border-line bg-raised px-4 py-2.5">{text}</div>
        {m.accounts && m.accounts.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {m.accounts.map((a) => (
              <span key={`${a.platform}:${a.handle}`} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2 text-xs text-muted">
                <PlatformBadge platform={a.platform} size="size-5" /> @{a.handle}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton text={text} />
          <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" aria-label={t.editMessage} title={t.editMessage} onClick={() => window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: text }))}>
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }
  const lastIndex = m.parts.length - 1
  const text = textOf(m)
  return (
    <div className="group flex gap-3">
      <img src={mark} alt="" className="mt-1 size-7 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-3">
        {m.parts.map((p, i) => (
          <PartView key={i} p={p} live={live && i === lastIndex} />
        ))}
        {live && !selfLive(m.parts.at(-1)) && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> {t.thinking}
          </p>
        )}
        {tab && <LivePreview tab={tab} />}
        {m.error && <ErrorNote error={m.error} />}
        {!live && (text || onRetry) && (
          <div className={`flex gap-0.5 transition focus-within:opacity-100 group-hover:opacity-100 ${m.error ? '' : 'opacity-0'}`}>
            {text && <CopyButton text={text} label={t.copyMessage} />}
            {onRetry && (
              <button type="button" className="flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg" title={t.retry} onClick={onRetry}>
                <RotateCcw className="size-3.5" /> {t.retry}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * **Agent'ın çalıştığı sekmenin canlı görüntüsü**, düşünme alanının altında. Yer burada ayrılıyor, sekmenin kendisi
 * main süreçte bu yerin üstüne çiziliyor (`browsers.previewSlot`): agent tıklarken ve yazarken sayfa burada canlı
 * görünüyor. Yukarı kaydırınca sohbetin dibine yapışıyor; yer görünmüyorsa sekme köşedeki küçük pencereye dönüyor.
 */
function LivePreview({ tab }: { tab: NonNullable<ChatT['live']> }) {
  const box = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(0.625)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const scroller = el.closest<HTMLElement>('[data-chat-id]')
    let frame = 0
    let last = ''
    const sync = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const s = scroller?.getBoundingClientRect()
      const shown = r.width > 0 && (!s || (r.top >= s.top - 1 && r.bottom <= s.bottom + 1))
      const key = shown ? `${r.x},${r.y},${r.width},${r.height}` : ''
      if (key === last) return
      last = key
      void api().browsers.previewSlot(tab.tabId, shown ? { x: r.x, y: r.y, width: r.width, height: r.height } : null).then(setRatio)
    }
    const queue = () => void (frame ||= requestAnimationFrame(sync))
    queue()
    const ro = new ResizeObserver(queue)
    ro.observe(el)
    if (scroller) ro.observe(scroller)
    scroller?.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    // Akan metin yuvayı aşağı itiyor: yer kısa aralıkla da yoklanıyor.
    const timer = setInterval(queue, 250)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(timer)
      ro.disconnect()
      scroller?.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
      void api().browsers.previewSlot(tab.tabId, null)
    }
  }, [tab.tabId])
  const open = () => void api().browsers.activate(tab.browserId).then(() => api().browsers.activateTab(tab.browserId, tab.tabId))
  return (
    <div className="sticky bottom-2 z-10 overflow-hidden rounded-lg border border-line bg-panel shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
        <MonitorPlay className="size-3.5 shrink-0 animate-pulse text-brand" />
        <span className="shrink-0 font-medium text-fg">{t.livePreview}</span>
        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
        <button type="button" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-raised hover:text-fg" onClick={open} title={t.openTab}>
          <ExternalLink className="size-3.5" /> {t.openTab}
        </button>
      </div>
      <div ref={box} className="w-full bg-bg" style={{ aspectRatio: `${1 / ratio}` }} />
    </div>
  )
}

function ErrorNote({ error }: { error: string }) {
  if (error === 'stopped') return <p className="text-sm text-muted">{t.stopped}</p>
  const balance = /insufficient-balance/.test(error)
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {balance ? t.insufficient : error}
      {balance && (
        <button className="ml-3 underline" onClick={() => void api().site.open('/billing')}>
          {t.addBalance}
        </button>
      )}
    </div>
  )
}

/** Araç girdisi / çıktısı: kaydırılabilir, sağ üstte kopyala. */
function Block({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className="group/block relative">
      <pre className={`max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-2 pr-8 text-xs ${className}`}>{text}</pre>
      <CopyButton text={text} className="absolute right-1 top-1 bg-bg opacity-0 group-hover/block:opacity-100" />
    </div>
  )
}

/** Kendi canlı göstergesi olan parça: altına ayrıca "Düşünüyor…" yazılmıyor. */
const selfLive = (p?: Part) => p?.type === 'text' || (p?.type === 'reasoning' && p.ms === undefined) || (p?.type === 'tool' && (p.status === 'writing' || p.status === 'running'))

function PartView({ p, live }: { p: Part; live: boolean }) {
  const now = useNow((p.type === 'reasoning' && p.ms === undefined && !!p.startedAt) || (p.type === 'tool' && (p.status === 'writing' || p.status === 'running')))
  switch (p.type) {
    case 'text':
      return <Prose text={p.text} />
    case 'reasoning': {
      const ms = p.ms ?? (p.startedAt ? now - p.startedAt : undefined)
      const thinking = p.ms === undefined && live
      return (
        <Fold icon={<Brain className={`size-4 ${thinking ? 'animate-pulse text-brand' : ''}`} />} title={<span className="flex items-center gap-2">{thinking ? t.thinking : t.thought}{ms !== undefined && <span className="text-xs tabular-nums text-muted">{t.seconds(ms)}</span>}</span>} open={thinking} muted>
          <p className="whitespace-pre-wrap text-sm text-muted">{p.text}</p>
        </Fold>
      )
    }
    case 'tool': {
      const icon = p.status === 'writing' ? <PenLine className="size-4 animate-pulse text-brand" /> : p.status === 'running' ? <Loader2 className={`size-4 animate-spin ${p.slow ? 'text-warn' : ''}`} /> : p.status === 'error' ? <X className="size-4 text-danger" /> : <Wrench className="size-4" />
      const ms = p.ms ?? (p.startedAt ? now - p.startedAt : undefined)
      return (
        // Hata ve uzun süren araç açık geliyor: kullanıcı sebebi hemen görüyor.
        <Fold icon={icon} title={<ToolTitle p={p} ms={ms} />} open={p.status === 'error'} muted>
          <Block text={p.args} className="max-h-40 text-muted" />
          {p.result && (
            <div className="mt-2">
              <Block text={p.result} className={p.status === 'error' ? 'text-danger' : ''} />
            </div>
          )}
        </Fold>
      )
    }
    case 'notice':
      return (
        <div role="alert" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${p.level === 'error' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/40 bg-warn/10 text-warn dark:text-warn'}`}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {p.text}
        </div>
      )
    case 'todos':
      return (
        <div className="rounded-lg border border-line bg-panel p-3">
          <p className="mb-2 text-xs text-muted">{t.plan}</p>
          <ul className="space-y-1.5">
            {p.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {it.status === 'completed' ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : it.status === 'in_progress' ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" />}
                <span className={it.status === 'completed' ? 'text-muted line-through' : ''}>{it.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'subagent':
      return (
        <Fold
          icon={p.status === 'running' ? <Loader2 className="size-4 animate-spin text-brand" /> : p.status === 'error' ? <X className="size-4 text-danger" /> : <Users className="size-4 text-brand" />}
          title={
            <span className="min-w-0 truncate">
              <b className="font-medium">{t.subagent}</b>: {p.task.slice(0, 90)} <span className="text-muted">({t.steps(p.steps)})</span>
            </span>
          }
        >
          {p.activity && <p className="mb-2 truncate font-mono text-xs text-muted">{p.activity}</p>}
          {p.summary && <Prose text={p.summary} />}
        </Fold>
      )
    case 'approval':
      return (
        <div className={`rounded-lg border p-4 ${p.status === 'pending' ? 'border-warn/60 bg-warn/10' : 'border-line bg-panel'}`}>
          <p className="mb-1 text-xs text-warn">{t.approvalTitle}</p>
          <p className="text-sm">{p.text}</p>
          {p.status === 'pending' ? (
            <div className="mt-3 flex gap-2">
              <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium" onClick={() => void api().agent.approve(p.id, true)}>
                {t.approve}
              </button>
              <button className="rounded-lg border border-line px-4 py-1.5 text-sm hover:bg-raised" onClick={() => void api().agent.approve(p.id, false)}>
                {t.reject}
              </button>
            </div>
          ) : (
            <p className={`mt-2 text-xs ${p.status === 'approved' ? 'text-ok' : 'text-danger'}`}>{p.status === 'approved' ? t.approved : t.rejected}</p>
          )}
        </div>
      )
    case 'file':
      return (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          {p.kind === 'image' && <img src={fileUrl(p.path)} alt={p.name} className="max-h-96 w-full bg-bg object-contain" />}
          {p.kind === 'video' && <video src={fileUrl(p.path)} controls className="max-h-96 w-full bg-black" />}
          {p.kind === 'audio' && <audio src={fileUrl(p.path)} controls className="w-full p-2" />}
          <div className="flex flex-wrap items-center gap-2 p-2 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium" title={p.path}>
              {p.name}
            </span>
            <FileActions path={p.path} kind={p.kind} />
          </div>
        </div>
      )
  }
}

/** Araç adı, argümanlar, süre: yazılırken karakter sayısı, uzun sürerse uyarı, bitince yazma + çalışma süresi. */
function ToolTitle({ p, ms }: { p: Extract<Part, { type: 'tool' }>; ms?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="shrink-0 text-xs font-semibold">{p.name}</code>
      {p.status === 'writing' ? (
        <span className="truncate text-xs text-brand">
          {t.writingTool}, {t.chars(p.chars ?? 0)}
        </span>
      ) : (
        <span className="truncate font-mono text-xs text-muted">{p.args === '{}' ? '' : p.args}</span>
      )}
      {p.slow && p.status === 'running' && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-warn">
          <Clock className="size-3.5" /> {t.slowTool}
        </span>
      )}
      {ms !== undefined && (
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted" title={p.writeMs ? `${t.writtenIn} ${t.seconds(p.writeMs)}` : undefined}>
          {p.writeMs ? `${t.seconds(p.writeMs)} + ` : ''}
          {t.seconds(ms)}
        </span>
      )}
    </span>
  )
}

function Fold({ icon, title, children, open: initial = false, muted }: { icon: ReactNode; title: ReactNode; children: ReactNode; open?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(initial)
  useEffect(() => setOpen(initial), [initial])
  return (
    <div className={`rounded-lg border border-line ${muted ? '' : 'bg-panel'}`}>
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="shrink-0 text-muted">{icon}</span>
        <span className="min-w-0 flex-1">{title}</span>
        {open ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
      </button>
      {open && <div className="border-t border-line px-3 py-2">{children}</div>}
    </div>
  )
}

/** Kod bloğu: sağ üstte kopyala. */
function Code({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="group/code relative">
      <pre ref={ref}>{children}</pre>
      <CopyButton text={() => ref.current?.innerText ?? ''} label={t.copyCode} className="absolute right-1.5 top-1.5 bg-raised opacity-0 group-hover/code:opacity-100" />
    </div>
  )
}

/** Tablo: Excel / Google Sheets'e yapıştırılabilir (sekmeyle ayrılmış) kopya. */
function Table({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null)
  const tsv = () => [...(ref.current?.rows ?? [])].map((r) => [...r.cells].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join('\t')).join('\n')
  return (
    <div>
      <table ref={ref}>{children}</table>
      <TableCopy tsv={tsv} />
    </div>
  )
}

function TableCopy({ tsv }: { tsv: () => string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="mt-1 flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs text-muted hover:bg-raised hover:text-fg"
      onClick={() =>
        void navigator.clipboard.writeText(tsv()).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Table2 className="size-3.5" />} {done ? t.copied : t.copyTable}
    </button>
  )
}

/** Markdown (GFM tabloları dahil); bağlantılar sistem tarayıcısında (sağ tıkla uygulamada da açılır). */
function Prose({ text }: { text: string }) {
  return (
    <div className="prose-chat text-[15px] leading-relaxed">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} onClick={(e) => (e.preventDefault(), href && window.open(href))}>
              {children}
            </a>
          ),
          pre: ({ children }) => <Code>{children}</Code>,
          table: ({ children }) => <Table>{children}</Table>,
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

/** Sohbet başına işaretli hesaplar: sohbet değişince ya da uygulama yenilenince seçim kalıyor. */
const pickedKey = (chatId: string | null) => `share97:accounts:${chatId ?? 'new'}`
const readPicked = (chatId: string | null): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(pickedKey(chatId)) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const writePicked = (chatId: string | null, ids: string[]) => {
  try {
    localStorage.setItem(pickedKey(chatId), JSON.stringify(ids))
  } catch {}
}

/** Sohbet başına yazılmamış taslak: sohbet değişince ya da uygulama yenilenince kaybolmuyor. */
const draftKey = (chatId: string | null) => `share97:draft:${chatId ?? 'new'}`
const readDraft = (chatId: string | null) => {
  try {
    return localStorage.getItem(draftKey(chatId)) ?? ''
  } catch {
    return ''
  }
}
/** Silinen sohbetin taslağı da gidiyor. */
export const clearDraft = (chatId: string) => writeDraft(chatId, '')
function writeDraft(chatId: string | null, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(chatId), text)
    else localStorage.removeItem(draftKey(chatId))
  } catch {}
}

function Composer({ chatId, running, cost, queued, dataCount, onData, lastSent, onSend, onStop }: { chatId: string | null; running: boolean; cost: number; queued: QueuedMessage[]; dataCount: number; onData: () => void; lastSent: string; onSend: (text: string, accountIds: string[]) => void; onStop: () => void }) {
  const [text, setText] = useState(() => readDraft(chatId))
  const [settings, update] = useSettings()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => writeDraft(chatId, text), [chatId, text])
  // Bu cihazda oturumu olan sosyal hesaplar: işaretlenenler mesajla birlikte agent'a gider.
  const accounts = (useConnections()?.accounts ?? []).filter((x) => x.here)
  const [picked, setPicked] = useState<string[]>(() => readPicked(chatId))
  useEffect(() => writePicked(chatId, picked), [chatId, picked])
  const chosen = picked.filter((id) => accounts.some((x) => x.id === id))

  /** Sürüklenen ya da yapıştırılan dosyalar çalışma klasörüne (uploads/), yolları yazma kutusuna. */
  const attach = async (files: File[]) => {
    if (!files.length) return
    setUploading((n) => n + files.length)
    for (const f of files) {
      try {
        const path = await api().files.saveUpload(f.name || 'pano.png', new Uint8Array(await f.arrayBuffer()))
        setText((x) => `${x}${x && !x.endsWith(' ') && !x.endsWith('\n') ? ' ' : ''}\`${path}\` `)
      } catch (e) {
        toast(`${t.uploadFailed}: ${f.name}`, 'error')
        console.error(e)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    box.current?.focus()
  }
  // "Sohbete ekle": dosya yolu yazma kutusuna, agent `read_file` / `upload_files` ile kullanır.
  // "Düzenle": gönderilmiş mesaj kutuya geri geliyor.
  useEffect(() => {
    const onAttach = (e: Event) => {
      const path = (e as CustomEvent<string>).detail
      setText((x) => `${x}${x && !x.endsWith(' ') ? ' ' : ''}\`${path}\` `)
      box.current?.focus()
    }
    const onEdit = (e: Event) => {
      setText((e as CustomEvent<string>).detail)
      requestAnimationFrame(() => {
        const el = box.current
        el?.focus()
        el?.setSelectionRange(el.value.length, el.value.length)
      })
    }
    window.addEventListener(ATTACH_EVENT, onAttach)
    window.addEventListener(EDIT_EVENT, onEdit)
    return () => {
      window.removeEventListener(ATTACH_EVENT, onAttach)
      window.removeEventListener(EDIT_EVENT, onEdit)
    }
  }, [])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])
  // Agent çalışırken de gönderilebiliyor: mesaj sıraya giriyor, iş kesilmiyor.
  const submit = () => {
    if (!text.trim() || !settings?.chatModel) return
    onSend(text.trim(), chosen)
    setText('')
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      {queued.length > 0 && (
        <div className="mb-2 space-y-1" aria-label={t.queued}>
          {queued.map((q) => (
            <div key={q.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-panel px-3 py-1.5 text-sm" title={t.queuedHint}>
              <Clock className="size-3.5 shrink-0 text-muted" />
              <span className="shrink-0 text-xs text-muted">{t.queued}</span>
              <span className="min-w-0 flex-1 truncate">{q.text}</span>
              <button className="rounded-md p-0.5 text-muted hover:bg-raised hover:text-fg" aria-label={t.unqueue} title={t.unqueue} onClick={() => chatId && void api().agent.unqueue(chatId, q.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {accounts.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t.chatAccounts} title={t.chatAccountsHint}>
          <span className="text-xs text-muted">{t.chatAccounts}</span>
          {accounts.map((x) => {
            const on = picked.includes(x.id)
            return (
              <button key={x.id} type="button" aria-pressed={on} title={`${x.where === 'chrome' ? 'Chrome' : t.browserWord}${x.group ? `, ${x.group}` : ''}`} className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs ${on ? 'border-brand bg-brand/10 text-fg' : 'border-line text-muted hover:bg-raised hover:text-fg'}`} onClick={() => setPicked(on ? picked.filter((id) => id !== x.id) : [...picked, x.id])}>
                <PlatformBadge platform={x.platform} size="size-5" /> @{x.handle}
              </button>
            )
          })}
        </div>
      )}
      <div
        className={`relative rounded-lg border bg-panel shadow-[var(--shadow-card)] focus-within:border-fg-2 ${dragging ? 'border-brand' : 'border-muted/70'}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragging(false)
          void attach([...e.dataTransfer.files])
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-brand/10 text-sm font-medium text-brand">
            <span className="flex items-center gap-2">
              <FileUp className="size-4" /> {t.dropFiles}
            </span>
          </div>
        )}
        <textarea
          ref={box}
          rows={1}
          value={text}
          autoFocus
          spellCheck
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // Ekran görüntüsü ya da kopyalanan dosya: yazı değil dosya olarak eklenir.
            const files = [...e.clipboardData.files]
            if (!files.length) return
            e.preventDefault()
            void attach(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape' && running) {
              e.preventDefault()
              onStop()
            } else if (e.key === 'ArrowUp' && !text && lastSent) {
              // Boş kutuda ↑: son gönderilen mesaj (terminaldeki gibi), düzeltip tekrar göndermek için.
              e.preventDefault()
              setText(lastSent)
            }
          }}
          placeholder={running ? t.composerQueue : t.composer}
          aria-label={t.composer}
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[15px] outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-2 px-3 pb-2 pt-1">
          <ModelPicker value={settings?.chatModel ?? null} onChange={(id) => update({ chatModel: id })} />
          <select value={settings?.effort ?? 'medium'} onChange={(e) => update({ effort: e.target.value as Effort })} className="rounded-full border border-muted/70 bg-transparent px-2.5 py-1 text-xs text-muted hover:bg-raised" aria-label={t.effort} title={t.effort}>
            {(Object.keys(t.efforts) as Effort[]).map((k) => (
              <option key={k} value={k}>
                {t.effort}: {t.efforts[k]}
              </option>
            ))}
          </select>
          <select value={settings?.approval ?? 'ask'} onChange={(e) => update({ approval: e.target.value as 'auto' | 'ask' })} className={`rounded-full border bg-transparent px-2.5 py-1 text-xs hover:bg-raised ${settings?.approval === 'auto' ? 'border-brand text-brand' : 'border-muted/70 text-muted'}`} aria-label={t.approvals} title={t.modeHint}>
            {(['ask', 'auto'] as const).map((k) => (
              <option key={k} value={k}>
                {t.modes[k]}
              </option>
            ))}
          </select>
          {uploading > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> {t.uploading}
            </span>
          )}
          <span className="ml-auto" />
          {dataCount > 0 && (
            <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg" title={t.chatData} aria-label={t.chatData} onClick={onData}>
              <Database className="size-3.5" /> {dataCount}
            </button>
          )}
          {cost > 0 && <span className="text-xs tabular-nums text-muted" title={t.cost}>{costFormat.format(cost)}</span>}
          {running && (
            <button className="grid size-8 place-items-center rounded-full bg-fg text-bg" aria-label={t.stop} title={`${t.stop} (Esc)`} onClick={onStop}>
              <Square className="size-3.5 fill-current" />
            </button>
          )}
          {(!running || text.trim()) && (
            <button className="btn-primary grid size-8 place-items-center rounded-full disabled:opacity-40" aria-label={running ? t.queued : t.send} title={!settings?.chatModel ? t.noModel : running ? t.queuedHint : t.send} disabled={!text.trim() || !settings?.chatModel} onClick={submit}>
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Araç çağırabilen metin modelleri (fiyatlar kullanıcının ödediği tutar); aranabilir. */
export function ModelPicker({ value, onChange, category = 'text', toolsOnly = true, visionOnly = false, placeholder }: { value: string | null; onChange: (id: string | null) => void; category?: 'text' | 'image' | 'video' | 'speech'; toolsOnly?: boolean; visionOnly?: boolean; placeholder?: string }) {
  const { list, error } = useModels(category)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list ?? []).filter((m) => (!toolsOnly || m.tools) && (!visionOnly || m.vision) && (!s || m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s))).slice(0, 200)
  }, [list, q, toolsOnly, visionOnly])
  return (
    <div className="relative">
      <button type="button" className="flex max-w-64 items-center gap-1 rounded-full px-2.5 py-1 text-xs hover:bg-raised" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`truncate ${value ? "readout !text-fg" : "text-warn"}`}>{value ?? placeholder ?? t.pickModel}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-[28rem] max-w-[90vw] rounded-lg border border-line bg-raised p-2 shadow-2xl">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchModels} className="mb-2 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-brand" />
            {toolsOnly && <p className="px-2 pb-1 text-xs text-muted">{t.toolsOnly}</p>}
            <div className="max-h-80 overflow-y-auto">
              {placeholder && (
                <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel" onClick={() => (onChange(null), setOpen(false))}>
                  {placeholder}
                </button>
              )}
              {error && <p className="p-3 text-sm text-danger">{error}</p>}
              {!list && !error && <Loader2 className="m-3 size-4 animate-spin" />}
              {shown.map((m) => (
                <button key={m.id} className={`w-full rounded-lg px-3 py-2 text-left hover:bg-panel ${m.id === value ? 'bg-panel' : ''}`} onClick={() => (onChange(m.id), setOpen(false))}>
                  <p className="flex items-center gap-2 text-sm">
                    <span className="truncate">{m.name}</span>
                    {m.reasoning && <Brain className="size-3.5 shrink-0 text-brand" aria-label="reasoning" />}
                    {m.vision && <span className="shrink-0 rounded bg-bg px-1 text-[10px] text-muted">vision</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.id}, {m.price}
                    {m.contextLength ? `, ${Math.round(m.contextLength / 1000)}K` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
