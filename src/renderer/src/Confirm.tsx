import { useEffect, useState, type ReactNode } from 'react'
import { t } from './i18n.ts'

/**
 * **İki tıklamalı onay** (tarayıcı iletişim kutusu yok): ilk tıklama düğmeyi kırmızıya çevirip
 * "tekrar tıkla" diyor, 3 sn içinde ikinci tıklama işlemi yapıyor. Geri alınamayan işlemler için:
 * sohbet, şifre, geçmiş silme, çıkış, bağlantı kaldırma.
 */
export function ConfirmButton({ onConfirm, children, className, armedClassName = 'bg-danger/15 text-danger', label, confirmLabel = t.clickAgain, title }: { onConfirm: () => void; children: ReactNode; className: string; armedClassName?: string; label?: string; confirmLabel?: string; title?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      className={`${className} ${armed ? armedClassName : ''}`}
      aria-label={armed ? confirmLabel : label}
      title={armed ? confirmLabel : (title ?? label)}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {children}
      {armed && !label && <span className="ml-1">({confirmLabel})</span>}
    </button>
  )
}
