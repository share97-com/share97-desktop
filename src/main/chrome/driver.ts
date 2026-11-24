import { open, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ChromeTab } from '../../shared/types.ts'
import { mimeOf } from '../paths.ts'
import { MAX_FRAMES, type Driver, type Frame } from '../agent/page.ts'
import type { ChromeBridge } from './bridge.ts'

/**
 * **Gerçek Chrome sekmesinin sürücüsü.** Agent'ın sayfa araçları (`agent/page.ts`) uygulamanın
 * sekmesinde neyse burada da o: betikler ve girdi olayları Chrome DevTools Protocol ile, eklentideki
 * `chrome.debugger` üzerinden gidiyor. Sekme yönetimi (`tabs.*`) eklentinin Chrome API'leriyle.
 *
 * iframe'ler: `Page.getFrameTree`teki her çerçeve için ayrı bir "isolated world" bağlamı açılıyor;
 * `data-s97-ref` DOM özniteliği olduğu için sayfanın kendi dünyasında da görünüyor. Başka süreçteki
 * (site dışı, OOPIF) çerçeveler bu ağaçta yok: onların içi okunmuyor.
 */

type Evaluated = { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
type FrameTree = { frame: { id: string; url: string }; childFrames?: FrameTree[] }

export function chromeDriver(bridge: ChromeBridge, chromeId: string, tabId: number): Driver {
  const call = <T>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number) => bridge.call<T>(chromeId, method, { tabId, ...params }, timeoutMs)
  const cdp = <T>(method: string, params: Record<string, unknown> = {}) => call<T>('cdp', { method, params })
  const evaluate = async <T>(expression: string, contextId?: number): Promise<T> => {
    const r = await cdp<Evaluated>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId && { contextId }) })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'Script error')
    return r.result?.value as T
  }
  const tab = () => call<ChromeTab>('tabs.get')

  return {
    key: `${chromeId}:${tabId}`,
    evaluate,
    frames: async () => {
      const { frameTree } = await cdp<{ frameTree: FrameTree }>('Page.getFrameTree')
      const flat: FrameTree['frame'][] = []
      const walk = (t: FrameTree) => {
        for (const c of t.childFrames ?? []) {
          flat.push(c.frame)
          walk(c)
        }
      }
      walk(frameTree)
      const out: Frame[] = []
      for (const f of flat.slice(0, MAX_FRAMES)) {
        const world = await cdp<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: f.id, worldName: 'share97' }).catch(() => null)
        if (world) out.push({ url: f.url, evaluate: (e) => evaluate(e, world.executionContextId) })
      }
      return out
    },
    cdp,
    info: async () => {
      const t = await tab()
      return { url: t.url, title: t.title, loading: t.loading }
    },
    load: async (url) => void (await call('tabs.navigate', { url }, 45_000)),
    go: async (d) => void (await call(d === 'back' ? 'tabs.back' : 'tabs.forward', {}, 45_000)),
    reload: async (hard) => void (await call('tabs.reload', { hard }, 45_000)),
    // Görünür alan, en fazla 1280 px genişliğe ölçeklenmiş (uygulama sekmesindeki gibi).
    screenshot: async () => {
      const { innerWidth: width, innerHeight: height } = await evaluate<{ innerWidth: number; innerHeight: number }>('({ innerWidth, innerHeight })')
      const clip = { x: 0, y: 0, width, height, scale: Math.min(1, 1280 / Math.max(1, width)) }
      const { data } = await cdp<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 70, fromSurface: true, clip })
      return `data:image/jpeg;base64,${data}`
    },
    // Efekt yalnız görsel: eski eklentide yöntem yoksa iş durmasın.
    scanEffect: async (on, point) => void (await call('effect.scan', { on, point }).catch(() => {})),
    pdf: async () => {
      const { data } = await cdp<{ data: string }>('Page.printToPDF', { printBackground: true })
      return new Uint8Array(Buffer.from(data, 'base64'))
    },
    setFiles: async (objectId, files) => {
      const on = (functionDeclaration: string, args: unknown[] = []) => cdp('Runtime.callFunctionOn', { objectId, functionDeclaration, arguments: args.map((value) => ({ value })), awaitPromise: true })
      await on(UPLOAD_START)
      for (const path of files) {
        const { size, mtimeMs } = await stat(path)
        const fh = await open(path, 'r')
        try {
          const buf = Buffer.alloc(Math.min(CHUNK, Math.max(1, size)))
          for (let pos = 0; ; ) {
            const { bytesRead } = await fh.read(buf, 0, buf.length, pos)
            pos += bytesRead
            const last = pos >= size || bytesRead === 0
            await on(UPLOAD_CHUNK, [buf.subarray(0, bytesRead).toString('base64'), last, basename(path), mimeOf(path), Math.round(mtimeMs)])
            if (last) break
          }
        } finally {
          await fh.close()
        }
      }
      await on(UPLOAD_END)
    },
  }
}

/**
 * **Chrome'da dosya yükleme bayt olarak.** `DOM.setFileInputFiles` eklentiden yalnız "Dosya URL'lerine erişim" açıkken
 * çalışıyor; onun yerine dosyalar parça parça sayfaya gönderilip `File` yapılıyor ve `DataTransfer` ile alana konuyor.
 * İzin gerekmiyor, boyut sınırı yok (parça 4 MB: köprünün mesaj sınırının çok altında). Parçalar alanın kendisinde
 * (`Symbol.for`) toplanıyor, bitince siliniyor.
 */
const CHUNK = 4 * 1024 * 1024
const KEY = `Symbol.for('share97.upload')`
const UPLOAD_START = `function () { this[${KEY}] = { files: [], parts: [] } }`
const UPLOAD_CHUNK = `function (b64, last, name, type, lastModified) {
  const s = this[${KEY}]
  let bytes
  if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(b64)
  else { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) }
  s.parts.push(bytes)
  if (last) { s.files.push(new File(s.parts, name, { type, lastModified })); s.parts = [] }
}`
const UPLOAD_END = `function () {
  const s = this[${KEY}]
  delete this[${KEY}]
  const dt = new DataTransfer()
  for (const f of s.files) dt.items.add(f)
  this.files = dt.files
  this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
}`
