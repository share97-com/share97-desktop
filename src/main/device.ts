import type { ActivityEntry } from '../shared/types.ts'
import { lastSync, localAccounts, syncAccounts } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { autoStep } from './auto.ts'
import { apiKey, server, ServerError } from './auth.ts'
import { initRunner, runNow, runnerBusy, schedule } from './runner.ts'

/**
 * **Bu kurulum bir Worker.** Akışları sunucu değil bu uygulama çalıştırır (bkz. `runner.ts`): `POLL_MS`de bir
 * hesaplar ve akışlar sunucuyla eşitlenir, cihaz canlı işaretlenir, siteden istenen "Şimdi çalıştır"lar alınır
 * ve saati gelen akışlar başlatılır. Sonuçlar sunucuya çalışma kaydı olarak yazılır.
 *
 * Agent işleri (akışın hesap adımları, otomatik paylaşım) **sırayla** koşar: aynı anda iki agent birbirinin
 * sayfasını bozmasın.
 */

const POLL_MS = 15_000
const SYNC_MS = 60_000

let agent: Agent
let emit: (a: ActivityEntry[]) => void = () => {}
let polling = false
let autoBusy = false
let running = 0
const activity: ActivityEntry[] = []

export const deviceActivity = () => activity
/** Sırada ya da çalışan iş var mı (güncelleme beklesin, tepsi durumu). */
export const deviceBusy = () => running > 0 || runnerBusy()

export function log(text: string, tone: ActivityEntry['tone'] = 'info', chatId?: string) {
  activity.unshift({ at: Date.now(), text: text.slice(0, 500), tone, chatId })
  activity.length = Math.min(activity.length, 100)
  emit(activity)
}

let chain: Promise<unknown> = Promise.resolve()
/** Agent işlerinin tek sırası. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  running++
  const next = chain.then(fn, fn).finally(() => running--)
  chain = next.catch(() => {})
  return next
}

async function tick() {
  if (polling || !apiKey()) return
  polling = true
  try {
    if (Date.now() - lastSync() > SYNC_MS) await syncAccounts()
    const { run } = await server<{ run?: string[] }>('/api/v1/worker/poll', { body: { accountIds: localAccounts().map((l) => l.id) } })
    // Siteden "Şimdi çalıştır": akışın güncel hâliyle çalışsın diye önce eşitlenir.
    if (run?.length) {
      await syncAccounts()
      for (const id of run) void runNow(id).catch((e) => log((e as Error).message, 'error'))
    }
    schedule()
    // Beklenmiyor: paylaşım dakikalarca sürer; yoklama (cihazın canlılığı, "Şimdi çalıştır", zamanlama) onu beklemesin.
    if (!autoBusy) {
      autoBusy = true
      void autoStep(agent, exclusive)
        .then((auto) => auto && log(auto.text, auto.ok ? 'ok' : 'error', auto.chatId), (e) => console.error('[auto]', (e as Error).message))
        .finally(() => (autoBusy = false))
    }
  } catch (e) {
    // 401'de `server` anahtarı siliyor ve uygulama girişe dönüyor; diğer hatalar bir sonraki yoklamada yeniden deneniyor.
    if (!(e instanceof ServerError && e.status === 401)) console.error('[device]', (e as Error).message)
  } finally {
    polling = false
  }
}

export function startDevice(a: Agent, onActivity: (list: ActivityEntry[]) => void, show: () => void, openChat: (chatId: string, force: boolean) => void) {
  agent = a
  emit = onActivity
  initRunner({ agent: a, exclusive, log, showApp: show, openChat })
  void tick()
  setInterval(() => void tick(), POLL_MS)
}

/** Giriş yapılınca beklemeden ilk eşitleme. */
export const pollNow = () => void tick()
