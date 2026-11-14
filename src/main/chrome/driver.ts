import type { ChromeTab } from '../../shared/types.ts'
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
  }
}
