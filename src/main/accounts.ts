import { createHash, randomUUID } from 'node:crypto'
import type { ConnectionsState, Layout, Overview, SocialAccount } from '../shared/types.ts'
import { PLATFORMS, cleanHandle, defaultLayout, isPlatform, platformOf, type PlatformId } from '../shared/platforms.ts'
import { server, ServerError } from './auth.ts'
import type { Browsers } from './browsers.ts'
import type { ChromeBridge } from './chrome/bridge.ts'
import { syncContents } from './contents.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/**
 * **Sosyal medya hesapları.** Liste sunucudan (`/api/v1/worker/accounts`): resmî API ile bağlananlar,
 * başka cihazlardakiler ve **bu cihazdakiler**. Bu cihazdaki hesabın oturumu ya uygulamanın bir
 * tarayıcısında (kendi çerez deposu) ya da eklentiyle bağlı bir Chrome profilinde; oturum cihazdan
 * çıkmıyor, sunucuda yalnız hesabın adı ve bu cihaza (Worker) bağlı olduğu yazıyor.
 *
 * Gruplar sunucuda (`SocialAccount.group`): kullanıcı hesaplarını müşteri/marka adına göre topluyor,
 * bütün cihazlarında aynı görünüyor, agent de görüyor.
 */

/** Bu cihazda oturumu olan hesap. `browserId`: uygulama tarayıcısı; `chromeId`: Chrome profili. */
type Local = { id: string; remoteId: string; platform: PlatformId; handle: string; browserId?: string; chromeId?: string }
type Remote = { id: string; platform: string; handle: string; name: string | null; status: SocialAccount['status']; via: 'api' | 'worker'; group: string }
type Saved = { locals: Local[]; desktopDefaults?: boolean }

const LOGIN_WAIT_MS = 10 * 60_000
const file = () => dataPath('accounts.json')

let store: Saved | null = null
const saved = (): Saved => {
  if (store) return store
  const raw = readJson<Partial<Saved>>(file(), {})
  return (store = { locals: raw.locals ?? [], desktopDefaults: raw.desktopDefaults })
}
const persist = () => writeJson(file(), saved())

let browsers: Browsers
let chrome: ChromeBridge
let emit: (s: ConnectionsState) => void = () => {}
let remote: Remote[] = []
let overview: Overview | null = null
let error: string | null = null
let syncedAt = 0
/** Giriş bekleyen "hesap ekle" akışları: tarayıcı kimliği → iptal. */
const waiting = new Map<string, () => void>()

export function initAccounts(b: Browsers, c: ChromeBridge, onChange: (s: ConnectionsState) => void) {
  browsers = b
  chrome = c
  emit = onChange
  // 1.2.0 bütün hesap tarayıcılarını mobile çevirmişti: yükleme ekranı masaüstünde olan platformlar (YouTube, TikTok) bir kez masaüstüne alınıyor.
  if (!saved().desktopDefaults) {
    for (const l of saved().locals) if (l.browserId && defaultLayout(l.platform) === 'desktop' && browsers.get(l.browserId)) browsers.configure(l.browserId, { layout: 'desktop', width: null })
    saved().desktopDefaults = true
    persist()
  }
}

/** Agent'ın hesabı kullanacağı tarayıcı kimliği (`chrome:<id>` ya da uygulama tarayıcısı). */
const agentBrowser = (l: Local) => (l.chromeId ? `chrome:${l.chromeId}` : (l.browserId ?? null))

export function connectionsState(): ConnectionsState {
  const { locals } = saved()
  const workerOf = new Map<string, string>()
  for (const w of overview?.workers ?? []) for (const a of w.accounts) workerOf.set(a.id, w.name)
  const accounts: SocialAccount[] = remote.map((a) => {
    const l = locals.find((x) => x.id === a.id)
    return { id: a.id, platform: a.platform, handle: a.handle, name: a.name, status: a.status, via: a.via, here: Boolean(l), where: l ? (l.chromeId ? 'chrome' : 'app') : null, layout: (l?.browserId && browsers.get(l.browserId)?.settings.layout) || null, browserId: l ? agentBrowser(l) : null, group: a.group ?? '', worker: workerOf.get(a.id) ?? null }
  })
  return { accounts, overview, error, syncedAt }
}

