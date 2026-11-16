/**
 * **Akış motoru** — saf kısım (main ve testler okuyor). Akışın tanımı (graf) sunucuda durur ve orada
 * doğrulanır; **çalıştırmak bu uygulamanın işi**: zamanı gelen akışı bu cihaz yürütür (`main/runner.ts`),
 * sunucuya yalnız çalışmanın kaydını yazar. Burada grafın yürüyüşü (`runWalk`), koşul ve şablon
 * ifadeleri, yuva hesabı (`dueSlot`) ve atlanan çalışmanın nedeni (`skipReason`) var.
 *
 * Her düğüm bir öğe **grubu** taşır; bir düğümün ürettiği grup yalnız kendi kenarlarından aşağı akar.
 * `error` kenarı olan düğüm patlarsa akış o koldan sürer; yoksa çalışma `failed` olur. Graf çevrimsizdir.
 */

export const PUBLISH_NODES = ['instagram', 'tiktok', 'x', 'linkedin', 'facebook', 'youtube', 'pinterest', 'threads', 'reddit'] as const
export type PublishNode = (typeof PUBLISH_NODES)[number]
export type NodeType = 'trigger' | 'queue' | 'generate' | 'hashtags' | 'condition' | 'transform' | 'merge' | 'split' | 'subWorkflow' | 'loop' | 'delay' | 'agent' | PublishNode
export const isPublish = (t: string): t is PublishNode => (PUBLISH_NODES as readonly string[]).includes(t)

/** Sunucunun doğruladığı graf (`modules/workflow/graph.ts`); düğüm verisi türüne göre okunur. */
export type GraphNode = { id: string; type: NodeType; data: Record<string, unknown> }
export type GraphEdge = { source: string; target: string; sourceHandle?: string | null }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }
export type Trigger = { mode: 'weekly' | 'interval'; days: number[]; times: string[]; everyHours: number }

export type ConditionCheck = 'hasPost' | 'hasMedia' | 'isVideo' | 'weekend' | 'custom'
export type ExprEnv = Record<string, string | number | boolean>

/** Bir düğümün ardılları. `handle` verilmezse yalnız düz kenarlar; özel kollar (`yes`/`no`/`error`/`loop`/`done`) açıkça istenir. */
export const nextOf = (g: Graph, id: string, handle?: 'yes' | 'no' | 'error' | 'loop' | 'done') =>
  g.edges.filter((e) => e.source === id && (handle ? e.sourceHandle === handle : !e.sourceHandle)).map((e) => e.target)

export const triggersIn = (g: Graph) => g.nodes.filter((n) => n.type === 'trigger')

export type StepStatus = 'ok' | 'skip' | 'fail' | 'wait'
/** `output`: bu adımdan sonra akan içeriğin düz bir anlık görüntüsü — düzenleyicinin test
 * çalışması panelinde ve çalışma geçmişinde adım adım "hangi düğümden ne geldiği" görünsün diye.
 * `parent`: adım bir `loop` ya da `subWorkflow` gövdesinde koştuysa o düğümün kimliği — gövde
 * kendi `runWalk`ini çağırıyor ve adımları aynı kayda düşüyor, yoksa gövde logda görünmüyordu. */
export type RunStep = { node: string; type: NodeType; status: StepStatus; at: number; ms: number; detail?: string; output?: Record<string, unknown>; parent?: string }

/**
 * **Bir çalışmanın yürüyüşü.** Esnek grafta kollar yeniden birleşebilir (bkz. `smartQueue`
 * şablonu, ya da kullanıcının kendi çatallanan-birleşen grafı); her düğüm bu yürüyüşte
 * **en çok bir kez** çalışıyor — n8n'de de bir düğüm bir çalıştırmada bir kez koşar. Saf:
 * hiçbir düğümü yürütmüyor, yalnız hangi sıra ve hangi düğümün bir kez çalışacağını veriyor.
 */
export class NodeWalker {
  private readonly visited = new Set<string>()
  private readonly stack: string[]
  private readonly noDedupe: ReadonlySet<string>
  /** `noDedupe`: bu kimlikler her geldiğinde döner — "tüm kollar gelsin" bekleyen birleşme
   * düğümleri için (bkz. `runWalk`), tek seferlik ziyaret kuralının dışında tutuluyor. */
  constructor(start: string[], opts: { noDedupe?: ReadonlySet<string> } = {}) {
    this.stack = [...start].reverse()
    this.noDedupe = opts.noDedupe ?? new Set()
  }
  /** Sıradaki, henüz ziyaret edilmemiş düğüm kimliği — kalmadıysa `undefined`. */
  next(): string | undefined {
    while (this.stack.length) {
      const id = this.stack.pop()!
      if (this.noDedupe.has(id)) return id
      if (!this.visited.has(id)) {
        this.visited.add(id)
        return id
      }
    }
    return undefined
  }
  /** Bir düğümün yürütülmesinden sonra ardıllarını kuyruğa ekler (ilk bağlanan önce koşsun diye ters). */
  push(ids: string[]) {
    this.stack.push(...[...ids].reverse())
  }
}

