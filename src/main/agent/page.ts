import type { WebContents } from 'electron'

/**
 * Sayfa kontrolü. Okuma sayfada çalışan betiklerle; tıklama, yazma ve dosya yükleme Chrome DevTools
 * Protocol ile, yani sayfa bunları gerçek kullanıcı olayı olarak görüyor.
 *
 * Bütün işlemler bir **sürücü** (`Driver`) üzerinden: uygulamanın kendi sekmeleri için
 * `electronDriver` (`webContents` + `webContents.debugger`), gerçek Chrome sekmeleri için
 * `chromeDriver` (`../chrome/driver.ts`, eklentide `chrome.debugger`). Agent araçları ikisinde aynı.
 * `read_page` görünür etkileşimli öğelere `data-s97-ref` numarası veriyor; diğer araçlar
 * bu numarayla çalışıyor. Paneller sık değiştiği için sabit seçici yok.
 *
 * iframe'ler de okunuyor: oradaki öğeler `f<çerçeve>.<n>` (ör. `f1.3`). Onlarda tıklama çerçevenin
 * kendi bağlamında (`el.click()`), yazma odaklanıp CDP `Input.insertText` ile.
 * Açık shadow DOM'un içi de numaralanıyor; canvas ve site dışı iframe içi numaralanmıyor: oralar ekran görüntüsü + vision ile
 * bulunup koordinata tıklanıyor (`parsePoint`, `clickAt`, araç `click_by_vision`).
 */

export type Ref = string | number
export const MAX_FRAMES = 10

/** Bir iframe: kendi bağlamında betik çalıştırıyor. Çerçeve gittiyse `evaluate` hata veriyor. */
export type Frame = { url: string; evaluate<T>(expression: string): Promise<T> }

export type Driver = {
  /** Çerçeve listesinin saklandığı anahtar: aynı sekme için her çağrıda aynı. */
  key: unknown
  /** Ana çerçevede betik; sonucu döndürüyor. */
  evaluate<T>(expression: string): Promise<T>
  frames(): Promise<Frame[]>
  cdp<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  info(): Promise<{ url: string; title: string; loading: boolean }>
  load(url: string): Promise<void>
  go(direction: 'back' | 'forward'): Promise<void>
  reload(hard: boolean): Promise<void>
  /** JPEG data URL. */
  screenshot(): Promise<string>
  pdf(): Promise<Uint8Array>
  /** Görünümün ekrandaki gerçek genişliği (CSS pikselinden ekran pikseline çevirmek için); yoksa 1:1. */
  viewWidth?: number
  /**
   * Ekran taranırken sayfada görsel efekt (Chrome'da eklenti çiziyor). `point` (0-1000 ızgara):
   * vision'ın bulduğu yer işaretleniyor. Ekran görüntüsünden sonra açılıyor, görüntüye girmiyor.
   */
  scanEffect?(on: boolean, point?: { x: number; y: number }): Promise<void>
}

/** Ekran görüntüsünde bulunan nokta: 0-1000 ızgarada (görüntünün boyutundan bağımsız). */
export type Point = { x: number; y: number }

/** Vision yanıtından `{"found":true,"x":..,"y":..}`; bulunamadıysa null. */
export function parsePoint(answer: string, marks: { n: number; x: number; y: number; label: string }[] = []): (Point & { label: string; mark?: number }) | null {
  const m = /\{[^{}]*\}/.exec(answer)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { found?: boolean; mark?: number; x?: number; y?: number; label?: string }
    if (j.found === false) return null
    // Numaralı öğe: modelin koordinat tahmini değil, öğenin gerçek merkezi.
    if (typeof j.mark === 'number') {
      const hit = marks.find((k) => k.n === j.mark)
      return hit ? { x: hit.x, y: hit.y, label: hit.label || String(j.label ?? ''), mark: hit.n } : null
    }
    if (typeof j.x !== 'number' || typeof j.y !== 'number') return null
    if (j.x < 0 || j.x > 1000 || j.y < 0 || j.y > 1000) return null
    return { x: j.x, y: j.y, label: String(j.label ?? '') }
  } catch {
    return null
  }
}

