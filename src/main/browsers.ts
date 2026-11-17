import { randomUUID } from 'node:crypto'
import { app, clipboard, dialog, Menu, session, WebContentsView, type BrowserWindow, type Input, type MenuItemConstructorOptions, type Session, type WebContents } from 'electron'
import { BROWSER_COLORS, type Bounds, type BrowserInfo, BrowserSettings, BrowsersState, type BrowserTab, type FindResult, type Shortcut, type Thumbnails } from '../shared/types.ts'
import { acceptLanguages, chromeUserAgent, DEFAULT_BROWSER_SETTINGS, normalize, parseProxy } from './browser-settings.ts'
import { isWebUrl, toUrl } from './address.ts'
import { track } from './downloads.ts'
import * as extensions from './extensions.ts'
import * as history from './history.ts'
import { dataPath, debouncedWriter, readJson, writeJson } from './store.ts'

/**
 * **Tarayıcılar.** Her tarayıcı tek bir çerez deposu (`persist:browser-<id>`: çerez, localStorage,
 * önbellek) ve altında istediği kadar sekme. Aynı tarayıcının sekmeleri oturumu paylaşıyor;
 * farklı tarayıcılar birbirini görmüyor, yani her müşteri / hesap ayrı bir tarayıcı.
 * `activeId === null` ana sayfa ya da ayarlar: web görünümü gizli.
 *
 * Chrome profilleri gibi tarayıcı kapatılabiliyor: sekmeleri (görünümleri) kapanıyor, adresleri
 * `saved`ta, çerezleri diskte kalıyor; açılınca (kullanıcı tıklayınca ya da agent kullanınca)
 * sekmeler geri yükleniyor. Son sekmeyi kapatmak tarayıcıyı kapatıyor. Gizli tarayıcı kapanınca siliniyor.
 */

/** `used`: son görüldüğü / kullanıldığı an. `asleep`: sayfası kapatılmış sekmenin gezinme geçmişi (bkz. `sleepIdle`). */
type Tab = BrowserTab & { view: WebContentsView; lastRecorded: string; pip: number; used: number; asleep: { entries: Electron.NavigationEntry[]; index: number } | null }
type SavedTab = { id: string; url: string }
type Browser = Omit<BrowserInfo, 'tabs' | 'savedTabs' | 'lastUrl'> & { tabs: Tab[]; saved: SavedTab[]; savedActive: string | null; session: Session | null; proxyAuth: { username: string; password: string } | null }
type Saved = { browsers: { id: string; name: string; note: string; color: string; settings?: BrowserSettings; tabs: SavedTab[]; activeTabId: string | null }[] }

const COLORS = BROWSER_COLORS.slice(0, -1)
const HOME_URL = 'https://www.google.com'
const THUMB_EVERY_MS = 3000
/** Bu kadar süredir bakılmayan arka plan sekmesi uyutuluyor. */
const SLEEP_AFTER_MS = 20 * 60_000
const SLEEP_CHECK_MS = 60_000
const THUMB_WIDTH = 480
/** Agent'ın arka planda çalıştığı sekmenin canlı penceresi: sohbette yeri yoksa sağ altta bu genişlikte. */
const PIP_WIDTH = 420
const AGENT_LINGER_MS = 4000
/** Canlı pencere yeni açıldığında sayfanın yeni ölçekte yerleşmesi için bekleme. */
export const AGENT_SETTLE_MS = 400

const thumbsFile = () => dataPath('thumbnails.json')

/** Kalıcı tarayıcı diskte; gizli tarayıcı yalnız bellekte (`persist:` öneki yok). */
const partition = (id: string, incognito: boolean) => (incognito ? `incognito-${id}` : `persist:browser-${id}`)

/** Menü ve izin penceresi metinleri: sistem dili Türkçeyse Türkçe, değilse İngilizce. */
const TR = {
  translate: 'Bu sayfayı çevir',
  incognito: 'Gizli', newTab: "Yeni sekme", reload: "Yeniden yükle", duplicate: "Sekmeyi çoğalt", unmute: "Sitenin sesini aç", mute: "Siteyi sessize al", close: "Kapat", closeOthers: "Diğer sekmeleri kapat", reopen: "Kapatılan sekmeyi yeniden aç", openLink: "Bağlantıyı yeni sekmede aç", copyLink: "Bağlantı adresini kopyala", openImage: "Resmi yeni sekmede aç", saveImage: "Resmi kaydet", copyImage: "Resmi kopyala", undo: "Geri al", redo: "Yinele", cut: "Kes", copy: "Kopyala", paste: "Yapıştır", selectAll: "Tümünü seç", search: "Google'da ara", back: "Geri", forward: "İleri", print: "Yazdır…", inspect: "İncele", permAllow: "İzin ver", permDeny: "İzin verme", permAsk: "şu izni istiyor", permRemember: "Karar bu tarayıcıda bu site için hatırlanır.", browser: "Tarayıcı", approvalNeeded: "Onay bekleniyor", agentDone: "Agent işi bitirdi.", agentFailed: "Agent durdu", openInApp: "Bağlantıyı uygulamada aç", openExternal: "Bağlantıyı sistem tarayıcısında aç", addWord: "Sözlüğe ekle", chatData: "Sohbet verileri", quit: "Çıkış" }
