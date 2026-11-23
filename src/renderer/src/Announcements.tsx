import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import type { Announcement } from '../../shared/types.ts'
import { api } from './hooks.ts'
import { t } from './i18n.ts'

const TONE = {
  info: { box: 'border-brand/30 bg-brand/10', Icon: Info },
  warning: { box: 'border-warn/40 bg-warn/10', Icon: TriangleAlert },
  success: { box: 'border-ok/40 bg-ok/10', Icon: CircleCheck },
} as const
/** Sitedeki şeridin anahtarıyla aynı önek (`app/announce/strip.tsx`); depo bu uygulamanın. */
const KEY = 'saa:announce:'

const dismissed = (id: string) => {
  try {
    return localStorage.getItem(KEY + id) !== null
  } catch {
    return false
  }
}

/**
 * **Duyuru şeridi**: sitede yayındaki duyurular (`/api/v1/worker/me` ile gelir, uygulamanın dilinde). Kapatılan
 * duyuru bu bilgisayarda hatırlanır; depo erişilemezse yalnız "kapattım" unutulur.
 */
export function Announcements({ items }: { items: Announcement[] }) {
  const [closed, setClosed] = useState<string[]>([])
  const shown = items.filter((a) => !closed.includes(a.id) && !dismissed(a.id))
  if (!shown.length) return null
  return (
    <>
      {shown.map((a) => {
        const tone = TONE[a.level as keyof typeof TONE] ?? TONE.info
        const href = a.href
        return (
          <aside key={a.id} aria-label={t.announce.label} className={`flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm ${tone.box}`}>
            <tone.Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <p className="min-w-0 flex-1 select-text">
              <strong className="font-semibold">{a.title}</strong> <span className="whitespace-pre-line text-muted">{a.body}</span>
            </p>
            {href && (
              <button type="button" className="shrink-0 font-medium underline-offset-4 hover:underline" onClick={() => void (href.startsWith('/') ? api().site.open(href) : window.open(href, '_blank'))}>
                {t.announce.more}
              </button>
            )}
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-muted hover:bg-raised hover:text-fg"
              title={t.announce.dismiss}
              aria-label={t.announce.dismiss}
              onClick={() => {
                try {
                  localStorage.setItem(KEY + a.id, '1')
                } catch {
                  /* depo yok: bu oturumda kapalı kalır */
                }
                setClosed((c) => [...c, a.id])
              }}
            >
              <X className="size-4" />
            </button>
          </aside>
        )
      })}
    </>
  )
}