/** Yakınlaştırma kesiti: noktanın çevresinde görüntünün `ZOOM` kadarı, görüntü pikselinde ve sınırların içinde. */
const ZOOM = 0.4
export function zoomBox(p: Point, width: number, height: number) {
  const w = Math.round(width * ZOOM)
  const h = Math.round(height * ZOOM)
  const x = Math.min(width - w, Math.max(0, Math.round((p.x / 1000) * width - w / 2)))
  const y = Math.min(height - h, Math.max(0, Math.round((p.y / 1000) * height - h / 2)))
  return { x, y, width: w, height: h }
}

/** Kesitteki nokta (kesitin 0-1000 ızgarası) tam görüntünün 0-1000 ızgarasına. */
export function unzoom(z: Point, box: { x: number; y: number; width: number; height: number }, width: number, height: number): Point {
  return { x: Math.round(((box.x + (z.x / 1000) * box.width) / width) * 1000), y: Math.round(((box.y + (z.y / 1000) * box.height) / height) * 1000) }
}

/** Izgaradaki noktanın sayfadaki öğesi (onay kararı için etiketi) ve CSS koordinatı. */
export async function atPoint(d: Driver, p: Point): Promise<{ x: number; y: number; vw: number; label: string; tag: string }> {
  return d.evaluate(`(() => {
    const x = ${p.x} / 1000 * innerWidth, y = ${p.y} / 1000 * innerHeight
    let el = document.elementFromPoint(x, y)
    while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner }
    const label = el ? (el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.alt || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : ''
    return { x, y, vw: innerWidth, label, tag: el ? el.tagName.toLowerCase() : '' }
  })()`)
}

/** Koordinata gerçek fare tıklaması: canvas, shadow DOM, site dışı iframe ve ref'i olmayan her şey için. */
export async function clickAt(d: Driver, p: Point, clickCount = 1) {
  const t = await atPoint(d, p)
  const k = factor(d.viewWidth, t.vw)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await d.cdp('Input.dispatchMouseEvent', { type, x: t.x * k, y: t.y * k, button: 'left', clickCount: type === 'mouseMoved' ? 0 : clickCount })
  await settle(d)
  return t
}

const frameGone = (url: string) => new Error(`Frame ${url} is gone. Call read_page again.`)

/** Uygulamanın kendi sekmesi. */
export function electronDriver(wc: WebContents, viewWidth?: number): Driver {
  return {
    key: wc,
    viewWidth,
    evaluate: (e) => wc.executeJavaScript(e),
    frames: async () =>
      wc.mainFrame.framesInSubtree
        .filter((f) => f !== wc.mainFrame && !f.isDestroyed())
        .slice(0, MAX_FRAMES)
        .map((f): Frame => ({ url: f.url, evaluate: <T,>(e: string) => (f.isDestroyed() ? Promise.reject<T>(frameGone(f.url)) : (f.executeJavaScript(e) as Promise<T>)) })),
    cdp: async (method, params = {}) => {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      return wc.debugger.sendCommand(method, params)
    },
    info: async () => ({ url: wc.getURL(), title: wc.getTitle(), loading: !wc.isDestroyed() && wc.isLoading() }),
    load: (url) => wc.loadURL(url).catch(() => {}),
    go: async (d) => {
      if (d === 'back') wc.navigationHistory.goBack()
      else wc.navigationHistory.goForward()
      await new Promise((r) => setTimeout(r, 1200))
    },
    reload: async (hard) => (hard ? wc.reloadIgnoringCache() : wc.reload()),
    screenshot: async () => {
      const img = await wc.capturePage().catch(() => null)
      if (img && !img.isEmpty()) {
        const scaled = img.getSize().width > 1280 ? img.resize({ width: 1280 }) : img
        return `data:image/jpeg;base64,${scaled.toJPEG(70).toString('base64')}`
      }
      // Pencere görünmüyor ya da ekran kapalı (arka plandaki tarayıcı, kilitli ekran): sayfa CDP ile çiziliyor.
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
      const { width, height } = await wc.executeJavaScript('({ width: innerWidth, height: innerHeight })')
      const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: 0, y: 0, width, height, scale: Math.min(1, 1280 / Math.max(1, width)) } })
      return `data:image/jpeg;base64,${data}`
    },
    pdf: async () => new Uint8Array(await wc.printToPDF({ printBackground: true })),
  }
}