const changed = () => emit(connectionsState())

export const localAccounts = () => saved().locals
export const lastSync = () => syncedAt

/** Hesaplar ve akışlar sunucuyla eşitlenir. Sitedeki liste tek kaynak: sitede kaldırılan hesabın cihazdaki oturumu da siliniyor. */
export async function syncAccounts() {
  try {
    const [{ accounts }, ov] = await Promise.all([server<{ accounts: Remote[] }>('/api/v1/worker/accounts'), server<Overview>('/api/v1/worker/overview')])
    remote = accounts
    // Akışlar da eşitleniyor: içeriği bu cihazda duran akışların klasörleri kurulur; ilk seferde örnek akış açılır.
    overview = (await syncContents(ov)) ? await server<Overview>('/api/v1/worker/overview') : ov
    if (overview !== ov) await syncContents(overview)
    error = null
    syncedAt = Date.now()
    for (const gone of saved().locals.filter((l) => !accounts.some((a) => a.id === l.id))) await forget(gone)
  } catch (e) {
    error = e instanceof ServerError ? e.code : 'network'
    if (e instanceof ServerError && e.status === 401) reset()
  }
  changed()
}

/** Çıkışta: sunucudan gelen her şey ekrandan kalkıyor; cihazdaki oturumlar duruyor. */
export function reset() {
  remote = []
  overview = null
  syncedAt = 0
  changed()
}

async function forget(l: Local) {
  const s = saved()
  s.locals = s.locals.filter((x) => x.id !== l.id)
  persist()
  // Hesabın tarayıcısı onun için açılmıştı: çerezleriyle birlikte gidiyor. Chrome'a dokunulmuyor.
  if (l.browserId && browsers.get(l.browserId)) await browsers.remove(l.browserId)
}

const hasCookie = async (browserId: string, platform: PlatformId) => {
  const ses = browsers.sessionOf(browserId)
  const { url, name } = PLATFORMS[platform].cookie
  return Boolean(ses && (await ses.cookies.get({ url, name }).catch(() => [])).length)
}

/** Chrome'da platforma giriş yapılmış mı; eski eklenti soruyu bilmiyorsa `null` (bilinmiyor). */
const chromeSignedIn = (chromeId: string, platform: PlatformId) =>
  chrome.call<boolean>(chromeId, 'cookies.has', PLATFORMS[platform].cookie).then(
    (v) => v === true,
    () => null,
  )

/** Hesabın oturumu şu an kullanılabilir mi; değilse sebebi. */
export async function sessionProblem(l: Local): Promise<{ expired: boolean; error: string } | null> {
  if (l.chromeId) {
    const c = chrome.get(l.chromeId)
    if (c?.status !== 'connected') return { expired: false, error: `Chrome "${c?.name ?? 'Chrome'}" is not connected (Chrome is closed or the Share97 extension is off)` }
    if (!c.agent) return { expired: false, error: `Agent access is turned off for Chrome "${c.name}"` }
    return (await chromeSignedIn(l.chromeId, l.platform)) === false ? { expired: true, error: `@${l.handle}: sign-in required in Chrome "${c.name}"` } : null
  }
  if (!l.browserId || !browsers.get(l.browserId)) return { expired: true, error: `@${l.handle}: sign-in required` }
  return (await hasCookie(l.browserId, l.platform)) ? null : { expired: true, error: `@${l.handle}: sign-in required` }
}

const register = (l: Omit<Local, 'id'>) => server<{ id: string; handle: string }>('/api/v1/worker/accounts', { body: { platform: l.platform, handle: l.handle, remoteId: l.remoteId } })

