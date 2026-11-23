import { Notification, type BrowserWindow } from 'electron'
import type { Chat } from '../shared/types.ts'
import { L } from './strings.ts'

/**
 * **Kullanıcının dikkati.** Agent bir onay beklerken ya da işi bitince kullanıcı başka yerdeyse
 * (pencere arka planda, ya da bir tarayıcı sekmesinde) haber veriliyor: Windows bildirimi, görev
 * çubuğu düğmesinin yanıp sönmesi. Görev çubuğundaki ilerleme çubuğu durumu sürekli gösteriyor:
 * çalışıyor (belirsiz ilerleme), onay bekliyor (sarı, duraklatılmış).
 * Bildirime tıklayınca pencere öne geliyor ve o sohbet açılıyor.
 */
export function attention(win: BrowserWindow, opts: { onOpen(chatId: string): void; homeVisible(): boolean }) {
  const prev = new Map<string, { running: boolean; pending: Set<string> }>()
  const running = new Set<string>()
  const waiting = new Set<string>()
  const away = () => win.isDestroyed() || !win.isFocused() || win.isMinimized() || !opts.homeVisible()

  const taskbar = () => {
    if (win.isDestroyed()) return
    if (waiting.size) win.setProgressBar(1, { mode: 'paused' })
    else if (running.size) win.setProgressBar(1, { mode: 'indeterminate' })
    else win.setProgressBar(-1)
  }
  win.on('focus', () => win.flashFrame(false))

  const notify = (chatId: string, title: string, body: string) => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body: body.slice(0, 250), silent: false })
    n.on('click', () => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      opts.onOpen(chatId)
    })
    n.show()
    if (!win.isFocused()) win.flashFrame(true)
  }

  return (c: Chat) => {
    const l = L()
    const before = prev.get(c.id) ?? { running: false, pending: new Set<string>() }
    const approvals = c.messages.flatMap((m) => m.parts).filter((p): p is Extract<typeof p, { type: 'approval' }> => p.type === 'approval' && p.status === 'pending')
    const pending = new Set(approvals.map((p) => p.id))
    const fresh = approvals.find((p) => !before.pending.has(p.id))
    const title = c.title || 'Share97 Agent'
    if (fresh && away()) notify(c.id, `${l.approvalNeeded}: ${title}`, fresh.text)
    if (before.running && !c.running && away()) {
      const last = c.messages.at(-1)
      if (last?.error !== 'stopped') notify(c.id, title, last?.error ? `${l.agentFailed}: ${last.error}` : l.agentDone)
    }
    prev.set(c.id, { running: c.running, pending })
    if (c.running) running.add(c.id)
    else running.delete(c.id)
    if (pending.size) waiting.add(c.id)
    else waiting.delete(c.id)
    taskbar()
  }
}