/** Sayfa betiklerinde ortak: açık shadow root'ların içi dahil seçici araması. */
const DEEP = `const deep = (root, sel, out = []) => { out.push(...root.querySelectorAll(sel)); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deep(el.shadowRoot, sel, out); return out }`
/** Ref'in öğesi: önce belge, yoksa shadow root'lar. */
const BY_REF = (ref: string) => `(() => { ${DEEP}; const q = '[data-s97-ref=${JSON.stringify(ref)}]'; return document.querySelector(q) || deep(document, q)[0] || null })()`

/** Etkileşimli sayılan öğeler (read_page ref'leri ve vision işaretleri). */
const SEL =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=treeitem],[role=checkbox],[role=radio],[role=switch],[role=slider],[role=spinbutton],[role=combobox],[role=textbox],[role=gridcell][tabindex],[onclick],[contenteditable=""],[contenteditable=true]'

/** `read_page` sorgusunun kelimeleri: küçük harf, en az 2 karakter. */
export const queryWords = (query?: string) => (query ?? '').toLocaleLowerCase().split(/\s+/).filter((w) => w.length > 1)

/**
 * Etkileşimli öğeler, açık shadow DOM'un içi dahil. Sınır aşılırsa belge sırası değil öncelik: önce
 * açık diyalog/menü içindekiler, sonra ekranda görünenler, sonra kalanlar (sayfanın sonuna eklenen
 * açılır menüler eskiden sınırın dışında kalıyordu). `words` verilirse yalnız etiketi eşleşenler
 * (ekran dışındakiler dahil, en iyi eşleşme önce) dönüyor, sayfa metni okunmuyor.
 */
const READ = (prefix: string, max: number, textMax: number, words: string[]) => `(() => {
  const PREFIX = ${JSON.stringify(prefix)}
  const WORDS = ${JSON.stringify(words)}
  ${DEEP}
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' }
  deep(document, '[data-s97-ref]').forEach((e) => e.removeAttribute('data-s97-ref'))
  const sel = ${JSON.stringify(SEL)}
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim()
  const rank = (el) => { if (el.closest('[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[aria-modal=true],dialog[open],[popover]')) return 0; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? 1 : 2 }
  let found = [...new Set(deep(document, sel))].filter(visible).map((el, i) => ({ el, i, rank: rank(el), score: 0 }))
  const total = found.length
  if (WORDS.length) {
    for (const c of found) { const h = clean([c.el.getAttribute('aria-label'), c.el.innerText, c.el.title, c.el.placeholder, c.el.name, c.el.value, c.el.getAttribute('href')].join(' ')).toLocaleLowerCase(); c.score = WORDS.filter((w) => h.includes(w)).length }
    found = found.filter((c) => c.score).sort((a, b) => b.score - a.score || a.rank - b.rank || a.i - b.i)
  } else if (found.length > ${max}) found.sort((a, b) => a.rank - b.rank || a.i - b.i)
  const cut = found.slice(0, ${max})
  if (!WORDS.length) cut.sort((a, b) => a.i - b.i)
  const items = cut.map(({ el }, n) => {
    const ref = PREFIX + (n + 1)
    el.setAttribute('data-s97-ref', ref)
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? 'input:' + (el.type || 'text') : tag)
    const label = clean(el.getAttribute('aria-label') || el.innerText || el.placeholder || el.title || el.name || el.alt).slice(0, 80)
    let extra = ''
    if (el.type === 'password') extra = ' [password field: never type here]'
    else if ('value' in el && el.value && tag !== 'button') extra = ' value="' + String(el.value).slice(0, 60) + '"'
    if (el.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') extra += ' (checked)'
    if (el.getAttribute('aria-expanded') === 'true') extra += ' (expanded)'
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') extra += ' (disabled)'
    const href = tag === 'a' ? ' -> ' + (el.getAttribute('href') || '').slice(0, 100) : ''
    return '[' + ref + '] ' + role + ' "' + label + '"' + extra + href
  })
  const text = WORDS.length ? '' : (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, ${textMax})
  // Listede olmayan, yalnız ekran görüntüsünde görünen alanlar: canvas, iframe.
  const hidden = { canvas: deep(document, 'canvas').filter(visible).length, iframes: deep(document, 'iframe').filter(visible).length }
  return { url: location.href, title: document.title, elements: items, total, more: found.length - cut.length, text, scrollY: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight, hidden }
})()`

type ReadResult = { url: string; title: string; elements: string[]; total: number; more: number; text: string; scrollY: number; height: number; viewport: number; hidden: { canvas: number; iframes: number } }