/** Oturum çerezi görünene kadar bekler; tarayıcı kapatılır ya da süre dolarsa `false`. */
function waitForLogin(browserId: string, platform: PlatformId) {
  return new Promise<boolean>((resolve) => {
    const started = Date.now()
    const done = (ok: boolean) => {
      clearInterval(timer)
      waiting.delete(browserId)
      resolve(ok)
    }
    const timer = setInterval(async () => {
      if (!browsers.get(browserId) || Date.now() - started > LOGIN_WAIT_MS) return done(false)
      if (await hasCookie(browserId, platform)) done(true)
    }, 1500)
    waiting.set(browserId, () => done(false))
  })
}

/**
 * **Hesap ekle.** Uygulamada: hesaba özel bir tarayıcı açılır, kullanıcı platformun kendi ekranında
 * giriş yapar (parola uygulamaya da agent'a da görünmez); oturum çerezi görülünce hesap sunucuya
 * yazılır. Chrome'da: kullanıcı o Chrome'da zaten girişli; platform yeni sekmede açılır ve hesap yazılır.
 */
export async function addAccount(platformRaw: string, handleRaw: string, chromeId?: string, layout: Layout = 'mobile'): Promise<{ ok: boolean; error?: string }> {
  const handle = cleanHandle(handleRaw)
  if (!isPlatform(platformRaw) || !handle) return { ok: false, error: 'bad-argument' }
  const platform = platformRaw
  const p = PLATFORMS[platform]
  try {
    if (chromeId) {
      const c = chrome.get(chromeId)
      if (c?.status !== 'connected') return { ok: false, error: 'chrome-offline' }
      // Giriş yapılmamışsa hesap yazılmıyor: platform o Chrome'da açılıyor, kullanıcı giriş yapıp yeniden deniyor.
      if ((await chromeSignedIn(chromeId, platform)) === false) {
        void chrome.call(chromeId, 'tabs.create', { url: p.login }, 45_000).catch(() => {})
        return { ok: false, error: 'chrome-signed-out' }
      }
      const base = { remoteId: `chrome-${createHash('sha256').update(`${chromeId}:${platform}:${handle.toLowerCase()}`).digest('hex').slice(0, 48)}`, platform, handle, chromeId }
      const row = await register(base)
      upsertLocal({ ...base, id: row.id })
      void chrome.call(chromeId, 'tabs.create', { url: p.home }, 45_000).catch(() => {})
    } else {
      const b = browsers.create(`${p.label} · @${handle}`, p.login, true)
      browsers.update(b.id, { note: `Share97 account: @${handle} on ${p.label}.`, color: p.color })
      // Giriş ekranı da seçilen görünümde açılsın (varsayılan mobil).
      browsers.configure(b.id, { layout })
      if (!(await waitForLogin(b.id, platform))) {
        if (browsers.get(b.id)) await browsers.remove(b.id)
        return { ok: false, error: 'login-cancelled' }
      }
      const base = { remoteId: randomUUID(), platform, handle, browserId: b.id }
      const row = await register(base).catch(async (e) => {
        await browsers.remove(b.id)
        throw e
      })
      upsertLocal({ ...base, id: row.id })
    }
    await syncAccounts()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ServerError ? e.code : (e as Error).message }
  }
}

function upsertLocal(l: Local) {
  const s = saved()
  s.locals = [...s.locals.filter((x) => x.id !== l.id), l]
  persist()
}

/** İş başlamadan hesabın uygulama tarayıcısı sekmeleriyle açılır (ekrana getirilmeden); Chrome zaten açık. */
/** İş için hesabın tarayıcısını açar; dönüş: bu çağrı açtıysa tarayıcının kimliği (iş bitince `closeAfterJob`). */
export function openForJob(l: Local): string | null {
  if (!l.browserId || browsers.get(l.browserId)?.open !== false) return null
  browsers.open(l.browserId)
  return l.browserId
}
/** İş için açılan tarayıcı kapanır (oturum ve sekme adresi kalır): cihazda boşta sayfa işlemi birikmesin. */
export const closeAfterJob = (browserId: string) => void browsers.close(browserId)