/**
 * **`{{ }}` içinde bir alan adı değil, serbest bir DEĞER ifadesi** — n8n'in `{{ expression }}`
 * alanları gibi. `{{mediaCount}}` hâlâ çalışıyor ama `{{mediaCount > 0}}` ya da
 * `{{captionLength > 80 && !isVideo}}` da yazılabiliyor; sonuç metne (`"true"`/sayı/dize
 * olarak) basılıyor. Aynı güvenli dilbilgisi (`evalValue`) — kod çalıştırmıyor. Bozuk ifade ya
 * da tanımsız alan yer tutucuyu olduğu gibi bırakır (sessizce boşalmasın).
 */
export const interpolate = (template: string, env: ExprEnv) =>
  template.replace(/\{\{([^{}]+)\}\}/g, (m, expr: string) => {
    try {
      return String(evalValue(expr.trim(), env))
    } catch {
      return m
    }
  })

/**
 * **`subWorkflow` düğümünün giriş denetimi** — saf, DB'siz test ediliyor. `main/runner.ts` bunu bir
 * hedef akışı çalıştırmadan ÖNCE çağırıyor: ya azami iç içe derinlik aşıldıysa ya da hedef
 * bu çağrı zincirinde zaten varsa (A → B → A gibi döngüsel çağrı) `false` döner, çağıran
 * `Stop` fırlatıp akışı güvenle bitirir — sınırsız özyinelemeye karşı tek kapı.
 */
export const canEnterSubWorkflow = (visited: ReadonlySet<string>, depth: number, targetId: string, maxDepth: number) =>
  depth < maxDepth && !visited.has(targetId)

/**
 * **`split` düğümünün saf çekirdeği.** Her öğeyi kendi `media`sı kadar öğeye ayırır (hiç
 * medyası yoksa öğe değişmeden kalır) — n8n'in bir öğeyi listesine ayırması gibi. Saf:
 * `main/runner.ts` burayı `CtxPost[]` ile çağırıyor, test DB'siz doğrudan bu fonksiyonu çağırıyor.
 */
export function splitByMedia<M, T extends { media: M[] }>(items: T[]): T[] {
  return items.flatMap((item) => (item.media.length > 1 ? item.media.map((m) => ({ ...item, media: [m] })) : [item]))
}

/** Azami parça sayısı — `loop` düğümünün bir öğe grubunu ne kadar dilimleyebileceğinin üst sınırı. */
export const MAX_LOOP_BATCHES = 50

/**
 * **`loop` düğümünün saf çekirdeği.** Grubu `batchSize` büyüklüğünde ardışık parçalara
 * böler — n8n'in "Split in Batches"ındaki dilimleme. Saf: `main/runner.ts` her parça için `loop`
 * kolunun alt-grafını bir kez yürütüyor (bkz. dosyanın başındaki not), burada yalnız dilimleme var.
 */
export function batchesOf<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, batchSize)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export class ExprError extends Error {}

const EXPR_TOKEN = /==|!=|>=|<=|&&|\|\||[()!<>]|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*/g

/**
 * **Serbest mantık ifadesi** — koşulun `custom` kontrolü ve benzerleri için. Sabit bir
 * alan/işlem listesi değil: `&&`/`||`/`!`, parantez, `==`/`!=`/`>`/`>=`/`<`/`<=`
 * karşılaştırmaları ve `env`deki her ad serbestçe birleşebiliyor (örn. `captionLength > 80
 * && !isVideo`). **Kod çalıştırmıyor** — `eval`/`Function` yok, yalnız bu küçük dilbilgisi;
 * tanımsız bir ad ya da bozuk söz dizimi `ExprError` fırlatır.
 */
