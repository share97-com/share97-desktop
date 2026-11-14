import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'
import { withNote } from './context.ts'

/**
 * **Adım bekçisi.** LangGraph'ın `recursionLimit`i aşılınca iş hata ile kesiliyor ve o ana kadar
 * toplanan her şey kayboluyordu. Bunun yerine:
 *  - her `CHECK_EVERY` model çağrısında modele plan kontrolü hatırlatılıyor,
 *  - takılma (`stuck`): aynı çağrı aynı sonuçla tekrarlanıyorsa (arada başka çağrılar olsa da) ya da
 *    son araç sonuçlarının hepsi başarısızsa strateji değiştirmesi söyleniyor,
 *  - bitiş kontrolü: model planında bitmemiş madde varken ya da boş bir cevapla bitirmeye kalkarsa
 *    bir kez geri çevriliyor (devam et ya da neden bitmediğini yaz),
 *  - bütçe dolunca araçlar kapatılıp (`toolChoice: 'none'`) son cevap yazdırılıyor: yapılanlar,
 *    sonuçlar, neyin engellediği ve sıradaki adım.
 * Model yine de araç çağırmaya devam ederse `HARD_STOP` sonrası düz bir mesajla bitiyor.
 * Uyarılar mesajların sonuna ekleniyor (`withNote`): sistem istemi sabit kalıyor, önbellek bozulmuyor.
 */
const CHECK_EVERY = 15
const REPEAT = 3
const HARD_STOP = 3
/** Takılma için bakılan son araç çağrısı sayısı. */
const WINDOW = 12
const FAIL_STREAK = 4
/** Aynı sonucu vermesi olağan araçlar (sayfa sayfa kaydırma). */
const PASSIVE = new Set(['scroll'])
const FAILED = /^(Error:|Not found|Timed out|No tables found|None\.)/

type Todo = { content: string; status: string }

/** Son araç çağrıları, sonuçlarıyla. */
function recent(messages: BaseMessage[]) {
  const results = new Map<string, string>()
  for (const m of messages) if (ToolMessage.isInstance(m)) results.set(m.tool_call_id, typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
  return messages
    .flatMap((m) => (AIMessage.isInstance(m) ? (m.tool_calls ?? []) : []))
    .filter((c) => c.id && results.has(c.id))
    .slice(-WINDOW)
    .map((c) => ({ name: c.name, args: JSON.stringify(c.args), result: results.get(c.id!)! }))
}

/** Agent takıldı mı: hangi uyarı verilecek (yoksa null). */
export function stuck(messages: BaseMessage[]): string | null {
  const calls = recent(messages)
  const counts = new Map<string, number>()
  for (const c of calls) {
    if (PASSIVE.has(c.name)) continue
    const key = `${c.name}:${c.args}=>${c.result.slice(0, 200)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (counts.get(key) === REPEAT)
      return `You called ${c.name} with the same arguments ${REPEAT} times and got the same result each time. It will not change by repeating: think about why, then use a different approach (read_page with query to find the element by its label, another element, a direct URL, the site's export/download, look_at_page), or report what blocks you.`
  }
  const tail = calls.slice(-FAIL_STREAK)
  if (tail.length === FAIL_STREAK && tail.every((c) => FAILED.test(c.result)))
    return `Your last ${FAIL_STREAK} tool calls all failed (${[...new Set(tail.map((c) => c.name))].join(', ')}). Stop trying small variations: re-read the page (read_page), reconsider the plan and take a different route, or report what blocks you.`
  return null
}

/** Model bitirmek istiyor (araç çağrısı yok): geri çevrilecekse nedeni. */
export function unfinished(last: BaseMessage | undefined, todos: Todo[]): string | null {
  if (!last || !AIMessage.isInstance(last) || last.tool_calls?.length) return null
  const text = typeof last.content === 'string' ? last.content : last.content.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('')
  if (!text.trim()) return 'Your last reply was empty. Continue the task, or write the final answer for the user now.'
  const open = todos.filter((t) => t.status !== 'completed')
  if (open.length)
    return `You are finishing, but your plan still has ${open.length} unfinished item(s): ${open.map((t) => `"${t.content.slice(0, 80)}"`).join(', ')}. If they can still be done, continue working now. If they are blocked or no longer needed, update write_todos and tell the user exactly what was not done and why.`
  return null
}

export function stepGuard(budget: number) {
  let calls = 0
  let nudged = false
  return createMiddleware({
    name: 'StepGuard',
    wrapModelCall: (request, handler) => {
      calls++
      if (calls > budget + HARD_STOP) return new AIMessage('Step limit reached. The work above is what was done; tell me how to continue.')
      if (calls > budget)
        return handler({
          ...request,
          toolChoice: 'none',
          systemMessage: request.systemMessage.concat(
            `\n\n## Step budget used (${budget} steps)\nDo NOT call tools. Write your final answer now in the user's language: what was done, every result/data collected so far, what blocked you, and the exact next step to continue.`,
          ),
        })
      const notes: string[] = []
      const why = stuck(request.messages)
      if (why) notes.push(why)
      if (calls % CHECK_EVERY === 0) notes.push(`Checkpoint: step ${calls} of ${budget}. Review your plan (write_todos): mark finished items, and if the current approach is not making progress, change strategy now instead of trying small variations.`)
      return handler(notes.length ? withNote(request, `## Progress check\n${notes.join('\n')}`) : request)
    },
    afterModel: {
      canJumpTo: ['model'],
      hook: (state) => {
        // Bir kez: ikinci bitirişte model kararını vermiş demek.
        if (nudged || calls >= budget) return
        const why = unfinished(state.messages.at(-1), (state as { todos?: Todo[] }).todos ?? [])
        if (!why) return
        nudged = true
        return { messages: [new HumanMessage(`<context from="app">\n${why}\n</context>`)], jumpTo: 'model' as const }
      },
    },
  })
}