const EN: typeof TR = {
  translate: 'Translate this page',
  incognito: 'Incognito', newTab: "New tab", reload: "Reload", duplicate: "Duplicate", unmute: "Unmute site", mute: "Mute site", close: "Close", closeOthers: "Close other tabs", reopen: "Reopen closed tab", openLink: "Open link in new tab", copyLink: "Copy link address", openImage: "Open image in new tab", saveImage: "Save image", copyImage: "Copy image", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all", search: "Search Google for", back: "Back", forward: "Forward", print: "Print…", inspect: "Inspect", permAllow: "Allow", permDeny: "Block", permAsk: "wants permission for", permRemember: "The choice is remembered for this site in this browser.", browser: "Browser", approvalNeeded: "Approval needed", agentDone: "The agent finished.", agentFailed: "The agent stopped", openInApp: "Open link in the app", openExternal: "Open link in the system browser", addWord: "Add to dictionary", chatData: "Chat data", quit: "Quit" }
export const L = () => (app.getLocale().toLowerCase().startsWith('tr') ? TR : EN)

/** Chrome'un yakınlaştırma adımları. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
/** Kapatılan sekmeler (Ctrl+Shift+T) için hatırlanan en fazla adres. */
const CLOSED_MAX = 25

/** Main'in kendisinin yaptığı Chrome kısayolları; geri kalanı renderer'a gidiyor. */
type Action = Shortcut | 'reload' | 'hard-reload' | 'back' | 'forward' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'print' | 'devtools' | 'fullscreen' | 'reopen-tab'

/** Sayfanın düzgün çalışması için gereken, kullanıcıya sorulmayan izinler (Google girişi, paneller). */
const ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'storage-access', 'top-level-storage-access', 'speaker-selection'])
/** Kullanıcıya sorulanlar; geri kalan her şey (bildirim, boşta algılama, MIDI...) sessizce reddediliyor. */
const ASK = new Set(['media', 'geolocation', 'display-capture'])

export class Browsers {
  private list: Browser[] = []
  private activeId: string | null = null
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
  /** Son görünür web alanı; gizli sekmelere de veriliyor. */
  private size: Bounds = { x: 0, y: 0, width: 1280, height: 800 }
  private thumbs: Thumbnails = {}
  private save = debouncedWriter(() => dataPath('browsers.json'))
  private closed: { browserId: string; url: string }[] = []
  private lingers = new WeakMap<Tab, NodeJS.Timeout>()
  /** Sohbetin içindeki canlı önizleme yuvaları (sekme → ekrandaki yer): agent'ın sekmesi orada çiziliyor. */
  private slots = new Map<string, Bounds>()

  constructor(
    private win: BrowserWindow,
    private emit: { state(s: BrowsersState): void; thumbnails(t: Thumbnails): void; shortcut(s: Shortcut): void; find(r: FindResult): void },
  ) {
    setInterval(() => void this.captureAll(), THUMB_EVERY_MS)
    setInterval(() => this.sleepIdle(), SLEEP_CHECK_MS)
  }

  /**
   * **Açılışta hiçbir tarayıcı açılmıyor.** Hepsi ana sayfada son önizlemeleri ve adresleriyle
   * duruyor; kullanıcı tıklayınca (ya da agent kullanınca) sekmeleri yükleniyor. Böylece uygulama
   * hızlı açılıyor, siteler kendiliğinden ses, açılır pencere ya da geçiş anahtarı istemi çıkarmıyor.
   */
  restore() {
    const saved = readJson<Saved>(dataPath('browsers.json'), { browsers: [] })
    this.thumbs = readJson<Thumbnails>(thumbsFile(), {})
    for (const b of saved.browsers) {
      const browser = this.addBrowser({ id: b.id, name: b.name, note: b.note, color: b.color, incognito: false, settings: { ...DEFAULT_BROWSER_SETTINGS, ...b.settings } })
      browser.open = false
      browser.saved = b.tabs
      browser.savedActive = b.activeTabId
    }
    for (const id of Object.keys(this.thumbs)) if (!this.get(id)) delete this.thumbs[id]
    this.activate(null)
    this.emit.thumbnails(this.thumbs)
  }

  /** Şu anki önizlemeler: arayüz açılırken ilk değer (sonrası `thumbnails` olayıyla). */
  thumbnails(): Thumbnails {
    return this.thumbs
  }

  /** Son önizlemeler diske: kapalı tarayıcının kartı bir sonraki açılışta da görünsün. */
  saveThumbnails() {
    const keep: Thumbnails = {}
    for (const b of this.list) if (!b.incognito && this.thumbs[b.id]) keep[b.id] = this.thumbs[b.id]
    writeJson(thumbsFile(), keep)
  }

  state(): BrowsersState {
    return {
      activeId: this.activeId,
      browsers: this.list.map((b) => ({
        id: b.id,
        name: b.name,
        note: b.note,
        color: b.color,
        incognito: b.incognito,
        open: b.open,
        savedTabs: b.saved.length,
        lastUrl: (b.open ? b.tabs.find((t) => t.id === b.activeTabId)?.url : (b.saved.find((t) => t.id === b.savedActive) ?? b.saved[0])?.url) ?? null,
        settings: b.settings,
        activeTabId: b.activeTabId,
        tabs: b.tabs.map(({ view: _v, lastRecorded: _l, pip: _p, used: _u, asleep: _a, ...t }) => t),
      })),
    }
  }