export function evalExpr(expr: string, env: ExprEnv): boolean {
  const tokens = [...expr.matchAll(EXPR_TOKEN)].map((m) => m[0])
  let i = 0
  const peek = () => tokens[i]
  const eat = (expected?: string) => {
    const t = tokens[i++]
    if (t === undefined || (expected && t !== expected)) throw new ExprError(`beklenmeyen uç: "${expected ?? ''}" — kalan: ${t ?? '(yok)'}`)
    return t
  }
  const value = (): string | number | boolean => {
    if (peek() === '(') {
      eat('(')
      const v = or()
      eat(')')
      return v
    }
    if (peek() === '!') {
      eat('!')
      return !value()
    }
    const t = eat()
    if (t === 'true') return true
    if (t === 'false') return false
    if (/^-?\d/.test(t)) return Number(t)
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
    if (!(t in env)) throw new ExprError(`tanımsız alan: ${t}`)
    return env[t]
  }
  const compare = (): boolean => {
    const left = value()
    const op = peek()
    if (op && ['==', '!=', '>', '>=', '<', '<='].includes(op)) {
      eat()
      const right = value()
      switch (op) {
        case '==':
          return left === right
        case '!=':
          return left !== right
        case '>':
          return Number(left) > Number(right)
        case '>=':
          return Number(left) >= Number(right)
        case '<':
          return Number(left) < Number(right)
        default:
          return Number(left) <= Number(right)
      }
    }
    return Boolean(left)
  }
  const and = (): boolean => {
    let v = compare()
    while (peek() === '&&') {
      eat()
      v = compare() && v
    }
    return v
  }
  const or = (): boolean => {
    let v = and()
    while (peek() === '||') {
      eat()
      v = and() || v
    }
    return v
  }
  const result = or()
  if (i < tokens.length) throw new ExprError(`fazladan uç: ${tokens[i]}`)
  return result
}

/** `evalExpr` çökerse (bozuk söz dizimi, tanımsız alan) hata fırlatmak yerine `false` — koşul düğümü akışı durdurmasın. */
export const safeEvalExpr = (expr: string, env: ExprEnv) => {
  try {
    return evalExpr(expr, env)
  } catch {
    return false
  }
}

const SINGLE_TOKEN = /^(?:-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|true|false|[A-Za-z_][A-Za-z0-9_]*)$/

/**
 * **`interpolate`in değer motoru.** Tek bir ad/sayı/dize/bool ise (`mediaCount`, `"x"`, `3`)
 * doğrudan o DEĞERİ döndürür — `evalExpr`in tersine `Boolean()`a zorlamıyor. Karşılaştırma ya
 * da mantık içeriyorsa (`mediaCount > 0`) `evalExpr`e düşer, sonucu `true`/`false` olur.
 */
export function evalValue(expr: string, env: ExprEnv): string | number | boolean {
  const t = expr.trim()
  if (SINGLE_TOKEN.test(t)) {
    if (t === 'true') return true
    if (t === 'false') return false
    if (/^-?\d/.test(t)) return Number(t)
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
    if (!(t in env)) throw new ExprError(`tanımsız alan: ${t}`)
    return env[t]
  }
  return evalExpr(t, env)
}

/**
 * **Koşul düğümünün kararı.** `main/runner.ts` bunu çağırıyor; saf (veritabanına
 * bağlı değil) olduğu için burada doğrudan test ediliyor — `execute()`in DB'ye bağlı
 * kısımlarının aksine. `env` zaten `hasPost`/`hasMedia`/`isVideo`/`weekday` taşıyor
 * (bkz. `main/runner.ts` `envOf`), bu yüzden hazır kontroller de `custom` gibi `env`den okuyor.
 */
export function evaluateCondition(check: ConditionCheck, expr: string, env: ExprEnv): boolean {
  switch (check) {
    case 'hasPost':
      return Boolean(env.hasPost)
    case 'hasMedia':
      return Boolean(env.hasMedia)
    case 'isVideo':
      return Boolean(env.isVideo)
    case 'weekend':
      return env.weekday === 0 || env.weekday === 6
    case 'custom':
      return safeEvalExpr(expr, env)
  }
}

/**
 * `items`: **tanımsız bırakılırsa** düğüm grubu değiştirmedi, aynı grup olduğu gibi akıyor.
 * Açıkça verilirse (boş dizi dahil) yeni grup bu düğümün **kendi** kenarlarından ilerliyor.
 * `routes`: birden çok kol farklı alt gruplarla aynı anda beslenebilsin diye (yalnız
 * `condition` kullanıyor — her öğe kendi başına değerlendirilip `yes`/`no`ya ayrılıyor,
 * n8n'in IF düğümünün öğe bazlı dallanması gibi); verilirse `items`/`handle` yok sayılır.
 */
export type WalkOut<P> = { status: StepStatus; detail?: string; handle?: 'yes' | 'no' | 'done'; items?: P[]; routes?: { handle?: 'yes' | 'no' | 'done'; items: P[] }[] }
export type WalkExecute<P> = (node: GraphNode, items: P[]) => Promise<WalkOut<P>>
export type WalkResult<P> = { steps: RunStep[]; failure: string | null; error: unknown; waiting: boolean; lastItems: P[] }

