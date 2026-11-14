import { FileArchive, FolderOpen, Import, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BackupEntry } from '../../shared/types.ts'
import { ConfirmButton } from './Confirm.tsx'
import { api, errorText } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { toast } from './Toast.tsx'
import { button, Card, iconButton, Page, primary } from './ui.tsx'

const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)

/**
 * **Yedekler.** Bütün ayarlar ve tarayıcı çerezleri tek `.share97` dosyasında (main/backup.ts). Yeni yedek al,
 * var olanı bugünkü ayarlarla güncelle, klasörde göster, geri yükle (önce bugünkü durum ayrıca yedeklenir).
 */
export function Backups() {
  const [list, setList] = useState<BackupEntry[] | null>(null)
  const [folder, setFolder] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => void api().backups.list().then(setList)
  useEffect(() => {
    load()
    void api().backups.folder().then(setFolder)
  }, [])

  const act = (key: string, p: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    void p()
      .then(() => ok && toast(ok))
      .catch((e) => toast(t.backup.errors[errorText(e)] ?? errorText(e), 'error'))
      .finally(() => (setBusy(null), load()))
  }

  return (
    <Page
      title={t.backup.title}
      hint={t.backup.hint}
      actions={
        <>
          <button className={button} onClick={() => act('import', () => api().backups.importFile())}>
            <Import className="size-4" /> {t.backup.import}
          </button>
          <button className={primary} disabled={busy === 'create'} onClick={() => act('create', () => api().backups.create(), t.backup.created)}>
            {busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t.backup.create}
          </button>
        </>
      }
    >
      <Card className="flex flex-wrap items-center gap-3">
        <FolderOpen className="size-5 shrink-0 text-muted" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t.backup.folder}</p>
          <p className="truncate font-mono text-xs text-muted" title={folder}>{folder}</p>
        </div>
        <button className={button} onClick={() => void api().backups.openFolder()}>
          {t.backup.openFolder}
        </button>
      </Card>

      <p className="text-sm text-muted">{t.backup.contains}</p>

      {!list ? (
        <Loader2 className="size-5 animate-spin text-muted" />
      ) : !list.length ? (
        <Card className="text-center">
          <p className="text-sm text-muted">{t.backup.empty}</p>
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {list.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileArchive className="size-5 shrink-0 text-muted" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted">
                  {t.backup.updated}: {dateTime.format(b.updatedAt)}, {size(b.size)}
                </p>
              </div>
              <button className={button} disabled={!!busy} onClick={() => act(b.name, () => api().backups.update(b.name), t.backup.updatedOk)}>
                <RefreshCw className={`size-4 ${busy === b.name ? 'animate-spin' : ''}`} /> {t.backup.update}
              </button>
              <ConfirmButton className={button} label={t.backup.restore} confirmLabel={t.backup.restoreConfirm} onConfirm={() => act(b.name, () => api().backups.restore(b.name))}>
                <RotateCcw className="size-4" /> {t.backup.restore}
              </ConfirmButton>
              <button className={iconButton} title={t.backup.reveal} aria-label={t.backup.reveal} onClick={() => void api().backups.reveal(b.name)}>
                <FolderOpen className="size-4" />
              </button>
              <ConfirmButton className={iconButton} label={t.backup.remove} onConfirm={() => act(b.name, () => api().backups.remove(b.name))}>
                <Trash2 className="size-4" />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t.backup.warning}</p>
    </Page>
  )
}