  /* ---------------- tarayıcı ---------------- */

  create(name?: string, url = HOME_URL, show = true, incognito = false): Browser {
    const fallback = incognito ? L().incognito : `${L().browser} ${this.list.length + 1}`
    const b = this.addBrowser({ id: randomUUID(), name: name?.trim() || fallback, note: '', color: incognito ? '#6b7280' : COLORS[this.list.length % COLORS.length], incognito, settings: DEFAULT_BROWSER_SETTINGS })
    const tab = this.addTab(b, toUrl(url))
    b.activeTabId = tab.id
    if (show) this.activate(b.id)
    else this.changed()
    return b
  }

  private addBrowser(o: { id: string; name: string; note: string; color: string; incognito: boolean; settings: BrowserSettings }): Browser {
    const b: Browser = { ...o, open: true, tabs: [], saved: [], savedActive: null, activeTabId: null, session: null, proxyAuth: null }
    this.list.push(b)
    return b
  }

  /**
   * Tarayıcının oturumu, ilk gerektiğinde: açılışta hiç açılmayan tarayıcı için ağ bağlamı, çerez
   * deposu ve uzantı işlemleri oluşmuyor (çok tarayıcılı kurulumda bellek ve açılış süresi).
   */
  private ses(b: Browser): Session {
    if (b.session) return b.session
    const ses = (b.session = session.fromPartition(partition(b.id, b.incognito)))
    this.wireSession(ses)
    // Chrome'daki gibi uzantılar gizli tarayıcıda kapalı (Electron bellek içi oturuma yüklemiyor da).
    if (!b.incognito) void extensions.attach(ses)
    this.applySettings(b)
    return ses
  }

  /** Tarayıcının çerez deposu (hesap girişinin görülmesi için); tarayıcı yoksa `null`. */
  sessionOf(id: string): Session | null {
    const b = this.get(id)
    return b ? this.ses(b) : null
  }

  /** Tarayıcı ayarları (dil, proxy, user agent, yeni sekme sayfası); geçersizse açıklamalı hata. */
  configure(id: string, patch: Partial<Record<keyof BrowserSettings, unknown>>) {
    const b = this.get(id)
    if (!b) throw new Error('Browser not found.')
    b.settings = normalize(b.settings, patch)
    this.applySettings(b)
    this.changed()
    return b.settings
  }

  /** Oturuma uygular: user agent + Accept-Language, yazım denetimi dili, proxy (bağlantılar yenileniyor). Oturum yoksa oluşunca uygulanıyor. */
  private applySettings(b: Browser) {
    const ses = b.session
    if (!ses) return
    const s = b.settings
    ses.setUserAgent(s.userAgent ?? chromeUserAgent(app.userAgentFallback), s.language ? acceptLanguages(s.language) : undefined)
    if (s.language) {
      const spell = ses.availableSpellCheckerLanguages.find((l) => l === s.language || l === s.language!.split('-')[0])
      if (spell) ses.setSpellCheckerLanguages([spell])
    }
    const proxy = s.proxy ? parseProxy(s.proxy) : null
    b.proxyAuth = proxy?.username ? { username: proxy.username, password: proxy.password ?? '' } : null
    void ses
      .setProxy(proxy ? { proxyRules: proxy.rules, proxyBypassRules: '<local>' } : { mode: 'system' })
      .then(() => ses.closeAllConnections())
      .catch(() => {})
  }

