import { FolderOpen, Loader2, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isPartial, MAX_GENERATE, type AccountContent, type GenerateInput, type LocalContent } from '../../shared/contents.ts'
import { platformOf } from '../../shared/platforms.ts'
import type { SocialAccount } from '../../shared/types.ts'
import { api, errorText } from './hooks.ts'
import { t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Field, input, Modal, Pill, primary, serverError, Switch } from './ui.tsx'

const STATUS_TONE = { pending: 'muted', publishing: 'warn', published: 'ok', failed: 'bad' } as const

/**
 * **Hesabın içerikleri** (Bağlantılar ekranında, hesabın "İçerik" penceresi): `accounts/<ad>/<platform>/contents/1, 2, 3…`.
 * İçerik akıştan değil buradan eklenir; akış yalnız hesabı bağlar.
 */
/** Bir hesabın içerik klasörleri: durum ve plandaki zaman; içerik ekleme, hesabın account.txt'i ile üretme, klasörü açma. */
export function AccountContents({ account, syncedAt }: { account: SocialAccount; syncedAt: number }) {
  const [items, setItems] = useState<AccountContent[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [tick, setTick] = useState(0)
  const pending = items?.filter((i) => i.status === 'pending').length ?? 0
  // Platform görsel ya da video istiyor ama klasörde yok: sırası gelince düşerdi.
  const mediaLess = platformOf(account.platform)?.needsMedia ? [platformOf(account.platform)!.label] : []
  useEffect(() => {
    void api()
      .contents.list(account.id)
      .then(setItems, () => setItems([]))
  }, [account.id, syncedAt, tick])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          accounts/{account.handle}/{account.platform}/contents · {t.flows.status.pending}: {pending}
        </span>
        <span className="ms-auto flex gap-2">
          <button className={button} onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> {t.flows.addContent}
          </button>
          <button className={button} onClick={() => setGenerating(true)}>
            <Sparkles className="size-3.5" /> {t.flows.generate}
          </button>
          <button className={button} onClick={() => void api().contents.open(account.id)}>
            <FolderOpen className="size-3.5" /> {t.flows.openFolder}
          </button>
        </span>
      </div>
      {items && (
        <>
          <p className="mt-2 text-xs text-muted">{t.flows.folderHint}</p>
          {!items.length && <p className="mt-2 text-sm text-muted">{t.flows.noFolders}</p>}
          {pending <= 2 && (
            <p className="mt-2 rounded-lg border border-line p-2 text-xs text-muted">
              {pending ? t.flows.lowContent(pending) : t.flows.noContentLeft}
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.folder} title={i.note}>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted">{i.folder}</span>
                  <Pill tone={isPartial(i) ? 'warn' : STATUS_TONE[i.status]}>{isPartial(i) ? t.flows.partial : t.flows.status[i.status]}</Pill>
                  <span className="min-w-0 flex-1 truncate">{i.caption.split('\n')[0] || t.flows.noText}</span>
                  {i.at && <span className="shrink-0 text-xs tabular-nums text-muted">{new Date(i.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  {i.media.length > 0 && <span className="shrink-0 text-xs text-muted">{t.flows.files(i.media.length)}</span>}
                  {i.status !== 'pending' && (
                    <button
                      className="shrink-0 text-muted hover:text-fg"
                      title={t.flows.requeue}
                      aria-label={t.flows.requeue}
                      onClick={() =>
                        void api()
                          .contents.requeue(account.id, i.folder)
                          .then(
                            () => (setTick((x) => x + 1), toast(t.flows.requeued(i.folder))),
                            (e: unknown) => toast(errorText(e), 'error'),
                          )
                      }
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </div>
                {(i.status === 'failed' || isPartial(i)) && i.note && <p className="ml-10 line-clamp-2 text-xs text-danger">{i.note}</p>}
                {i.status === 'pending' && (i.warnings.length > 0 || (mediaLess.length > 0 && !i.media.length)) && (
                  <p className="ml-10 text-xs text-warn">{[...(mediaLess.length && !i.media.length ? [t.flows.needsMedia(mediaLess.join(', '))] : []), ...i.warnings.map((x) => t.flows.warn[x])].join(' ')}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {adding && (
        <AddForm
          accountId={account.id}
          onClose={() => setAdding(false)}
          onDone={(folder) => {
            setAdding(false)
            setTick((x) => x + 1)
            toast(t.flows.added(folder))
          }}
        />
      )}
      {generating && (
        <GenerateForm
          accountId={account.id}
          items={items ?? []}
          onClose={() => setGenerating(false)}
          onDone={(n) => {
            setGenerating(false)
            setTick((x) => x + 1)
            toast(t.flows.generated(n))
          }}
        />
      )}
    </div>
  )
}

/** Uygulamadan yeni içerik: metin ve seçilen görseller/videolar sıradaki numaralı klasöre yazılır (durumu `pending`). */
function AddForm({ accountId, onClose, onDone }: { accountId: string; onClose(): void; onDone(folder: string): void }) {
  const [caption, setCaption] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = () => {
    setBusy(true)
    void api()
      .contents.add(accountId, caption, files)
      .then(onDone, (e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }
  return (
    <Modal title={t.flows.addContent} onClose={() => !busy && onClose()}>
      <p className="mb-4 text-sm text-muted">{t.flows.addContentHint}</p>
      <Field label={t.flows.contentText}>
        <textarea className={`${input} min-h-32 resize-y`} value={caption} maxLength={5000} autoFocus onChange={(e) => setCaption(e.target.value)} />
      </Field>
      <div className="mb-4">
        <button className={button} onClick={() => void api().workflows.pickMedia().then((picked) => setFiles((x) => [...new Set([...x, ...picked])].slice(0, 20)))}>
          <FolderOpen className="size-3.5" /> {t.flows.pickFiles}
        </button>
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{f.split(/[\\/]/).pop()}</span>
              <button className="shrink-0 text-muted hover:text-fg" title={t.delete} aria-label={t.delete} onClick={() => setFiles((x) => x.filter((y) => y !== f))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} disabled={busy} onClick={onClose}>
          {t.cancel}
        </button>
        <button className={primary} disabled={busy || (!caption.trim() && !files.length)} onClick={save}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t.flows.addContent}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Yapay zekâ ile içerik üretimi: bir içerik örnek alınır ya da yalnız konu yazılır; her biri özgün, yeni
 * numaralı klasörler (metin + isteğe bağlı görsel) `pending` durumuyla yazılır.
 */
function GenerateForm({ accountId, items, onClose, onDone }: { accountId: string; items: LocalContent[]; onClose(): void; onDone(count: number): void }) {
  const [v, setV] = useState<GenerateInput>({ from: null, topic: '', count: 3, withImage: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sources = items.filter((i) => i.caption)
  const run = () => {
    setBusy(true)
    setError('')
    void api()
      .contents.generate(accountId, v)
      .then(onDone, (e: unknown) => setError(serverError(errorText(e))))
      .finally(() => setBusy(false))
  }
  return (
    <Modal title={t.flows.generate} onClose={() => !busy && onClose()}>
      <p className="mb-4 text-sm text-muted">{t.flows.generateHint}</p>
      <Field label={t.flows.generateFrom}>
        <select className={input} value={v.from ?? ''} onChange={(e) => setV({ ...v, from: e.target.value || null })}>
          <option value="">{t.flows.generateFromNone}</option>
          {sources.map((i) => (
            <option key={i.folder} value={i.folder}>
              {i.folder} · {i.caption.split('\n')[0].slice(0, 70)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.flows.generateTopic}>
        <textarea className={`${input} min-h-24 resize-y`} value={v.topic} maxLength={2000} placeholder={t.flows.generateTopicPlaceholder} onChange={(e) => setV({ ...v, topic: e.target.value })} />
      </Field>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          {t.flows.generateCount}
          <input type="number" min={1} max={MAX_GENERATE} className={`${input} w-20`} value={v.count} onChange={(e) => setV({ ...v, count: Math.min(MAX_GENERATE, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="flex items-center gap-2">
          <Switch on={v.withImage} label={t.flows.generateImage} onChange={(withImage) => setV({ ...v, withImage })} />
          {t.flows.generateImage}
        </label>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={button} disabled={busy} onClick={onClose}>
          {t.cancel}
        </button>
        <button className={primary} disabled={busy || (!v.from && !v.topic.trim())} onClick={run}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy ? t.flows.generating : t.flows.generate}
        </button>
      </div>
    </Modal>
  )
}
