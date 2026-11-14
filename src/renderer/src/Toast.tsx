import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from './i18n.ts'

/**
 * **Kısa bildirimler** (sağ altta). Arayüzdeki işlemlerin çoğu `void api()...` ile çağrılıyor;
 * başarısız olanlar yakalanmamış hata (`unhandledrejection`) olarak buraya düşüyor ve kullanıcı
 * sebebini görüyor. Tek tek her çağrıya hata yakalayıcı yazmak yerine tek yer.
 */
type Toast = { id: number; kind: 'error' | 'ok'; text: string }
let seq = 0
const listeners = new Set<(list: Toast[]) => void>()
let list: Toast[] = []
const publish = () => listeners.forEach((l) => l(list))

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++seq
  // Aynı hata art arda gelirse bir kez.
  if (list.some((x) => x.text === text)) return
  list = [...list.slice(-3), { id, kind, text }]
  publish()
  setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3000)
}
const dismiss = (id: number) => {
  list = list.filter((x) => x.id !== id)
  publish()
}

/** IPC hatasının önündeki "Error invoking remote method…" kısmı kullanıcıya gösterilmiyor. */
export const errorText = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function Toaster() {
  const [items, set] = useState<Toast[]>(list)
  useEffect(() => {
    listeners.add(set)
    const onReject = (e: PromiseRejectionEvent) => {
      e.preventDefault()
      toast(`${t.actionFailed}: ${errorText(e.reason)}`, 'error')
    }
    window.addEventListener('unhandledrejection', onReject)
    return () => {
      listeners.delete(set)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`pointer-events-auto flex select-text items-start gap-2 rounded-lg border bg-raised p-3 text-sm shadow-2xl ${x.kind === 'error' ? 'border-danger/50' : 'border-line'}`}>
          {x.kind === 'error' ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />}
          <p className="min-w-0 flex-1 break-words">{x.text}</p>
          <button className="rounded p-0.5 text-muted hover:text-fg" aria-label={t.close} onClick={() => dismiss(x.id)}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
