import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createMiddleware } from 'langchain'

/**
 * **Bağlam yönetimi.** Uzun işte maliyeti ve dikkati belirleyen şey modele her adımda giden bağlam:
 *  - `withNote`: adım başına değişen bilgi (sohbet verisi dizini, ilerleme uyarıları) sistem istemine
 *    değil mesajların SONUNA ekleniyor. Sistem istemi değişince sağlayıcının istem önbelleği her adımda
 *    baştan boşa gidiyordu (ölçüm: aynı sohbet, değişen sistem istemi adım başına 3 kat pahalı).
 *  - `compact`: aynı sekmenin yeni `read_page` sonucu gelince eskisi kısa bir nota iniyor. Eski
 *    sayfa görüntüsünün ref'leri zaten geçersiz; 15 bin karakterlik kopyalar bağlamı dolduruyordu.
 */

const NOTE_OPEN = '<context from="app">'
const NOTE_CLOSE = '</context>\n(Automatic context from the app, not a message from the user: do not reply to it, continue the task.)'

/** Model çağrısının sonuna kalıcı olmayan bir bağlam notu; art arda çağrılar tek notta birleşiyor. */
export function withNote<R extends { messages: BaseMessage[] }>(request: R, text: string): R {
  const last = request.messages.at(-1)
  const prev = last && HumanMessage.isInstance(last) && typeof last.content === 'string' && last.content.startsWith(NOTE_OPEN) && last.content.endsWith(NOTE_CLOSE) ?last.content.slice(NOTE_OPEN.length + 1, -NOTE_CLOSE.length - 1) : null
  const body = prev === null ? text : `${prev}\n\n${text}`
  return { ...request, messages: [...(prev === null ? request.messages : request.messages.slice(0, -1)), new HumanMessage(`${NOTE_OPEN}\n${body}\n${NOTE_CLOSE}`)] }
}

/** Bundan kısa sonuç zaten yer tutmuyor. */
const KEEP_CHARS = 800
const STALE = '[Older snapshot of this tab removed to save context: a newer read_page of the same tab follows. Its refs are no longer valid.]'

/**
 * Yerine geçilmiş sayfa görüntüleri: aynı sekmenin (browser_id + tab_id) sonraki `read_page`i varsa
 * önceki sonuç adres + başlık + nota iniyor. Dönen mesajlar aynı kimlikle: durumda eskisinin yerini alıyor.
 * Sorgulu (`query`) okumalar kısa, dokunulmuyor.
 */
export function compact(messages: BaseMessage[]): ToolMessage[] {
  const calls = new Map<string, { name: string; args: Record<string, unknown> }>()
  for (const m of messages) if (AIMessage.isInstance(m)) for (const c of m.tool_calls ?? []) if (c.id) calls.set(c.id, c)
  const latest = new Map<string, ToolMessage>()
  const out: ToolMessage[] = []
  for (const m of messages) {
    if (!ToolMessage.isInstance(m) || typeof m.content !== 'string') continue
    const call = calls.get(m.tool_call_id)
    if (call?.name !== 'read_page' || call.args.query) continue
    const key = `${String(call.args.browser_id)}|${String(call.args.tab_id ?? '')}`
    const old = latest.get(key)
    latest.set(key, m)
    if (!old || typeof old.content !== 'string' || old.content.length <= KEEP_CHARS) continue
    out.push(new ToolMessage({ id: old.id, tool_call_id: old.tool_call_id, name: old.name, content: `${old.content.split('\n', 2).join('\n')}\n${STALE}` }))
  }
  return out
}

/**
 * Her model adımından önce: eski sayfa görüntülerini sıkıştırır (kalıcı), model çağrısına `note()`
 * metnini (sohbet verisi dizini) sona ekler (kalıcı değil).
 */
export function contextMiddleware(note: () => string) {
  return createMiddleware({
    name: 'Context',
    beforeModel: (state) => {
      const stale = compact(state.messages)
      return stale.length ? { messages: stale } : undefined
    },
    wrapModelCall: (request, handler) => {
      const text = note()
      return handler(text ? withNote(request, text) : request)
    },
  })
}

/**
 * **Model hatasında ikinci şans.** `ChatOpenAI` 429/5xx'i kendi deniyor; yine de düşen çağrı (kopan
 * akış, sağlayıcı hatası, modelin araçları ya da bağlam boyunu kaldırmaması) bütün işi bitiriyordu.
 * Burada çağrı bir kez yedek modelle (`fallback`; yoksa aynı modelle) yeniden deneniyor. Kullanıcı
 * durdurduysa denenmiyor.
 */
export function resilient(signal: AbortSignal, fallback: BaseChatModel | null, onRetry: (error: string) => void) {
  return createMiddleware({
    name: 'Resilient',
    wrapModelCall: async (request, handler) => {
      try {
        return await handler(request)
      } catch (e) {
        if (signal.aborted) throw e
        onRetry((e as Error).message)
        return handler(fallback ? { ...request, model: fallback } : request)
      }
    },
  })
}
