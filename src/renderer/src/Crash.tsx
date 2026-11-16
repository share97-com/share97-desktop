import { Component, type ReactNode } from 'react'
import { t } from './i18n.ts'
import { primary } from './ui.tsx'

/**
 * **Kök hata sınırı.** React çizim hatasında bütün ağacı söküyor: sunucunun hesap yanıtı uygulamanın beklediğinden
 * farklı geldiğinde (0.9.0 → bakiye modeli) tek bir `undefined` okuması pencereyi bomboş bırakıyordu ve kullanıcının
 * elinde ne bir mesaj ne bir düğme kalıyordu. Şimdi hatanın kendisi ve "Yenile" görünüyor; hata konsola da yazılıyor.
 */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[renderer]', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main role="alert" className="grid min-h-dvh place-items-center bg-bg p-8 text-fg">
        <div className="flex max-w-md flex-col items-start gap-4">
          <p className="text-base">{t.crashed}</p>
          <pre className="max-h-40 w-full overflow-auto rounded-md border border-line bg-panel p-3 text-xs text-muted">{error.message}</pre>
          <button className={primary} onClick={() => location.reload()}>
            {t.reload}
          </button>
        </div>
      </main>
    )
  }
}