/** Bekleyen "hesap ekle" girişini iptal eder (tarayıcı kapanır). */
export function cancelAdd() {
  for (const stop of [...waiting.values()]) stop()
}

/** Oturumu düşen hesap: tarayıcısı giriş ekranında açılır; giriş görülünce sunucuda yeniden `connected`. */
export async function relogin(id: string): Promise<{ ok: boolean; error?: string }> {
  const l = saved().locals.find((x) => x.id === id)
  if (!l) return { ok: false, error: 'not-here' }
  const p = PLATFORMS[l.platform]
  try {
    if (l.chromeId) {
      if ((await chromeSignedIn(l.chromeId, l.platform)) === false) {
        await chrome.call(l.chromeId, 'tabs.create', { url: p.login }, 45_000)
        return { ok: false, error: 'chrome-signed-out' }
      }
    }
    else {
      if (!l.browserId || !browsers.get(l.browserId)) {
        l.browserId = browsers.create(`${p.label} · @${l.handle}`, p.login, true).id
        persist()
      } else {
        browsers.openTab(l.browserId, p.login)
        browsers.activate(l.browserId)
      }
      if (!(await waitForLogin(l.browserId, l.platform))) return { ok: false, error: 'login-cancelled' }
    }
    await register(l)
    await syncAccounts()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ServerError ? e.code : (e as Error).message }
  }
}

/** Hesabı kaldırır: sunucudaki satır (yalnız Worker hesabı) ve cihazdaki oturum. */
export async function removeAccount(id: string) {
  await server(`/api/v1/worker/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  await syncAccounts()
}

/** Hesabın tarayıcısını öne getirir (uygulama tarayıcısı ya da Chrome'da profil sayfası). */
export async function openAccount(id: string) {
  const l = saved().locals.find((x) => x.id === id)
  if (!l) return
  if (l.chromeId) await chrome.call(l.chromeId, 'tabs.create', { url: PLATFORMS[l.platform].home }, 45_000)
  else if (l.browserId) browsers.activate(l.browserId)
}

/** Hesabın uygulama tarayıcısının görünümü: varsayılanı ve açık sekmeleri (bkz. `Browsers.configure`). */
export async function setLayout(id: string, layout: Layout) {
  const l = saved().locals.find((x) => x.id === id)
  if (!l?.browserId || !browsers.get(l.browserId)) throw new Error('This account has no app browser on this device.')
  browsers.configure(l.browserId, { layout, width: null })
  changed()
}

export async function setGroup(id: string, group: string) {
  await server('/api/v1/worker/accounts', { method: 'PATCH', body: { id, group } })
  await syncAccounts()
}

/** Agent'ın görev metnine giren satır: hesap ve onu taşıyan tarayıcı. */
export const accountLine = (l: Local) => {
  const group = remote.find((a) => a.id === l.id)?.group
  return `- @${l.handle} (${platformOf(l.platform)?.label ?? l.platform}): browser_id ${agentBrowser(l)}${group ? `, group "${group}"` : ''}`
}

/**
 * Sohbette işaretlenen hesaplar: modele giden not (hangi hesap, hangi tarayıcı) ve sohbette görünen rozetler.
 * Yalnız bu cihazda oturumu olan hesaplar; hiçbiri yoksa `undefined`.
 */
export function accountsContext(ids: string[]) {
  const picked = saved().locals.filter((l) => ids.includes(l.id) && agentBrowser(l))
  if (!picked.length) return undefined
  return {
    note: `The user selected these social accounts for this message. Do the work on ${picked.length > 1 ? 'every one of them, one after the other' : 'this account'}, each only in its own browser (browser_id below, already signed in):\n${picked.map(accountLine).join('\n')}`,
    accounts: picked.map((l) => ({ platform: l.platform, handle: l.handle })),
  }
}

/** Sistem istemindeki "Social accounts" bölümü: bu cihazdaki hesaplar. */
export const accountsNote = () => saved().locals.filter((l) => agentBrowser(l)).map(accountLine).join('\n')

export { agentBrowser }
export type { Local as LocalAccount }
