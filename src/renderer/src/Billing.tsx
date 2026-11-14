import { Coins, Crown, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Account } from '../../shared/types.ts'
import { api } from './hooks.ts'
import { cost, t } from './i18n.ts'
import { button, Card, iconButton, Page, Pill, primary } from './ui.tsx'

export const planLabel = (plan: string) => t.plans[plan] ?? plan
/** Üst şeritteki ve menüdeki kısa kredi yazısı. */
export const creditText = (a: Account) => (a.credits.unlimited ? '∞' : String(a.credits.total))

/**
 * **Paket ve kredi.** Ücretsiz ve Pro paket, günlük hak, ek kredi ve krediden bozdurulan yapay zekâ
 * bakiyesi. Satın alma sitenin faturalama sayfasında (Stripe), bu cihazın oturumuyla ayrı pencerede.
 */
export function Billing({ account: a }: { account: Account }) {
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    setBusy(true)
    void api().auth.refresh().finally(() => setBusy(false))
  }
  useEffect(refresh, [])
  const used = Math.max(0, a.credits.daily - a.credits.remaining)
  const billing = () => void api().site.open('/billing')

  return (
    <Page
      title={t.bill.title}
      hint={t.bill.hint}
      actions={
        <button className={iconButton} title={t.refresh} aria-label={t.refresh} onClick={refresh}>
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-line-2 bg-raised text-brand">
              <Crown className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{t.bill.plan}</p>
              <p className="figure text-[2.6rem]">{planLabel(a.plan)}</p>
            </div>
            {a.plan === 'free' ? (
              <button className={primary} onClick={billing}>
                {t.bill.upgrade}
              </button>
            ) : (
              <button className={button} onClick={billing}>
                {t.bill.manage}
              </button>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted">{t.bill.maxAccounts}</dt>
              <dd className="font-medium tabular-nums">{a.limits.maxAccounts ?? t.unlimited}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.bill.maxWorkflows}</dt>
              <dd className="font-medium tabular-nums">{a.limits.maxWorkflows ?? t.unlimited}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-raised text-brand">
              <Coins className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{t.credits}</p>
              <p className="figure text-[2.6rem] tabular-nums">{a.credits.unlimited ? t.unlimited : a.credits.total}</p>
            </div>
            <button className={primary} onClick={billing}>
              {t.bill.buy}
            </button>
          </div>
          {!a.credits.unlimited && (
            <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="flex justify-between">
                  <span>{t.bill.daily}</span>
                  <span className="tabular-nums">
                    {a.credits.remaining} / {a.credits.daily}
                  </span>
                </dt>
                <dd>
                  <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={a.credits.daily} aria-valuenow={a.credits.remaining}>
                    <div className="h-full bg-fg-2" style={{ width: `${a.credits.daily ? (a.credits.remaining / a.credits.daily) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-muted">{t.bill.dailyHint(used, a.credits.daily)}</span>
                </dd>
              </div>
              <div>
                <dt className="flex justify-between">
                  <span>{t.bill.extra}</span>
                  <span className="tabular-nums">{a.credits.extra}</span>
                </dt>
                <dd className="text-xs text-muted">{t.bill.extraHint}</dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-raised text-brand">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t.bill.ai}</p>
            <p className="figure text-[2.6rem] tabular-nums">{cost.format(a.ai.balanceUsd)}</p>
          </div>
          {!a.ai.enabled ? <Pill tone="warn">{t.bill.aiOff}</Pill> : !a.ai.canSpend && <Pill tone="bad">{t.insufficient}</Pill>}
        </div>
        <p className="mt-3 text-sm text-muted">{t.bill.aiHint(cost.format(a.ai.creditUsd))}</p>
        {a.ai.balanceUsd < 0 && <p className="mt-1 text-sm text-danger">{t.bill.aiDebt}</p>}
        <p className="mt-1 text-xs text-muted">{t.bill.prices}</p>
      </Card>
    </Page>
  )
}
