import { Loader2 } from 'lucide-react'
import type { AuthState } from '../../shared/types.ts'
import { t } from './i18n.ts'
import mark from './mark.svg'

/**
 * Giriş ekranı: tek yol "Share97 ile giriş yap" (anahtar elle istenmiyor); onaydan sonra bu kurulum
 * hesabın bir Worker'ı. Sağda bağlantının gerçek yolu: tarayıcı → onay → bu bilgisayar → hesaplar.
 * Beklerken onay adımı canlı, hata olursa yol orada kesilir.
 */
export function Connect({ state }: { state: AuthState }) {
  const api = window.share97.auth
  const connecting = state.status === 'connecting'
  const failed = state.status === 'error'
  const network = failed && state.error === 'network'
  return (
    <div className="flex h-full flex-col">
      <div className="caption-bar drag flex items-center gap-2 pl-4">
        <img src={mark} alt="" width={18} height={18} className="size-[18px] rounded" />
        <span className="wordmark text-lg">Share<span className="text-brand">97</span></span>
      </div>
      <main className="grid flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-12 px-14 pb-14 max-[60rem]:grid-cols-1 max-[60rem]:px-8">
        <section className="max-w-xl">
          <h1 className="text-[clamp(3rem,6.4vw,5.25rem)] leading-[0.95]">
            {t.connectHead.before}
            <span className="verb">{t.connectHead.verb}</span>
            {t.connectHead.after}
          </h1>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">{t.connectBody}</p>
          {failed && (
            <p role="alert" className="mt-6 max-w-[46ch] border-l border-danger pl-3 text-sm text-danger">
              {t.errors[state.error]}
            </p>
          )}
          <div className="mt-8 flex min-h-12 items-center gap-4">
            {connecting ? (
              <>
                <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {t.connecting}
                </p>
                <button type="button" className="rounded-full border border-line-2 px-4 py-2 text-sm hover:bg-panel" onClick={() => void api.cancel()}>
                  {t.cancel}
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary h-12 rounded-full px-7 text-[15px] font-medium" onClick={() => void (network ? api.refresh() : api.connect())}>
                {network ? t.retry : t.connectButton}
              </button>
            )}
          </div>
        </section>

        <figure className="relative rounded-lg bg-panel px-8 py-9" aria-label={t.connectSteps.join(', ')}>
          <ol className="relative space-y-0">
            {t.connectSteps.map((step, i) => {
              // 0: tarayıcı, 1: onay (beklerken canlı), 2: bu bilgisayar, 3: hesaplar.
              const lit = connecting ? i <= 1 : failed ? i === 0 : false
              const broken = failed && i === 1
              return (
                <li key={step}>
                  {i > 0 && (
                    <span aria-hidden className={`ml-[22px] block h-9 w-px ${connecting && i === 1 ? 'path-live' : lit ? 'bg-brand' : broken ? 'bg-danger' : 'bg-line-2'}`} />
                  )}
                  <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${broken ? 'border-danger/60' : lit ? 'border-brand/70' : 'border-line-2'} bg-bg`}>
                    <span className={`font-mono text-xs ${lit ? 'text-brand' : 'text-muted'}`}>0{i + 1}</span>
                    <span className={`font-mono text-[13px] ${lit ? 'text-fg' : 'text-fg-2'}`}>{step}</span>
                  </div>
                </li>
              )
            })}
          </ol>
          <figcaption className="readout mt-7 border-t border-line pt-4 !text-muted">{t.connectKey}</figcaption>
        </figure>
      </main>
    </div>
  )
}