  /** Sayfa çevirisi (Chrome'daki gibi Google Çeviri): sayfa çeviri vekilinden yeniden açılıyor. */
  translate(browserId: string, tabId: string | undefined, lang: string) {
    const t = this.tab(browserId, tabId)
    if (!t || !isWebUrl(t.url) || t.url === 'about:blank') throw new Error('Open a web page first.')
    const target = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang) ? lang : 'en'
    void t.view.webContents.loadURL(`https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(target)}&u=${encodeURIComponent(t.url)}`).catch(() => {})
  }

  /** Proxy denemesi: bu tarayıcının oturumuyla dış IP adresi. */
  async testConnection(id: string): Promise<string> {
    const b = this.get(id)
    if (!b) throw new Error('Browser not found.')
    const res = await this.ses(b).fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return ((await res.json()) as { ip: string }).ip
  }

  async remove(id: string) {
    const b = this.get(id)
    if (!b) return
    for (const t of [...b.tabs]) this.destroyTab(b, t)
    this.list.splice(this.list.indexOf(b), 1)
    delete this.thumbs[id]
    this.saveThumbnails()
    // Tarayıcı silinince çerezleri ve girişleri de gidiyor.
    await this.ses(b).clearData()
    if (this.activeId === id) this.activate(null)
    else this.changed()
    this.emit.thumbnails(this.thumbs)
  }

  update(id: string, patch: { name?: string; note?: string; color?: string }) {
    const b = this.get(id)
    if (!b) return
    if (typeof patch.name === 'string' && patch.name.trim()) b.name = patch.name.trim().slice(0, 80)
    if (typeof patch.note === 'string') b.note = patch.note.slice(0, 10_000)
    if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) b.color = patch.color
    this.changed()
  }

  /** Kapalı tarayıcının sekmelerini geri yükler (ekrana getirmeden). Açıksa bir şey yapmaz. */
  open(id: string): Browser | undefined {
    const b = this.get(id)
    if (!b || b.open) return b
    b.open = true
    for (const t of b.saved) this.addTab(b, isWebUrl(t.url) ? t.url : 'about:blank', t.id)
    if (!b.tabs.length) this.addTab(b, toUrl(b.settings.homeUrl ?? HOME_URL))
    b.activeTabId = b.tabs.some((t) => t.id === b.savedActive) ? b.savedActive : b.tabs[0].id
    b.saved = []
    b.savedActive = null
    this.changed()
    return b
  }

  /** Chrome'da pencereyi kapatmak gibi: çerezler ve sekme adresleri kalıyor, sayfalar kapanıyor. */
  async close(id: string) {
    const b = this.get(id)
    if (!b?.open) return
    if (b.incognito) return this.remove(id)
    // Kapanmadan son görüntü: kart kapalıyken de sayfayı göstersin.
    await this.capture(b)
    this.saveThumbnails()
    b.saved = b.tabs.map((t) => ({ id: t.id, url: t.url }))
    b.savedActive = b.activeTabId
    for (const t of [...b.tabs]) this.destroyTab(b, t)
    b.activeTabId = null
    b.open = false
    // Etkin tarayıcı kapanınca sıradaki açık tarayıcı, yoksa ana sayfa.
    if (this.activeId === id) this.activate(this.list.find((x) => x.open)?.id ?? null)
    else this.changed()
  }

  move(id: string, toIndex: number) {
    const b = this.get(id)
    if (!b) return
    this.list.splice(this.list.indexOf(b), 1)
    this.list.splice(Math.max(0, Math.min(toIndex, this.list.length)), 0, b)
    this.changed()
  }

  activate(id: string | null) {
    const prev = this.active()
    if (prev) void this.capture(prev)
    this.activeId = id && this.open(id) ? id : null
    this.show()
    this.changed()
  }

  /* ---------------- sekme ---------------- */

  openTab(browserId: string, url?: string, focus = true): Tab | undefined {
    const b = this.open(browserId)
    if (!b) return
    const tab = this.addTab(b, toUrl(url ?? b.settings.homeUrl ?? HOME_URL))
    if (focus) {
      b.activeTabId = tab.id
      this.show()
    }
    this.changed()
    return tab
  }

  private newView(b: Browser): WebContentsView {
    // Web sayfasına preload yok, Node yok: sayfa yalnız sayfa.
    const view = new WebContentsView({ webPreferences: { session: this.ses(b), sandbox: true, contextIsolation: true, nodeIntegration: false } })
    view.setBackgroundColor('#ffffff')
    view.setVisible(false)
    view.setBounds(this.size)
    this.win.contentView.addChildView(view)
    return view
  }

  private addTab(b: Browser, url: string, id: string = randomUUID()): Tab {
    const tab: Tab = { id, url, title: url, favicon: null, loading: true, canGoBack: false, canGoForward: false, agent: false, audible: false, muted: false, zoom: 1, view: this.newView(b), lastRecorded: '', pip: 0, used: Date.now(), asleep: null }
    b.tabs.push(tab)
    this.wireTab(b, tab)
    void tab.view.webContents.loadURL(url).catch(() => {})
    return tab
  }

  /** Sekmenin sayfasını (görünümünü ve işlemini) kapatır. */
  private unmount(t: Tab) {
    if (t.asleep) return
    this.win.contentView.removeChildView(t.view)
    if (!t.view.webContents.isDestroyed()) t.view.webContents.close()
  }

  /**
   * **Uyuyan sekme** (Chrome'un Bellek Tasarrufu gibi). `SLEEP_AFTER_MS` boyunca bakılmayan arka plan
   * sekmesinin sayfası kapatılıyor: işlemi ve belleği gidiyor; sekme, başlığı ve gezinme geçmişi
   * kalıyor. Görünen, agent'ın çalıştığı, ses çalan, yüklenen ya da geliştirici araçları açık sekme uyumuyor.
   */
  private sleepIdle() {
    const now = Date.now()
    const visible = this.current()
    for (const b of this.list)
      for (const t of b.tabs) {
        if (t.asleep) continue
        const wc = t.view.webContents
        if (t === visible || t.agent || t.audible || t.loading || wc.isDestroyed() || wc.isDevToolsOpened()) t.used = now
        else if (now - t.used > SLEEP_AFTER_MS) {
          const asleep = { entries: wc.navigationHistory.getAllEntries(), index: wc.navigationHistory.getActiveIndex() }
          this.unmount(t)
          t.asleep = asleep
        }
      }
  }

  /** Uyuyan sekme kullanılacak: sayfası gezinme geçmişiyle (geri/ileri) yeniden yükleniyor; yazılmış form değerleri ve kaydırma geri gelmiyor. */
  private wake(b: Browser, t: Tab) {
    if (!t.asleep) return
    const { entries, index } = t.asleep
    t.asleep = null
    t.used = Date.now()
    t.view = this.newView(b)
    this.wireTab(b, t)
    const wc = t.view.webContents
    wc.setAudioMuted(t.muted)
    void (entries.length ? wc.navigationHistory.restore({ entries, index }) : wc.loadURL(t.url)).catch(() => {})
  }

  closeTab(browserId: string, tabId: string) {
    const b = this.get(browserId)
    const t = b?.tabs.find((x) => x.id === tabId)
    if (!b || !t) return
    // Chrome gibi: son sekme pencereyi kapatıyor; tarayıcı, oturumu ve bu sekme bir sonraki açılışa kalıyor.
    if (b.tabs.length === 1) return void this.close(browserId)
    const i = b.tabs.indexOf(t)
    if (isWebUrl(t.url) && t.url !== 'about:blank') this.closed = [...this.closed, { browserId, url: t.url }].slice(-CLOSED_MAX)
    this.destroyTab(b, t)
    if (b.activeTabId === tabId) b.activeTabId = b.tabs[Math.min(i, b.tabs.length - 1)]?.id ?? null
    this.show()
    this.changed()
  }

  private destroyTab(b: Browser, t: Tab) {
    b.tabs.splice(b.tabs.indexOf(t), 1)
    this.unmount(t)
  }

  activateTab(browserId: string, tabId: string) {
    const b = this.get(browserId)
    if (!b?.tabs.some((t) => t.id === tabId)) return
    b.activeTabId = tabId
    this.show()
    this.changed()
  }

  moveTab(browserId: string, tabId: string, toIndex: number) {
    const b = this.get(browserId)
    const t = b?.tabs.find((x) => x.id === tabId)
    if (!b || !t) return
    b.tabs.splice(b.tabs.indexOf(t), 1)
    b.tabs.splice(Math.max(0, Math.min(toIndex, b.tabs.length)), 0, t)
    this.changed()
  }

  /** Ctrl+Shift+T: son kapatılan sekme, tarayıcısı hâlâ varsa onda. */
  reopenTab() {
    const last = this.closed.pop()
    if (!last) return
    const b = this.get(last.browserId) ?? this.active() ?? this.list[0]
    if (b) {
      this.openTab(b.id, last.url)
      this.activate(b.id)
    } else this.create(undefined, last.url)
  }

  duplicateTab(browserId: string, tabId: string) {
    const t = this.tab(browserId, tabId)
    if (t) return this.openTab(browserId, t.url)
  }

  closeOtherTabs(browserId: string, tabId: string) {
    for (const t of [...(this.get(browserId)?.tabs ?? [])]) if (t.id !== tabId) this.closeTab(browserId, t.id)
  }

  setMuted(browserId: string, tabId: string, muted: boolean) {
    const t = this.tab(browserId, tabId)
    if (!t) return
    t.view.webContents.setAudioMuted(muted)
    t.muted = muted
    this.changed()
  }

  /** Yakınlaştırma: `null` %100'e döner. */
  setZoom(browserId: string, tabId: string | undefined, factor: number | null) {
    const t = this.tab(browserId, tabId)
    if (!t) return
    const z = Math.min(5, Math.max(0.25, factor ?? 1))
    t.view.webContents.setZoomFactor(z)
    t.zoom = z
    this.changed()
  }

  /** Bir sonraki / önceki Chrome yakınlaştırma adımı. */
  private stepZoom(t: Tab, dir: 1 | -1) {
    const next = dir === 1 ? ZOOM_STEPS.find((z) => z > t.zoom + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < t.zoom - 0.001)
    const b = this.list.find((x) => x.tabs.includes(t))
    if (b && next) this.setZoom(b.id, t.id, next)
  }

  /** Sayfada bul (Ctrl+F); sonuç `found-in-page` ile geliyor. */
  find(text: string, forward = true) {
    const wc = this.current()?.view.webContents
    if (!wc) return
    if (!text) return wc.stopFindInPage('clearSelection')
    wc.findInPage(text, { forward, findNext: true })
  }

  stopFind() {
    this.current()?.view.webContents.stopFindInPage('keepSelection')
  }

  /** Kısayol: tarayıcı işi main'de, arayüz işi renderer'da. */
  key(action: Action) {
    const t = this.current()
    const wc = t?.view.webContents
    switch (action) {
      case 'reload':
        return wc?.reload()
      case 'hard-reload':
        return wc?.reloadIgnoringCache()
      case 'back':
        return wc?.navigationHistory.goBack()
      case 'forward':
        return wc?.navigationHistory.goForward()
      case 'zoom-in':
        return t && this.stepZoom(t, 1)
      case 'zoom-out':
        return t && this.stepZoom(t, -1)
      case 'zoom-reset':
        return t && this.activeId && this.setZoom(this.activeId, t.id, null)
      case 'print':
        return wc?.print()
      case 'devtools':
        return wc?.toggleDevTools()
      case 'fullscreen':
        return this.win.setFullScreen(!this.win.isFullScreen())
      case 'reopen-tab':
        return this.reopenTab()
      default:
        this.emit.shortcut(action)
    }
  }

  /** Sekmeye sağ tık: Chrome'un sekme menüsü. */
  tabMenu(browserId: string, tabId: string) {
    const t = this.tab(browserId, tabId)
    if (!t) return
    const l = L()
    Menu.buildFromTemplate([
      { label: l.newTab, click: () => this.openTab(browserId) },
      { label: l.reload, click: () => t.view.webContents.reload() },
      { label: l.duplicate, click: () => this.duplicateTab(browserId, tabId) },
      { label: t.muted ? l.unmute : l.mute, click: () => this.setMuted(browserId, tabId, !t.muted) },
      { type: 'separator' },
      { label: l.close, click: () => this.closeTab(browserId, tabId) },
      { label: l.closeOthers, click: () => this.closeOtherTabs(browserId, tabId) },
      { label: l.reopen, enabled: this.closed.length > 0, click: () => this.reopenTab() },
    ]).popup({ window: this.win })
  }

  /** Sayfaya sağ tık: Chrome'un içerik menüsü. */
  private contextMenu(b: Browser, t: Tab, p: Electron.ContextMenuParams) {
    const wc = t.view.webContents
    const l = L()
    const items: MenuItemConstructorOptions[] = []
    if (p.linkURL && isWebUrl(p.linkURL))
      items.push(
        { label: l.openLink, click: () => this.openTab(b.id, p.linkURL, false) },
        { label: l.copyLink, click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      )
    if (p.mediaType === 'image' && p.srcURL)
      items.push(
        { label: l.openImage, click: () => this.openTab(b.id, p.srcURL, false) },
        { label: l.saveImage, click: () => wc.downloadURL(p.srcURL) },
        { label: l.copyImage, click: () => wc.copyImageAt(p.x, p.y) },
        { type: 'separator' },
      )
    if (p.isEditable)
      items.push(
        { label: l.undo, role: 'undo', enabled: p.editFlags.canUndo },
        { label: l.cut, role: 'cut', enabled: p.editFlags.canCut },
        { label: l.copy, role: 'copy', enabled: p.editFlags.canCopy },
        { label: l.paste, role: 'paste', enabled: p.editFlags.canPaste },
        { label: l.selectAll, role: 'selectAll' },
        { type: 'separator' },
      )
    else if (p.selectionText.trim())
      items.push(
        { label: l.copy, role: 'copy' },
        { label: `${l.search}: "${p.selectionText.trim().slice(0, 30)}"`, click: () => this.openTab(b.id, `https://www.google.com/search?q=${encodeURIComponent(p.selectionText.trim())}`) },
        { type: 'separator' },
      )
    items.push(
      { label: `${l.translate} (${app.getLocale()})`, click: () => this.translate(b.id, t.id, app.getLocale()) },
      { type: 'separator' },
      { label: l.back, enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: l.forward, enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: l.reload, click: () => wc.reload() },
      { type: 'separator' },
      { label: l.print, click: () => wc.print() },
      { label: l.inspect, click: () => wc.inspectElement(p.x, p.y) },
    )
    Menu.buildFromTemplate(items).popup({ window: this.win })
  }

  /** Etkin tarayıcının etkin sekmesi; kullanıcının gezinme düğmeleri bunu kullanıyor. */
  current(): Tab | undefined {
    const b = this.active()
    return b?.tabs.find((t) => t.id === b.activeTabId)
  }

  navigate(input: string) {
    const t = this.current()
    if (t) void t.view.webContents.loadURL(toUrl(input)).catch(() => {})
  }

  /* ---------------- agent için ---------------- */

  get(id: string): Browser | undefined {
    return this.list.find((b) => b.id === id)
  }

  all() {
    return this.list
  }

  /** Sekme kimliği verilmezse tarayıcının etkin sekmesi. Uyuyorsa uyandırılıyor. */
  tab(browserId: string, tabId?: string): Tab | undefined {
    const b = this.get(browserId)
    const t = b?.tabs.find((x) => x.id === (tabId ?? b.activeTabId))
    if (b && t) this.wake(b, t)
    return t
  }

  contents(browserId: string, tabId?: string): WebContents | undefined {
    const wc = this.tab(browserId, tabId)?.view.webContents
    return wc && !wc.isDestroyed() ? wc : undefined
  }

  /**
   * Agent bir sekmede çalışırken kartta ve sekmede işaret (ve gerekirse canlı pencere). Araçlar
   * arasında işaret `AGENT_LINGER_MS` daha duruyor: her araçta canlı pencere açılıp kapanınca
   * sayfa ölçeği değişiyor ve tıklama koordinatları yeni düzene oturmadan ölçülüyordu.
   * `true` dönerse görünüm şimdi değişti; çağıran ölçmeden önce `AGENT_SETTLE_MS` beklemeli.
   */
  setAgent(browserId: string, tabId: string, on: boolean): boolean {
    const t = this.tab(browserId, tabId)
    if (!t) return false
    clearTimeout(this.lingers.get(t))
    if (!on) {
      this.lingers.set(
        t,
        setTimeout(() => {
          t.agent = false
          this.show()
          this.changed()
        }, AGENT_LINGER_MS),
      )
      return false
    }
    if (t.agent) return false
    const before = t.pip
    t.agent = true
    this.show()
    this.changed()
    return t.pip !== before
  }

  /**
   * **Sohbetin canlı önizleme yuvası.** Sohbet, agent'ın çalıştığı sekme için düşünme alanının altında bir yer
   * ayırıyor ve ekrandaki yerini bildiriyor; sekme köşedeki küçük pencere yerine orada çiziliyor. `null`: yuva
   * kalktı (sohbet kapandı, tur bitti). Dönüş: sayfanın en/boy oranı (yuva yüksekliğini ona göre ayarlıyor).
   */
  setSlot(tabId: string, b: Bounds | null): number {
    if (b && b.width > 0 && b.height > 0) this.slots.set(tabId, { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) })
    else this.slots.delete(tabId)
    this.show()
    return this.size.height / this.size.width
  }

  /** Sekmenin ekrandaki gerçek genişliği (DIP): fare koordinatı = CSS px * (bu / sayfanın innerWidth'i). */
  viewWidth(browserId: string, tabId: string) {
    return this.tab(browserId, tabId)?.view.getBounds().width ?? 0
  }

  /** Canlı pencerede sayfa masaüstü genişliğinde düzenlenip küçültülüyor; gezinme bunu sıfırladığı için yeniden uygulanıyor. */
  private emulate(t: Tab) {
    const wc = t.view.webContents
    if (wc.isDestroyed() || !t.pip) return
    const scale = t.pip / this.size.width
    wc.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: this.size.width, height: this.size.height }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 0, viewSize: { width: this.size.width, height: this.size.height }, scale })
  }

  /* ---------------- görünüm ---------------- */

  setBounds(b: Bounds) {
    this.bounds = { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(0, Math.round(b.width)), height: Math.max(0, Math.round(b.height)) }
    if (this.bounds.width > 0 && this.bounds.height > 0) this.size = this.bounds
    this.show()
  }

  private active() {
    return this.activeId ? this.get(this.activeId) : undefined
  }

  /**
   * Yalnız etkin tarayıcının etkin sekmesi ekranda. Gizli sekmeler de son görünür boyutta
   * duruyor (önizleme doğru ölçüde).
   *
   * Agent'ın çalıştığı ama kullanıcının bakmadığı sekme canlı bir pencerede (PiP): Chromium ekranda olmayan
   * görünüme tıklama iletmiyor ve onu çizmiyor. Pencere sohbetin ayırdığı yuvada (`setSlot`, düşünme alanının
   * altında); sohbet açık değilse sağ altta. Sayfa `enableDeviceEmulation` ile masaüstü genişliğinde düzenlenip
   * küçültülerek çiziliyor. Yuvası olan sekme tur boyunca görünür kalıyor (araçlar arasında da).
   */
  private show() {
    const visible = this.current()
    if (visible) this.wake(this.active()!, visible)
    let slot = 0
    for (const b of this.list)
      for (const t of b.tabs) {
        if (t.asleep) continue
        const wc = t.view.webContents
        const inChat = this.slots.get(t.id)
        if (t === visible || !(t.agent || inChat)) {
          if (t.pip) {
            t.pip = 0
            if (!wc.isDestroyed()) wc.disableDeviceEmulation()
          }
          t.view.setVisible(t === visible)
          t.view.setBounds(t === visible ? this.bounds : this.size)
          continue
        }
        let box: Bounds
        if (inChat) box = { ...inChat, height: Math.round((inChat.width * this.size.height) / this.size.width) }
        else {
          const height = Math.round((this.size.height * PIP_WIDTH) / this.size.width)
          const area = this.bounds.width ? this.bounds : this.size
          box = { x: area.x + area.width - PIP_WIDTH - 16, y: area.y + area.height - (height + 12) * ++slot, width: PIP_WIDTH, height }
        }
        t.view.setVisible(true)
        t.view.setBounds(box)
        const changed = t.pip !== box.width
        t.pip = box.width
        if (changed) this.emulate(t)
        // PiP en üstte: kullanıcının açık sekmesinin de üstünde.
        this.win.contentView.addChildView(t.view)
      }
  }

  private wireTab(b: Browser, t: Tab) {
    const wc = t.view.webContents
    const sync = () => {
      if (wc.isDestroyed()) return
      t.url = wc.getURL() || t.url
      t.title = wc.getTitle() || t.url
      t.loading = wc.isLoading()
      t.canGoBack = wc.navigationHistory.canGoBack()
      t.canGoForward = wc.navigationHistory.canGoForward()
      this.changed()
    }
    for (const ev of ['did-start-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) wc.on(ev as 'did-start-loading', sync)
    wc.on('dom-ready', () => t.pip && this.emulate(t))
    wc.on('did-stop-loading', () => {
      sync()
      if (!b.incognito && t.url !== t.lastRecorded && isWebUrl(t.url) && t.url !== 'about:blank') {
        t.lastRecorded = t.url
        history.record({ ts: Date.now(), browserId: b.id, browserName: b.name, url: t.url, title: t.title })
      }
      if (b.activeTabId === t.id) void this.capture(b)
    })
    wc.on('page-favicon-updated', (_ev, icons) => {
      t.favicon = icons[0] ?? null
      this.changed()
    })
    wc.on('render-process-gone', () => wc.reload())
    wc.on('audio-state-changed', (e) => {
      t.audible = e.audible
      this.changed()
    })
    wc.on('context-menu', (_e, p) => this.contextMenu(b, t, p))
    // Kimlik isteyen HTTP proxy: tarayıcı ayarındaki kullanıcı adı ve şifre.
    wc.on('login', (e, _details, authInfo, cb) => {
      if (!authInfo.isProxy || !b.proxyAuth) return
      e.preventDefault()
      cb(b.proxyAuth.username, b.proxyAuth.password)
    })
    // Ctrl + fare tekerleği.
    wc.on('zoom-changed', (_e, dir) => this.stepZoom(t, dir === 'in' ? 1 : -1))
    wc.on('found-in-page', (_e, r) => this.emit.find({ matches: r.matches, active: r.activeMatchOrdinal }))
    // Yeni pencere isteyen bağlantı aynı tarayıcıda (aynı oturumla) yeni sekme.
    wc.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) this.openTab(b.id, url)
      return { action: 'deny' }
    })
    wc.on('before-input-event', (ev, input) => {
      const a = shortcutOf(input)
      if (!a) return
      ev.preventDefault()
      this.key(a)
    })
  }

  /** Oturum başına bir kez: indirmeler çalışma klasörüne, izinler kullanıcıya soruluyor. */
  private wireSession(ses: Session) {
    ses.on('will-download', (_ev, item) => track(item))
    // Karar tarayıcı + site + izin başına hatırlanıyor: aynı soru bir daha sorulmuyor.
    const decided = new Map<string, boolean>()
    const asking = new Map<string, Promise<boolean>>()
    ses.setPermissionRequestHandler((wc, permission, cb, details) => {
      if (ALLOW.has(permission)) return cb(true)
      if (!ASK.has(permission)) return cb(false)
      let origin = wc.getURL()
      try {
        origin = new URL(details.requestingUrl).origin
      } catch {}
      const key = `${origin}|${permission}`
      const known = decided.get(key)
      if (known !== undefined) return cb(known)
      // Sayfa aynı izni art arda isterse tek pencere açılıyor.
      let pending = asking.get(key)
      if (!pending) {
        pending = dialog
          .showMessageBox(this.win, { type: 'question', buttons: [L().permDeny, L().permAllow], defaultId: 0, cancelId: 0, message: `${origin} ${L().permAsk}: ${permission}`, detail: L().permRemember })
          .then((r) => {
            decided.set(key, r.response === 1)
            asking.delete(key)
            return r.response === 1
          })
        asking.set(key, pending)
      }
      void pending.then(cb)
    })
  }

  private async capture(b: Browser) {
    // Uyuyan sekme önizleme için uyandırılmıyor: son önizlemesi duruyor.
    const t = b.tabs.find((x) => x.id === b.activeTabId)
    if (!t || t.asleep || t.view.webContents.isDestroyed()) return
    const img = await t.view.webContents.capturePage().catch(() => null)
    // Gizli sekme yakalama anında çiziliyor; yine boş gelirse son iyi önizleme korunuyor.
    if (!img || img.isEmpty()) return
    // JPEG: PNG'nin onda biri; önizlemelerin hepsi her değişiklikte arayüze gidiyor.
    const thumb = `data:image/jpeg;base64,${img.resize({ width: THUMB_WIDTH, quality: 'good' }).toJPEG(80).toString('base64')}`
    if (thumb === this.thumbs[b.id]) return
    this.thumbs[b.id] = thumb
    this.emit.thumbnails(this.thumbs)
  }

  /**
   * Önizlemeler yalnız ana sayfada görünüyor: canlı yakalama yalnız orada. Bir tarayıcıdayken
   * önizlemesi sayfa yüklenince ve tarayıcıdan çıkılırken alınıyor.
   */
  private async captureAll() {
    if (this.activeId || this.win.isMinimized() || !this.win.isVisible()) return
    for (const b of this.list) await this.capture(b)
  }

  private changed() {
    this.emit.state(this.state())
    this.save(() => ({
      browsers: this.list
        .filter((b) => !b.incognito)
        .map((b) => ({ id: b.id, name: b.name, note: b.note, color: b.color, settings: b.settings, activeTabId: b.open ? b.activeTabId : b.savedActive, tabs: b.open ? b.tabs.map((t) => ({ id: t.id, url: t.url })) : b.saved })),
    }))
  }
}