/** Okunamayan alanlar için agent'a not: oralar ekran görüntüsüyle (look_at_page, click_by_vision). */
export function hiddenNote(h: ReadResult['hidden'], framesRead: number): string {
  const parts = [h.canvas && `${h.canvas} canvas`, h.iframes > framesRead && `${h.iframes - framesRead} unreadable iframe(s)`].filter(Boolean)
  return parts.length ? `Not in this list (visible only on screen): ${parts.join(', ')}. Use look_at_page to see them and click_by_vision to click inside them.` : ''
}

/**
 * Son `read_page`teki iframe'ler: `f<i>.` önekli referans bu listedeki çerçeveye gidiyor.
 * ponytail: sekme başına bir kayıt, kapanan sekmeninki kalıyor (küçük); çok uzun oturumda temizlik eklenir.
 */
const frameLists = new Map<unknown, Frame[]>()

/** Ekran görüntüsünde numaralanan öğe: merkezi 0-1000 ızgarada. */
export type Mark = { n: number; x: number; y: number; label: string }
const MARKS_ID = 's97-marks'
const MAX_MARKS = 90

/**
 * **Numaralı işaretler (set-of-marks).** Vision modeli koordinat tahmininde zayıf: gerçek sohbetlerde
 * `click_by_vision` 8 denemenin 6'sında yanlış öğeye tıkladı. Ekran görüntüsü alınmadan önce ekranda
 * görünen (üstü kapalı olmayan) tıklanabilir öğeler çerçevelenip numaralanıyor; model koordinat yerine
 * numara seçiyor, tıklama öğenin gerçek merkezine gidiyor. Numarası olmayan hedef (canvas, görsel,
 * site dışı iframe) için koordinat yolu duruyor.
 */
const MARK = `(() => {
  ${DEEP}
  document.getElementById(${JSON.stringify(MARKS_ID)})?.remove()
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  const host = document.createElement('div')
  host.id = ${JSON.stringify(MARKS_ID)}
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
  const out = []
  for (const el of new Set(deep(document, ${JSON.stringify(SEL)}))) {
    if (out.length >= ${MAX_MARKS}) break
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
    if (r.width * r.height > innerWidth * innerHeight * 0.5) continue
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    let top = document.elementFromPoint(cx, cy)
    while (top && top.shadowRoot) { const inner = top.shadowRoot.elementFromPoint(cx, cy); if (!inner || inner === top) break; top = inner }
    // Üstü başka bir şeyle kapalı (diyalog arkası): ekranda görünmüyor.
    if (!top || !(el.contains(top) || top.contains(el))) continue
    const n = out.length + 1
    const box = document.createElement('div')
    box.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #e100ff;border-radius:3px;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px'
    const tag = document.createElement('span')
    tag.textContent = n
    tag.style.cssText = 'position:absolute;left:-2px;top:-2px;background:#e100ff;color:#fff;font:bold 11px/13px Arial,sans-serif;padding:0 3px;border-radius:3px'
    box.append(tag)
    host.append(box)
    out.push({ n, x: Math.round(cx / innerWidth * 1000), y: Math.round(cy / innerHeight * 1000), label: clean(el.getAttribute('aria-label') || el.innerText || el.placeholder || el.title || el.value || el.alt).slice(0, 60) })
  }
  document.documentElement.append(host)
  return out
})()`

/** Ekrandaki tıklanabilir öğeleri numaralar (ekran görüntüsü için); `unmark` kaldırır. */
export const mark = (d: Driver) => d.evaluate<Mark[]>(MARK)
export const unmark = (d: Driver) => d.evaluate<void>(`void document.getElementById(${JSON.stringify(MARKS_ID)})?.remove()`)

