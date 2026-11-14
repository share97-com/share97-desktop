import type { ReactNode } from 'react'
import { platformOf } from '../../shared/platforms.ts'
import { t } from './i18n.ts'

/** Share97 ekranlarının (Bağlantılar, Akışlar, Worker'lar, Paket) ortak parçaları. */

export const input = 'w-full rounded-md border border-line-2 bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55'
export const button = 'inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-md border border-line-2 bg-panel px-3 py-1.5 text-sm font-medium hover:bg-panel active:bg-raised disabled:cursor-not-allowed disabled:opacity-55'
export const primary = 'btn-primary inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-55'
export const iconButton = 'rounded-md p-1.5 text-muted hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`rounded-lg border border-line bg-panel p-5 ${className}`}>{children}</section>

/** Ekran iskeleti: başlık, açıklama, sağda eylemler; içerik kaydırılır ve seçilebilir. */
export function Page({ title, hint, actions, children }: { title: string; hint: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="absolute inset-0 select-text overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-8 pb-10 pt-9">
        <header className="flex flex-wrap items-end gap-4 border-b border-line pb-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.75rem]">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">{hint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        {children}
      </div>
    </main>
  )
}

export function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange(next: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-[var(--dur-micro)] disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-ok bg-ok' : 'border-line-2 bg-bg'}`}>
      <span className={`absolute left-0.5 top-[1px] size-4 rounded-full transition-transform duration-[var(--dur-short)] ${on ? 'translate-x-4 bg-brand-ink' : 'bg-muted'}`} />
    </button>
  )
}

/** Platformun rengiyle baş harfi: simge dosyası taşımadan dokuz platformu ayırt ediyor. */
export function PlatformBadge({ platform, size = 'size-8' }: { platform: string; size?: string }) {
  const p = platformOf(platform)
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-lg text-xs font-bold text-white`} style={{ background: p?.color ?? '#6b7280' }} title={p?.label ?? platform} aria-hidden>
      {(p?.label ?? platform).slice(0, 2)}
    </span>
  )
}

export const Pill = ({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${{ ok: 'border-ok/40 text-ok', warn: 'border-warn/40 text-warn', bad: 'border-danger/40 text-danger', muted: 'border-line-2 text-muted' }[tone]}`}>{children}</span>
)

/** Sunucunun hata kodu kullanıcının dilinde; tanınmayan kod olduğu gibi. */
export const serverError = (code: string | null | undefined) => (code ? (t.serverErrors[code] ?? code) : '')

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-bg/70 p-4 backdrop-blur-[2px]" role="dialog" aria-modal aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="max-h-full w-full max-w-xl select-none overflow-y-auto rounded-lg border border-line-2 bg-panel p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-5 text-3xl">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="mb-4 block">
    <span className="mb-1.5 block text-xs font-medium text-fg-2">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
)