/** Bir düğüme giren, `error` olmayan kenar sayısı — `merge`in `all` modunun kaç kol beklediği. */
const inDegree = (graph: Graph, id: string) => graph.edges.filter((e) => e.target === id && e.sourceHandle !== 'error').length

/**
 * **Yürüyüşün saf motoru.** `execute` DB'ye bağlı gerçek işi (`main/runner.ts`) yapıyor — burada
 * yalnız bir geri çağırım. Gerçek veri akışı (her düğüm kendi öğe **grubunu** alır/döndürür,
 * `inbox`), hata kolu (`error` kenarı) ve "tüm kollar gelsin" birleşmesi (`merge: 'all'`)
 * davranışı böylece **veritabanı olmadan test edilebiliyor**; `main/runner.ts` bu
 * sonucu yalnız veritabanına yazıyor. `describe`: adımın çıktısını (`output`) üretmek için —
 * saf, isteğe bağlı; verilmezse adımlar çıktısız kalır. `onStep`: her adım yazıldığı anda —
 * çalışma sürerken kaydı adım adım tazelemek ve iç içe yürüyüşleri tek kayda toplamak için.
 */
export async function runWalk<P>(
  graph: Graph,
  start: { id: string; items: P[] }[],
  execute: WalkExecute<P>,
  prior: RunStep[] = [],
  describe?: (items: P[]) => Record<string, unknown>,
  onStep?: (step: RunStep) => unknown,
): Promise<WalkResult<P>> {
  const steps = [...prior]
  const record = async (s: RunStep) => {
    steps.push(s)
    await onStep?.(s)
  }
  let waiting = false
  let failure: string | null = null
  let error: unknown = null
  let lastItems: P[] = []

  // "Tüm kollar gelsin" bekleyen birleşme düğümleri: ziyaret dedup'ının dışında tutuluyor
  // (her kol onları ayrı ayrı tetikler), yeterli sayıda kol gelene kadar atlanıp bekleniyor.
  const waitAll = new Set(graph.nodes.filter((n) => n.type === 'merge' && n.data.mode === 'all').map((n) => n.id))
  const arrivals = new Map<string, number>()
  const completed = new Set<string>()

  const walker = new NodeWalker(start.map((s) => s.id), { noDedupe: waitAll })
  // Her dal kendi grubunu taşıyor — ortak bir değişken yok. Bir düğüm iki koldan
  // ulaşılabilirse (bkz. `smartQueue`), `NodeWalker` yalnız ilk ulaşanı çalıştırır (`first`);
  // `all` moduysa son ulaşan kolun grubuyla sürüyor (en basit "hepsini birleştir" kuralı).
  const inbox = new Map<string, P[]>(start.map((s) => [s.id, s.items]))
  const route = (kids: string[], items: P[]) => {
    walker.push(kids)
    for (const k of kids) inbox.set(k, items)
    if (items.length) lastItems = items
  }
  try {
    let id: string | undefined
    while ((id = walker.next()) !== undefined) {
      const node = graph.nodes.find((n) => n.id === id)
      if (!node) continue
      if (completed.has(id)) continue
      const items = inbox.get(id) ?? []
      if (waitAll.has(id)) {
        const n = (arrivals.get(id) ?? 0) + 1
        arrivals.set(id, n)
        if (n < inDegree(graph, id)) {
          await record({ node: id, type: node.type, status: 'skip', at: Date.now(), ms: 0, detail: `waiting ${n}/${inDegree(graph, id)}` })
          continue
        }
        completed.add(id)
      }
      const t0 = Date.now()
      const step = (status: StepStatus, detail?: string, output?: Record<string, unknown>) =>
        record({ node: node.id, type: node.type, status, at: t0, ms: Date.now() - t0, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(output ? { output } : {}) })
      let out: WalkOut<P>
      try {
        out = await execute(node, items)
      } catch (err) {
        await step('fail', err instanceof Error ? err.message : String(err))
        // `error` kenarı varsa akış kendi hata koluna devam ediyor — n8n'in düğüm başına
        // hata çıkışı gibi. Yoksa dış catch'e düşer: çalışma biter/yeniden denenir.
        const errorKids = nextOf(graph, node.id, 'error')
        if (!errorKids.length) throw err
        route(errorKids, items)
        continue
      }
      if (out.routes) {
        await step(out.status, out.detail, describe ? describe(out.routes.flatMap((r) => r.items)) : undefined)
        if (out.status === 'wait') {
          waiting = true
          continue
        }
        for (const r of out.routes) route(nextOf(graph, node.id, r.handle), r.items)
        continue
      }
      const nextItems = out.items !== undefined ? out.items : items
      await step(out.status, out.detail, describe ? describe(nextItems) : undefined)
      if (out.status === 'wait') {
        waiting = true
        continue
      }
      route(nextOf(graph, node.id, out.handle), nextItems)
    }
  } catch (err) {
    error = err
    failure = err instanceof Error ? err.message : String(err)
  }
  return { steps, failure, error, waiting, lastItems }
}

