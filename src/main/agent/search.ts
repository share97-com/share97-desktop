import { settle, type Driver } from './page.ts'

/**
 * **Google araması.** Gerçek bir tarayıcı sekmesinde (uygulama tarayıcısı ya da eklentiyle bağlı
 * Chrome) google.com'da arıyor, sonuç sayfasını okuyor, sonra ilk sonuçların sayfalarını açıp
 * metinlerini alıyor. API değil, kullanıcının gördüğü sonuçlar; çerezler ve dil o tarayıcınınki.
 */

/** `url`: açılacak bağlantı (yönlendirme olabilir); `shown`: Google'ın gösterdiği adres. */
export type SearchResult = { title: string; url: string; shown: string; snippet: string }

const PAGE_CHARS = 30_000
const PAGE_TIMEOUT_MS = 20_000

/**
 * Sonuç sayfasından organik sonuçlar; seçiciler değişirse `#rso` metni yedek. Google bağlantıları
 * kimi zaman doğrudan, kimi zaman yönlendirme (`/url?q=`, opak `/goto?url=`): çözülebilen açılıyor,
 * opak olan olduğu gibi kalıyor (açılınca gerçek adrese gidiyor) ve görünen adres `cite` metninden.
 */
const SERP = `(() => {
  const out = []
  const seen = new Set()
  const real = (href) => {
    try {
      const u = new URL(href)
      if (!/(^|\\.)google\\./.test(u.hostname)) return href
      for (const k of ['q', 'url']) { const v = u.searchParams.get(k); if (v && /^https?:\\/\\//.test(v)) return v }
      return /^\\/(url|goto|aclk)/.test(u.pathname) ? href : null
    } catch { return null }
  }
  // Masaüstünde başlık h3; mobil sonuç sayfasında role=heading (hesabın mobil görünümlü tarayıcısında arama).
  for (const h of document.querySelectorAll('#search a h3, #rso a h3, #main a h3, #rso a [role=heading], #main a [role=heading]')) {
    const a = h.closest('a')
    const url = a && real(a.href)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const box = a.closest('.MjjYud, .g, [data-hveid]') || a.parentElement
    const snip = box && box.querySelector('.VwiC3b, [data-sncf], .ITZIwc, [style*="-webkit-line-clamp"]')
    const cite = box && box.querySelector('cite')
    out.push({ title: h.innerText.trim(), url, shown: cite ? cite.innerText.replace(/\\s*›\\s*/g, '/').trim() : '', snippet: snip ? snip.innerText.trim() : '' })
  }
  const answer = document.querySelector('.kp-wholepage, .xpdopen, [data-attrid="wa:/description"], .IZ6rdc')
  return { results: out, answer: answer ? answer.innerText.trim().slice(0, 3000) : '', text: out.length ? '' : (document.querySelector('#rso, #search, main') || document.body).innerText.slice(0, 6000) }
})()`

const TEXT = `(() => {
  const root = document.querySelector('article, main, [role=main]') || document.body
  return { title: document.title, text: root ? root.innerText : '' }
})()`

export const searchUrl = (query: string, lang?: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10${lang ? `&hl=${encodeURIComponent(lang)}` : ''}`

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000} s`)), ms))])

export async function google(d: Driver, query: string, lang?: string): Promise<{ results: SearchResult[]; answer: string; text: string }> {
  // Sekme arama adresiyle açıldıysa yeniden yüklenmiyor (aynı arama iki kez Google'a gitmesin).
  await settle(d, 300)
  if (!/google\.[^/]+\/search\?/.test((await d.info()).url)) await withTimeout(d.load(searchUrl(query, lang)), PAGE_TIMEOUT_MS, 'Google')
  await settle(d, 500)
  const url = (await d.info()).url
  if (/\/sorry\/|captcha/i.test(url)) throw new Error('Google asked for a CAPTCHA in this browser. Ask the user to solve it there (show_browser), then search again.')
  if (/consent\.google\./.test(url)) {
    // AB onay sayfası: "Tümünü kabul et" (form gönderimi), sonra arama yeniden.
    await d.evaluate(`(() => { const b = [...document.querySelectorAll('form button, button')].find((x) => /accept|kabul|akzeptieren|accepter|aceptar/i.test(x.innerText)); if (b) b.click() })()`)
    await settle(d, 1500)
    await withTimeout(d.load(searchUrl(query, lang)), PAGE_TIMEOUT_MS, 'Google')
    await settle(d, 500)
  }
  return d.evaluate(SERP)
}

/** Bir sonucun sayfası: metni ve yönlendirmeden sonraki gerçek adresi. Sekme bu adresle açıldıysa yeniden yüklenmiyor. */
export async function pageText(d: Driver, url: string): Promise<{ title: string; text: string; url: string }> {
  await settle(d, 300)
  if ((await d.info()).url === 'about:blank') await withTimeout(d.load(url), PAGE_TIMEOUT_MS, url)
  await settle(d, 800)
  const r = await withTimeout(d.evaluate<{ title: string; text: string }>(TEXT), 10_000, url)
  const final = (await d.info()).url || url
  const text = r.text.replace(/\n{3,}/g, '\n\n').trim()
  return { title: r.title || final, url: final, text: text.length > PAGE_CHARS ? `${text.slice(0, PAGE_CHARS)}\n…(truncated)` : text }
}