/** Chrome kısayolları; hem uygulama sayfasında hem web sekmelerinde. */
export function shortcutOf(input: Input): Action | null {
  if (input.type !== 'keyDown') return null
  const key = input.key.toLowerCase()
  if (key === 'f5') return input.control || input.shift ? 'hard-reload' : 'reload'
  if (key === 'f11') return 'fullscreen'
  if (key === 'f12') return 'devtools'
  if (input.alt && !input.control && key === 'arrowleft') return 'back'
  if (input.alt && !input.control && key === 'arrowright') return 'forward'
  if (!(input.control || input.meta)) return null
  if (key === 't') return input.shift ? 'reopen-tab' : 'new-tab'
  if (key === 'n') return input.shift ? 'new-browser' : 'new-chat'
  if (key === 'w') return 'close-tab'
  if (key === 'l') return 'focus-address'
  if (key === 'tab') return input.shift ? 'prev-tab' : 'next-tab'
  if (key === 'r') return input.shift ? 'hard-reload' : 'reload'
  if (key === 'f') return 'find'
  if (key === 'd') return 'bookmark'
  if (key === 'h') return 'history'
  if (key === 'j') return 'downloads'
  if (key === 'p') return 'print'
  if (key === '+' || key === '=') return 'zoom-in'
  if (key === '-') return 'zoom-out'
  if (key === '0') return 'zoom-reset'
  if (input.shift && key === 'i') return 'devtools'
  if (/^[1-9]$/.test(key)) return { tab: Number(key) }
  return null
}