/* ---------------- Yuvalar: zamanlama düğümünün tetiklendiği anlar ---------------- */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Saat diliminin verilen andaki UTC farkı (ms). Yaz saati geçişini doğru veriyor. */
function offsetMs(at: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at / 1000) * 1000
}

/** Saat dilimindeki yerel tarih/saati UTC ana çevirir. İki tur: geçiş anına denk gelen saatte fark değişiyor. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const first = guess - offsetMs(guess, tz)
  const second = guess - offsetMs(first, tz)
  return second
}

/** Verilen anın saat dilimindeki yerel takvim günü. */
function localDate(at: number, tz: string) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

/**
 * `from`dan sonraki ilk `count` yuva (UTC ms, artan). Haftalık modda iki hafta ileriye
 * bakmak yetiyor (en seyrek yuva haftada bir); aralık modunda yuvalar çağın katlarına
 * hizalı — BullMQ'nun `every` zamanlayıcısıyla aynı hizalama, yani ekranın gösterdiği saat
 * işin koştuğu saat.
 */
export function nextSlots(t: Trigger, tz: string, from: number, count: number): number[] {
  if (t.mode === 'interval') {
    const every = t.everyHours * HOUR
    const first = Math.floor(from / every) * every + every
    return Array.from({ length: count }, (_, i) => first + i * every)
  }
  if (!t.days.length || !t.times.length) return []
  const out: number[] = []
  const start = localDate(from, tz)
  for (let i = 0; i < 15 && out.length < count * 4; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i))
    if (!t.days.includes(day.getUTCDay())) continue
    for (const time of t.times) {
      const [h, min] = time.split(':').map(Number)
      const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, min, tz)
      if (at > from) out.push(at)
    }
  }
  return [...new Set(out)].sort((a, b) => a - b).slice(0, count)
}

const DAY = 24 * HOUR

/**
 * **Zamanı gelen yuva**: `(after, now]` aralığındaki **en son** yuva; yoksa `null`. Uygulama kapalıyken birden çok
 * yuva kaçtıysa yalnız sonuncusu çalışır (tek telafi, üst üste yığılmaz); bir günden eski yuva hiç çalışmaz.
 */
export function dueSlot(t: Trigger, tz: string, after: number, now: number): number | null {
  let from = Math.max(after, now - DAY)
  let due: number | null = null
  for (;;) {
    const [next] = nextSlots(t, tz, from, 1)
    if (next === undefined || next > now) return due
    due = from = next
  }
}

/* ---------------- Atlanan çalışmanın nedeni ---------------- */

/** `queue` düğümünün "klasörde paylaşılacak içerik kalmadı" adım notu (bkz. `skipReason`). */
export const NO_CONTENT = 'no content left in the folder'

/**
 * **Çalışma neden atlandı** (hiçbir hesapta iş yapılmadı, hata da yok): adım kaydından ve grafın bağlantılarından
 * okunur, çalışmanın kaydına yazılır. Kullanıcı "atlandı"yı nedeniyle görür.
 */
export function skipReason(g: Graph, steps: Pick<RunStep, 'node' | 'type' | 'status' | 'detail'>[]): string {
  if (steps.some((s) => s.type === 'queue' && s.detail === NO_CONTENT)) return 'No content left to share: add content to the workflow folder (or turn on "start over") and it runs at the next slot.'
  const accounts = steps.filter((s) => isPublish(s.type))
  if (accounts.length) return `No content reached the account step (${[...new Set(accounts.map((s) => s.detail).filter(Boolean))].join('; ') || 'nothing to share'}).`
  const source = steps.find((s) => (s.type === 'queue' || s.type === 'generate') && s.status === 'ok')
  if (source && !nextOf(g, source.node).length && nextOf(g, source.node, 'error').length)
    return 'The content never reached an account: the content step is connected to the next step only through its error output. In the editor, connect its normal output to the account step.'
  if (source) return 'The content never reached an account step: check the connections and conditions in the editor.'
  return 'No account step was reached from the schedule: check the connections in the editor.'
}
