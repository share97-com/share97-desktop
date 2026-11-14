import { Check, Copy, ExternalLink, FolderOpen, GripVertical, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FileKind } from '../../shared/types.ts'
import { api } from './hooks.ts'
import { t } from './i18n.ts'

/** "Sohbete ekle": yazma kutusu bu olayı dinleyip dosya yolunu ekliyor. */
export const ATTACH_EVENT = 'share97:attach'
export const attachToChat = (path: string) => window.dispatchEvent(new CustomEvent(ATTACH_EVENT, { detail: path }))

/** Sürükleme tutamacı + işlemler: aç, kopyala, sohbete ekle, klasörde göster, sil. */
export function FileActions({ path, kind, compact }: { path: string; kind: FileKind; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const btn = `flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg`
  const label = (s: string) => (compact ? null : <span>{s}</span>)
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <span
        draggable
        onDragStart={(e) => {
          e.preventDefault()
          api().files.drag(path)
        }}
        className={`${btn} cursor-grab`}
        title={t.dragHint}
      >
        <GripVertical className="size-3.5" /> {label(t.drag)}
      </span>
      <button className={btn} title={t.open} onClick={() => void api().files.open(path)}>
        <ExternalLink className="size-3.5" /> {label(t.open)}
      </button>
      <button
        className={btn}
        title={kind === 'image' ? t.copyImage : t.copyPath}
        onClick={() =>
          void api()
            .files.copy(path)
            .then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))
        }
      >
        {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} {label(copied ? t.copied : t.copy)}
      </button>
      <button className={btn} title={t.attach} onClick={() => attachToChat(path)}>
        <MessageSquarePlus className="size-3.5" /> {label(t.attach)}
      </button>
      <button className={btn} title={t.reveal} onClick={() => void api().files.reveal(path)}>
        <FolderOpen className="size-3.5" /> {label(t.reveal)}
      </button>
      {confirm ? (
        <button className={`${btn} text-danger`} onClick={() => void api().files.remove(path)} onBlur={() => setConfirm(false)} autoFocus>
          <Trash2 className="size-3.5" /> {t.confirmDelete}
        </button>
      ) : (
        <button className={btn} title={t.delete} onClick={() => setConfirm(true)}>
          <Trash2 className="size-3.5" /> {label(t.delete)}
        </button>
      )}
    </div>
  )
}
