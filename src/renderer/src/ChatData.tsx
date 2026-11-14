import { ArrowLeft, Database, ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DataItem, DataSummary } from '../../shared/types.ts'
import { api } from './hooks.ts'
import { dateTime, t } from './i18n.ts'

/**
 * **Sohbet verileri** (sohbete sağ tık > Sohbet verileri). Agent'ın bu sohbette topladığı her şey:
 * liste, arama, tıklanınca tam içerik. Rapor içeriği JSON yapısı (agent "devam et"te bundan sürdürüyor).
 */
export function ChatDataPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [list, setList] = useState<DataSummary[] | null>(null)
  const [open, setOpen] = useState<DataItem | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    void api().agent.data(chatId).then(setList)
    // Agent çalışırken veri eklendikçe liste tazeleniyor.
    return api().agent.onChat((c) => c.id === chatId && void api().agent.data(chatId).then(setList))
  }, [chatId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open ? setOpen(null) : onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase()
    return [...(list ?? [])].reverse().filter((x) => !s || x.title.toLocaleLowerCase().includes(s) || x.source?.toLocaleLowerCase().includes(s))
  }, [list, q])

  const content = open?.kind === 'report' ? pretty(open.content) : open?.content

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={t.chatData} className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {open ? (
            <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" aria-label={t.back} title={t.back} onClick={() => setOpen(null)}>
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <Database className="size-4 text-brand" />
          )}
          <h2 className="min-w-0 flex-1 truncate text-2xl normal-case">{open ? open.title : `${t.chatData} (${list?.length ?? 0})`}</h2>
          <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" aria-label={t.close} title={t.close} onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {open ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded bg-raised px-1.5 py-0.5">{t.dataKinds[open.kind]}</span>
              {dateTime.format(open.ts)}
              {open.source && /^https?:\/\//.test(open.source) ? (
                <a className="flex items-center gap-1 underline" href={open.source} onClick={(e) => (e.preventDefault(), window.open(open.source!))}>
                  {open.source.slice(0, 80)} <ExternalLink className="size-3" />
                </a>
              ) : (
                open.source && <code>{open.source}</code>
              )}
            </p>
            <pre className="select-text whitespace-pre-wrap break-words rounded-lg bg-bg p-3 text-xs">{content}</pre>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3">
              <p className="mb-2 text-xs text-muted">{t.chatDataHint}</p>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.dataSearch} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {!list && <Loader2 className="m-4 size-4 animate-spin" />}
              {list && !shown.length && <p className="p-4 text-sm text-muted">{t.dataEmpty}</p>}
              {shown.map((x) => (
                <button key={x.id} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-raised" onClick={() => void api().agent.dataItem(chatId, x.id).then(setOpen)}>
                  <span className="mt-0.5 shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] text-muted">{t.dataKinds[x.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{x.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {dateTime.format(x.ts)}, {t.chars(x.size)}
                      {x.source ? `, ${x.source}` : ''}, #{x.id}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const pretty = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}