/** Sayfanın tamamı; `query` verilirse yalnız etiketi eşleşen öğeler (kısa sonuç, ekran dışı dahil). */
export async function readPage(d: Driver, query?: string): Promise<string> {
  const words = queryWords(query)
  const r = await d.evaluate<ReadResult>(READ('', words.length ? 60 : 250, 12000, words))
  const frames = await d.frames()
  frameLists.set(d.key, frames)
  const sections: string[] = []
  let framesRead = 0
  for (const [i, f] of frames.entries()) {
    const fr = await f.evaluate<ReadResult>(READ(`f${i + 1}.`, words.length ? 30 : 120, 3000, words)).catch(() => null)
    if (fr) framesRead++
    if (fr && (fr.elements.length || fr.text.trim())) sections.push(`\nFrame f${i + 1} (${fr.url}):`, fr.elements.join('\n') || '(no interactive elements)', ...(words.length ? [] : ['<frame_text untrusted="true">', fr.text, '</frame_text>']))
  }
  const head = [`URL: ${r.url}`, `Title: ${r.title}`, `Scroll: ${r.scrollY}/${r.height} (viewport ${r.viewport})`, '']
  if (words.length)
    return [
      ...head,
      `Elements matching ${JSON.stringify(query)} on the whole page, off-screen included (${r.elements.length} of ${r.total} interactive elements, best match first):`,
      r.elements.join('\n') || (sections.length ? '(none in the main page)' : 'None. Try other words (the label may be an icon name or in another language), read_page without query, or look_at_page.'),
      ...sections,
      hiddenNote(r.hidden, framesRead),
    ].join('\n')
  return [
    ...head,
    'Interactive elements (use the ref, e.g. 12 or f1.3 inside a frame):',
    r.elements.join('\n') || '(none)',
    ...(r.more > 0 ? [`…${r.more} more interactive element(s) off-screen are not listed: scroll, or read_page with query to find one by its label.`] : []),
    ...sections,
    hiddenNote(r.hidden, framesRead),
    '',
    '<page_text untrusted="true">',
    r.text,
    '</page_text>',
  ].join('\n')
}

type Target = { x: number; y: number; vw: number; label: string; tag: string; type: string; editable: boolean }

const TARGET = (ref: string) => `(() => {
  const el = ${BY_REF(ref)}
  if (!el) return null
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const r = el.getBoundingClientRect()
  const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: innerWidth, label, tag: el.tagName.toLowerCase(), type: el.type || '', editable: el.isContentEditable || ['input', 'textarea'].includes(el.tagName.toLowerCase()) }
})()`

