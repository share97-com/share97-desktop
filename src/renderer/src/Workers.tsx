import { ChevronDown, ChevronRight, Loader2, MessageSquare, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { SocialAccount, WorkerDef, WorkerInput } from '../../shared/types.ts'
import { ModelPicker } from './Chat.tsx'
import { ConfirmButton } from './Confirm.tsx'
import { api, errorText, useActivity, useConnections, useWorkers } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, Field, iconButton, input, Modal, Page, Pill, PlatformBadge, primary } from './ui.tsx'

/**
 * **Worker'lar.** Bu cihazdaki kayıtlı agent işleri: talimat + hesaplar + model. "Çalıştır" bir sohbet
 * süreci başlatır; sonuçlar ve cihazın etkinlik günlüğü burada, adımların tamamı Sohbet ekranında.
 * Zamanlama yok: zamanı gelince çalışan iş bir akıştır (Akışlar ekranı).
 */
export function Workers({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const defs = useWorkers()
  const activity = useActivity()
  const conn = useConnections()
  const local = (conn?.accounts ?? []).filter((a) => a.here)
  const [editing, setEditing] = useState<WorkerDef | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <Page
      title={t.wk.title}
      hint={t.wk.hint}
      actions={
        <button className={primary} onClick={() => setEditing('new')}>
          <Plus className="size-4" /> {t.wk.add}
        </button>
      }
    >
      {!defs.length && (
        <Card className="text-center">
          <p className="mx-auto mb-4 max-w-lg text-sm text-muted">{t.wk.empty}</p>
          <button className={primary} onClick={() => setEditing('new')}>
            <Plus className="size-4" /> {t.wk.add}
          </button>
        </Card>
      )}
      <div className="space-y-2">
        {defs.map((d) => (
          <div key={d.id} className="rounded-lg border border-line bg-panel/80 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
                {open === d.id ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block truncate text-xs text-muted">{d.lastRunAt ? `${t.wk.last}: ${dateTime.format(d.lastRunAt)}` : t.wk.noRuns}</span>
                </span>
              </button>
              <div className="flex items-center -space-x-1">
                {d.accountIds.slice(0, 5).map((id) => {
                  const a = local.find((x) => x.id === id)
                  return a ? <PlatformBadge key={id} platform={a.platform} size="size-6" /> : null
                })}
              </div>
              {d.running ? (
                <Pill tone="warn">
                  <Loader2 className="size-3 animate-spin" /> {t.wk.running}
                </Pill>
              ) : (
                d.runs[0] && <Pill tone={d.runs[0].ok ? 'ok' : 'bad'}>{d.runs[0].ok ? t.wk.ok : t.wk.failed}</Pill>
              )}
              <button
                className={button}
                disabled={d.running}
                onClick={() => {
                  void api().workers.run(d.id)
                  toast(t.wk.started)
                }}
              >
                <Play className="size-3.5" /> {t.run}
              </button>
              <button className={iconButton} title={t.edit} aria-label={t.edit} onClick={() => setEditing(d)}>
                <Pencil className="size-4" />
              </button>
              <ConfirmButton className={iconButton} title={t.delete} label={t.delete} onConfirm={() => void api().workers.remove(d.id)}>
                <Trash2 className="size-4" />
              </ConfirmButton>
            </div>
            {open === d.id && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-3 whitespace-pre-wrap text-sm text-muted">{d.prompt}</p>
                <h3 className="mb-2 text-xs text-muted">{t.wk.runs}</h3>
                {!d.runs.length && <p className="text-sm text-muted">{t.wk.noRuns}</p>}
                <ul className="space-y-2">
                  {d.runs.map((r) => (
                    <li key={r.at} className="rounded-lg bg-raised p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Pill tone={r.ok ? 'ok' : 'bad'}>{r.ok ? t.wk.ok : t.wk.failed}</Pill>
                        <span className="text-xs tabular-nums text-muted">
                          {dateTime.format(r.at)}, {Math.max(1, Math.round(r.ms / 1000))} s
                        </span>
                        {r.chatId && (
                          <button className="ml-auto flex items-center gap-1 text-xs text-brand hover:underline" onClick={() => onOpenChat(r.chatId!)}>
                            <MessageSquare className="size-3.5" /> {t.openChat}
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-xs">{r.summary}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-[1.75rem]">{t.wk.activity}</h2>
        {!activity.length && <p className="text-sm text-muted">{t.wk.noActivity}</p>}
        <ul className="space-y-1.5 text-sm">
          {activity.slice(0, 30).map((a, i) => (
            <li key={`${a.at}-${i}`} className="flex items-start gap-2">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.tone === 'ok' ? 'bg-ok' : a.tone === 'error' ? 'bg-danger' : 'bg-muted'}`} />
              <span className="min-w-0 flex-1 break-words">{a.text}</span>
              {a.chatId && (
                <button className="shrink-0 text-brand" title={t.openChat} aria-label={t.openChat} onClick={() => onOpenChat(a.chatId!)}>
                  <MessageSquare className="size-3.5" />
                </button>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted">{dateTime.format(a.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
      {editing && <WorkerForm def={editing === 'new' ? null : editing} accounts={local} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function WorkerForm({ def, accounts, onClose }: { def: WorkerDef | null; accounts: SocialAccount[]; onClose: () => void }) {
  const [v, setV] = useState<WorkerInput>(() => (def ? { name: def.name, prompt: def.prompt, accountIds: def.accountIds, model: def.model } : { name: '', prompt: '', accountIds: [], model: null }))
  const [error, setError] = useState('')
  const set = (patch: Partial<WorkerInput>) => setV((x) => ({ ...x, ...patch }))
  const save = () =>
    void api()
      .workers.save(def?.id ?? null, v)
      .then(() => {
        toast(t.wk.saved)
        onClose()
      })
      .catch((e) => setError(errorText(e)))

  return (
    <Modal title={def ? def.name : t.wk.add} onClose={onClose}>
      <Field label={t.wk.name}>
        <input value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder={t.wk.namePlaceholder} className={input} autoFocus maxLength={80} />
      </Field>
      <Field label={t.wk.prompt} hint={t.wk.unattended}>
        <textarea value={v.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder={t.wk.promptPlaceholder} className={`${input} min-h-36 resize-y`} />
      </Field>
      <div className="mb-4">
        <span className="mb-1.5 block text-xs text-muted">{t.wk.accounts}</span>
        {!accounts.length && <p className="text-sm text-muted">{t.wk.noAccounts}</p>}
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const on = v.accountIds.includes(a.id)
            return (
              <button key={a.id} type="button" aria-pressed={on} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? 'border-brand bg-brand/10' : 'border-line hover:bg-raised'}`} onClick={() => set({ accountIds: on ? v.accountIds.filter((x) => x !== a.id) : [...v.accountIds, a.id] })}>
                <PlatformBadge platform={a.platform} size="size-6" /> @{a.handle}
              </button>
            )
          })}
        </div>
        {accounts.length > 0 && <span className="mt-1 block text-xs text-muted">{t.wk.accountsHint}</span>}
      </div>
      <div className="mb-4">
        <span className="mb-1.5 block text-xs text-muted">{t.wk.model}</span>
        <ModelPicker value={v.model} onChange={(id) => set({ model: id })} placeholder={t.wk.modelDefault} />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} onClick={onClose}>
          {t.cancel}
        </button>
        <button className={primary} disabled={!v.name.trim() || !v.prompt.trim()} onClick={save}>
          {t.save}
        </button>
      </div>
    </Modal>
  )
}
