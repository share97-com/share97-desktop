import { Crown, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Account } from '../../shared/types.ts'
import { api } from './hooks.ts'
import { cost, dateTime, money, t } from './i18n.ts'
import { button, Card, iconButton, Page, Pill, primary } from './ui.tsx'

export const planLabel = (plan: string) => t.plans[plan] ?? plan
/** Üst şeritteki ve menüdeki kısa bakiye yazısı (USD). */
export const balanceText = (a: Account) => (a.balance.unlimited ? '∞' : money.format(Math.max(0, a.balance.balanceUsd)))

/**
 * **Paket ve bakiye.** Paket ve sınırları, USD bakiye (abonelik her ay yüklüyor, yükleme 30 gün). Bakiye yalnız
 * yapay zekâda harcanıyor; yayın ücretsiz. Satın alma sitenin faturalama sayfasında (Stripe), ayrı pencerede.
 */
export function Billing({ account: a }: { account: Account }) {
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    setBusy(true)
    void api().auth.refresh().finally(() => setBusy(false))
  }
  useEffect(refresh, [])
  const billing = () => void api().site.open('/billing')
  const b = a.balance

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
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{t.bill.balance}</p>
              <p className="figure text-[2.6rem] tabular-nums">{b.unlimited ? t.unlimited : cost.format(b.balanceUsd)}</p>
              {b.expiresAt && !b.unlimited && <p className="text-xs text-muted">{t.bill.expires(dateTime.format(new Date(b.expiresAt)))}</p>}
            </div>
            {/* Abonelik kademeleri ve serbest tutarlı yükleme sitenin faturalama sayfasında (Stripe). */}
            <button className={primary} onClick={billing}>
              {t.bill.topup}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!b.enabled ? <Pill tone="warn">{t.bill.aiOff}</Pill> : !b.canSpend && <Pill tone="bad">{t.insufficient}</Pill>}
          </div>
          <p className="mt-3 text-sm text-muted">{t.bill.balanceHint}</p>
          {b.balanceUsd < 0 && <p className="mt-1 text-sm text-danger">{t.bill.debt}</p>}
          <p className="mt-1 text-xs text-muted">{t.bill.prices}</p>
        </Card>
      </div>
    </Page>
  )
}