/** Model referansı bazen `"f1.3"` ya da `[12]` diye gönderiyor: tırnak ve köşeli parantez atılıyor. */
const clean = (ref: Ref) => String(ref).replace(/[\s"'[\]]/g, '')

/** CSS pikselinden ekran pikseline: görünümün gerçek genişliği / sayfanın innerWidth'i (yakınlaştırma ve canlı pencere dahil). */
const factor = (viewWidth: number | undefined, vw: number) => (viewWidth && vw ? viewWidth / vw : 1)

/** Referansın çerçevesi: `f2.5` ikinci iframe, düz sayı ana çerçeve. */
function frameOf(d: Driver, ref: string): Frame | null {
  const m = /^f(\d+)\./.exec(ref)
  if (!m) return null
  const f = frameLists.get(d.key)?.[Number(m[1]) - 1]
  if (!f) throw new Error(`Frame for [${ref}] is gone. Call read_page again.`)
  return f
}

/** Tıklamadan önce agent'ın onay kararı için öğenin etiketi. */
export async function describe(d: Driver, ref: Ref): Promise<Target & { frame: Frame | null }> {
  const r = clean(ref)
  const frame = frameOf(d, r)
  const t = await (frame ?? d).evaluate<Target | null>(TARGET(r))
  if (!t) throw new Error(`Element [${r}] not found. Call read_page again; refs change when the page changes. If it is still missing use click_by_vision.`)
  return { ...t, frame }
}

const inFrame = (frame: Frame, ref: string, body: string) => frame.evaluate(`(() => { const el = ${BY_REF(ref)}; if (!el) return; ${body} })()`)

export async function click(d: Driver, ref: Ref) {
  const t = await describe(d, ref)
  const k = factor(d.viewWidth, t.vw)
  if (t.frame) await inFrame(t.frame, clean(ref), 'el.focus(); el.click()')
  else
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await d.cdp('Input.dispatchMouseEvent', { type, x: t.x * k, y: t.y * k, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 })
  await settle(d)
  return t
}

const SELECT_ALL = 'el.focus(); if (el.select) el.select(); else { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }'

export async function type(d: Driver, ref: Ref, text: string, opts: { clear: boolean; submit: boolean }) {
  const t = await describe(d, ref)
  if (t.type === 'password') throw new Error('Refusing to type into a password field. Ask the user to sign in themselves.')
  const r = clean(ref)
  if (t.frame) await inFrame(t.frame, r, opts.clear ? SELECT_ALL : 'el.focus()')
  else {
    await click(d, r)
    if (opts.clear) await d.evaluate(`(() => { const el = ${BY_REF(r)}; if (!el) return; ${SELECT_ALL} })()`)
  }
  await d.cdp('Input.insertText', { text })
  if (opts.submit) await pressKey(d, 'Enter')
  return t
}

const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  Space: { code: 'Space', keyCode: 32, text: ' ' },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  PageDown: { code: 'PageDown', keyCode: 34 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
}
export const KEY_NAMES = Object.keys(KEYS) as [string, ...string[]]

export async function pressKey(d: Driver, key: string) {
  const k = KEYS[key]
  if (!k) throw new Error(`Unknown key ${key}`)
  const base = { key: key === 'Space' ? ' ' : key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode }
  await d.cdp('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text && { text: k.text }) })
  await d.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  await settle(d)
}

export async function scroll(d: Driver, direction: 'up' | 'down', pixels?: number) {
  const { innerWidth, innerHeight } = await d.evaluate<{ innerWidth: number; innerHeight: number }>('({ innerWidth, innerHeight })')
  const delta = (pixels ?? Math.round(innerHeight * 0.8)) * (direction === 'down' ? 1 : -1)
  const scale = factor(d.viewWidth, innerWidth)
  // Fare tekerleği sayfanın ortasında: iç kaydırma alanları (Ads tabloları) da kayıyor.
  await d.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: (innerWidth / 2) * scale, y: (innerHeight / 2) * scale, deltaX: 0, deltaY: delta })
  await settle(d, 400)
}

export async function waitFor(d: Driver, text: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs
  const probe = `document.body ? document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}) : false`
  while (Date.now() < until) {
    if (await d.evaluate<boolean>(probe)) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** Sayfadaki metnin kaç kez geçtiği (Chrome sekmelerinde Ctrl+F karşılığı). */
export const countText = (d: Driver, text: string) =>
  d.evaluate<number>(`(() => { const h = (document.body ? document.body.innerText : '').toLowerCase(); const q = ${JSON.stringify(text.toLowerCase())}; if (!q) return 0; let n = 0, i = 0; while ((i = h.indexOf(q, i)) !== -1) { n++; i += q.length } return n })()`)

const TABLES = `(() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim()
  const out = []
  for (const t of document.querySelectorAll('table')) {
    const rows = [...t.rows].map((r) => [...r.cells].map((c) => clean(c.innerText)))
    if (rows.length > 1) out.push(rows)
  }
  for (const g of document.querySelectorAll('[role=grid],[role=table],[role=treegrid]')) {
    const rows = [...g.querySelectorAll('[role=row]')].map((r) => [...r.querySelectorAll('[role=gridcell],[role=cell],[role=columnheader],[role=rowheader]')].map((c) => clean(c.innerText))).filter((r) => r.length)
    if (rows.length > 1) out.push(rows)
  }
  return out.slice(0, 6).map((rows) => rows.slice(0, 300))
})()`

export const extractTables = (d: Driver) => d.evaluate<string[][][]>(TABLES)

export async function uploadFiles(d: Driver, ref: Ref, files: string[]) {
  ref = clean(ref)
  if (/^f\d+\./.test(ref)) throw new Error('File inputs inside frames are not supported; open the frame URL in a tab instead.')
  const { result } = await d.cdp<{ result: { objectId?: string; subtype?: string } }>('Runtime.evaluate', { expression: BY_REF(ref) })
  if (!result.objectId || result.subtype === 'null') throw new Error(`Element [${ref}] not found.`)
  await d.cdp('DOM.setFileInputFiles', { files, objectId: result.objectId })
  await settle(d)
}

/** Bir eylemden sonra sayfanın yüklenmesi ya da tepki vermesi için kısa bekleme. */
export async function settle(d: Driver, ms = 700) {
  await new Promise((r) => setTimeout(r, ms))
  const until = Date.now() + 10_000
  while (Date.now() < until && (await d.info().catch(() => ({ loading: false }))).loading) await new Promise((r) => setTimeout(r, 250))
}

export async function navigate(d: Driver, url: string) {
  await d.load(url)
  await settle(d, 300)
}
