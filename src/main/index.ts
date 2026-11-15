import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, net, powerSaveBlocker, protocol, screen, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import type { Bounds, ModelCategory } from '../shared/types.ts'
import * as accounts from './accounts.ts'
import { Agent } from './agent/index.ts'
import { powerState, setPower } from './power.ts'
import { deviceActivity, deviceBusy, pollNow, startDevice } from './device.ts'
import { models } from './gateway.ts'
import { toUrl } from './address.ts'
import { appContextMenu } from './app-menu.ts'
import { attention } from './attention.ts'
import * as auth from './auth.ts'
import * as backup from './backup.ts'
import * as bookmarks from './bookmarks.ts'
import * as chrome from './chrome/index.ts'
import { createLocalWorkflow, generateContents, listContents, openContents } from './contents.ts'
import * as downloads from './downloads.ts'
import * as extensions from './extensions.ts'
import * as passwords from './passwords.ts'
import { Browsers, L, shortcutOf } from './browsers.ts'
import * as history from './history.ts'
import { onSettingsChange, settings, update as updateSettings } from './settings.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import { checkForUpdates, installUpdate, onUpdate, startUpdater } from './updater.ts'
import * as workers from './workers.ts'
import * as ws from './workspace.ts'

/** Pencere çerçevesi: üst şerit renderer'da, sistem düğmeleri overlay. */
const TITLEBAR_HEIGHT = 40

/** Çalışma klasöründeki görsel/ses/video arayüzde `share97-file://local/<yol>` ile. */
protocol.registerSchemesAsPrivileged([{ scheme: 'share97-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

/** Share97 teması (bkz. `renderer/src/tokens.css`): gece masası koyu, gün masası açık. */
const overlay = () =>
  nativeTheme.shouldUseDarkColors ? { color: '#11161e', symbolColor: '#f1f2f4', height: TITLEBAR_HEIGHT } : { color: '#f1f2f4', symbolColor: '#161c27', height: TITLEBAR_HEIGHT }

// Arka planda (pencere gizli ya da örtülü) çalışırken zamanlayıcılar ve agent'ın sayfaları yavaşlamasın.
for (const flag of ['disable-renderer-backgrounding', 'disable-backgrounding-occluded-windows', 'disable-background-timer-throttling']) app.commandLine.appendSwitch(flag)

const ICON = join(import.meta.dirname, '../../resources/icon.png')
let win: BrowserWindow | null = null
let site: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let awake: number | null = null

/** Pencerenin son boyutu, konumu ve büyütülmüş olup olmadığı; ekran değiştiyse varsayılan. */
type WindowState = { x: number; y: number; width: number; height: number; maximized: boolean }
const windowFile = () => dataPath('window.json')
function savedWindow(): Partial<WindowState> {
  const s = readJson<WindowState | null>(windowFile(), null)
  if (!s || ![s.x, s.y, s.width, s.height].every(Number.isFinite)) return {}
  // Kayıtlı alanın bir kısmı hâlâ bir ekranda görünüyorsa oraya, yoksa (ekran söküldü) ortaya.
  const visible = screen.getAllDisplays().some(({ workArea: a }) => s.x < a.x + a.width - 100 && s.x + s.width > a.x + 100 && s.y < a.y + a.height - 50 && s.y + 40 > a.y)
  return visible ? s : { width: s.width, height: s.height, maximized: s.maximized }
}
let browsers: Browsers | null = null
let agent: Agent | null = null

function createWindow() {
  const last = savedWindow()
  win = new BrowserWindow({
    width: last.width ?? 1440,
    height: last.height ?? 920,
    ...(last.x !== undefined && { x: last.x, y: last.y }),
    minWidth: 900,
    minHeight: 560,
    title: 'Share97 Desktop',
    icon: ICON,
    backgroundColor: overlay().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: overlay(),
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const w = win
  w.once('ready-to-show', () => {
    if (last.maximized) w.maximize()
    // Bilgisayar açılışında gizli başlar (`--hidden`): Worker tepside çalışır.
    if (!process.argv.includes('--hidden')) w.show()
  })
  w.on('close', (e) => {
    writeJson(windowFile(), { ...w.getNormalBounds(), maximized: w.isMaximized() })
    // Arka planda çalışma açıkken kapatmak gizliyor: zamanlanmış işler ve sunucu işleri sürüyor. Çıkış tepsiden.
    if (!quitting && settings().background) {
      e.preventDefault()
      w.hide()
    }
  })
  const retheme = () => {
    if (w.isDestroyed()) return
    w.setTitleBarOverlay(overlay())
    w.setBackgroundColor(overlay().color)
  }
  nativeTheme.on('updated', retheme)
  w.on('closed', () => nativeTheme.off('updated', retheme))
  // Uygulama arayüzü kendi sayfasından başka yere gitmiyor; dış bağlantılar sistem tarayıcısında.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  // Sağ tık: kopyala, yapıştır, bağlantı ve yazım önerileri (sohbet ve bütün ekranlar).
  // Sohbet alanında ayrıca "Sohbet verileri": o sohbette toplanan her şey.
  w.webContents.on('context-menu', (_e, p) => browsers && void appContextMenu(w, browsers, p, { count: (id) => agent?.chat(id)?.dataCount ?? 0, open: (id) => send('agent:showData', id) }))

  const send = (channel: string, payload?: unknown) => !w.isDestroyed() && w.webContents.send(channel, payload)
  browsers = new Browsers(w, {
    state: (s) => send('browsers:state', s),
    thumbnails: (t) => send('browsers:thumbnails', t),
    shortcut: (s) => send('browsers:shortcut', s),
    find: (r) => send('browsers:find', r),
  })
  bookmarks.onBookmarksChange((b) => send('bookmarks:changed', b))
  downloads.onDownloadsChange((d) => send('downloads:changed', d))
  extensions.onExtensionsChange((l) => send('extensions:changed', l))
  passwords.onLoginsChange((l) => send('passwords:changed', l))
  chrome.onChromeChange((s) => send('chrome:state', s))
  const notice = attention(w, {
    homeVisible: () => browsers?.state().activeId === null,
    onOpen: (chatId) => {
      browsers?.activate(null)
      send('app:openChat', chatId)
    },
  })
  accounts.initAccounts(browsers, chrome.bridge, (s) => send('connections:state', s))
  agent = new Agent(browsers, chrome.bridge, {
    chat: (c) => {
      send('agent:chat', c)
      notice(c)
    },
    chats: (l) => send('agent:chats', l),
  })
  startDevice(agent, (list) => send('workers:activity', list))
  workers.startWorkers(agent, (defs) => send('workers:changed', defs))
  ws.onFilesChange(() => send('files:changed'))
  onSettingsChange((s) => {
    nativeTheme.themeSource = s.theme
    applyBackground()
    send('settings:changed', s)
  })
  onUpdate((s) => send('app:update', s))
  w.webContents.on('before-input-event', (e, input) => {
    const a = shortcutOf(input)
    if (!a) return
    e.preventDefault()
    browsers?.key(a)
  })
  auth.onAuthChange((s) => {
    send('auth:state', s)
    if (s.status === 'signed-out') {
      accounts.reset()
      if (site && !site.isDestroyed()) site.destroy()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  w.webContents.once('did-finish-load', () => browsers?.restore())
}

function showWindow() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

const quit = () => {
  quitting = true
  app.quit()
}

/**
 * Arka plan ayarları: tepsi simgesi, açılışta başlama ve uygulama açıkken uykunun engellenmesi
 * (zamanlanmış işler kaçmasın). `background` kapalıyken pencereyi kapatmak uygulamadan çıkar.
 */
function applyBackground() {
  const { background, autostart } = settings()
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: autostart, args: ['--hidden'] })
  if (background && awake === null) awake = powerSaveBlocker.start('prevent-app-suspension')
  if (!background && awake !== null) {
    powerSaveBlocker.stop(awake)
    awake = null
  }
  if (background && !tray) {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }))
    tray.setToolTip('Share97 Desktop')
    tray.on('click', showWindow)
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Share97 Desktop', click: showWindow }, { type: 'separator' }, { label: L().quit, click: quit }]))
  }
  if (!background && tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * Share97 sitesi ayrı pencerede (faturalama, kredi yükleme, akış düzenleyicisi): `/api/v1/worker/web`
 * cihaz anahtarını oturum çerezine çeviriyor, kullanıcı yeniden giriş yapmıyor. Anahtar yalnız bu
 * uca gidiyor, sayfanın isteklerine değil.
 */
async function openSite(path: string) {
  const key = auth.apiKey()
  if (!key) throw new Error('signed-out')
  if (!site || site.isDestroyed()) {
    site = new BrowserWindow({ width: 1280, height: 860, minWidth: 760, minHeight: 520, title: 'Share97', icon: ICON, autoHideMenuBar: true, backgroundColor: overlay().color, webPreferences: { partition: 'persist:share97-site', sandbox: true, contextIsolation: true, nodeIntegration: false } })
    const s = site
    s.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`${auth.SHARE97}/`)) void s.loadURL(url)
      else if (/^https:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    // Pencere kapanınca hesap bilgisi tazeleniyor: kullanıcı paket ya da kredi almış olabilir.
    s.on('closed', () => void auth.refresh())
  }
  await site.loadURL(`${auth.SHARE97}/api/v1/worker/web?${new URLSearchParams({ next: path.startsWith('/') ? path : '/' })}`, { extraHeaders: `Authorization: Bearer ${key}\n` })
  site.show()
  site.focus()
}

/** Yalnız kendi penceremizin ana çerçevesinden gelen IPC kabul ediliyor. */
function handle(channel: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw new Error('forbidden')
    return fn(...args)
  })
}

const str = (v: unknown, max = 4000) => {
  if (typeof v !== 'string' || v.length > max) throw new Error('bad-argument')
  return v
}
const optStr = (v: unknown) => (v === undefined || v === null ? undefined : str(v))
const int = (v: unknown) => {
  if (!Number.isInteger(v)) throw new Error('bad-argument')
  return v as number
}
const CATEGORIES = new Set<ModelCategory>(['text', 'image', 'video', 'speech', 'transcription'])

function registerIpc() {
  handle('auth:state', () => auth.authState())
  handle('auth:connect', () => auth.connect())
  handle('auth:cancel', () => auth.cancel())
  handle('auth:signOut', () => auth.signOut())
  handle('auth:refresh', () => auth.refresh())

  /* Bağlantılar: sosyal medya hesapları, sunucudaki akışlar, Worker tanımları. */
  handle('connections:state', () => accounts.connectionsState())
  handle('connections:refresh', async (force) => {
    // Ekranlar açılırken çağırıyor: art arda geçişlerde sunucunun hız sınırına takılmasın. "Yenile" düğmesi her zaman okur.
    if (force !== true && Date.now() - accounts.lastSync() < 5000) return
    await Promise.all([accounts.syncAccounts(), auth.refresh()])
  })
  handle('connections:add', (platform, h, chromeId) => accounts.addAccount(str(platform, 40), str(h, 200), optStr(chromeId)))
  handle('connections:cancelAdd', () => accounts.cancelAdd())
  handle('connections:relogin', (id) => accounts.relogin(str(id, 200)))
  handle('connections:remove', (id) => accounts.removeAccount(str(id, 200)))
  handle('connections:open', (id) => accounts.openAccount(str(id, 200)))
  handle('connections:setGroup', (id, group) => accounts.setGroup(str(id, 200), str(group, 200)))

  // Akış eylemleri sitedeki kuralla aynı uçlardan; sonra liste yeniden okunuyor.
  const flow = async (id: unknown, body: Record<string, unknown>) => {
    await auth.server(`/api/v1/worker/workflows/${encodeURIComponent(str(id, 200))}`, { method: 'PATCH', body })
    await accounts.syncAccounts()
  }
  handle('workflows:setActive', (id, on) => flow(id, { active: on === true }))
  handle('workflows:setWorker', (id, workerId) => flow(id, { workerId: workerId === null ? null : str(workerId, 200) }))
  handle('workflows:run', async (id) => {
    // Sunucu, akışın cihazdaki işinin bitmesini bekliyor (agent dakikalarca çalışabilir): olağan 30 sn yetmez.
    const out = await auth.server<{ status: string; error: string | null }>(`/api/v1/worker/workflows/${encodeURIComponent(str(id, 200))}/run`, { body: {}, timeoutMs: 25 * 60_000 })
    await accounts.syncAccounts()
    return { status: out.status, error: out.error }
  })

  handle('workflows:setContent', (id, raw) => {
    const c = (raw ?? {}) as { order?: unknown; repeat?: unknown }
    if ((c.order !== 'sequential' && c.order !== 'random') || typeof c.repeat !== 'boolean') throw new Error('bad-argument')
    return flow(id, { content: { order: c.order, repeat: c.repeat } })
  })
  handle('workflows:rename', (id, name) => flow(id, { name: str(name, 120) }))
  handle('workflows:remove', async (id) => {
    await auth.server(`/api/v1/worker/workflows/${encodeURIComponent(str(id, 200))}`, { method: 'DELETE' })
    await accounts.syncAccounts()
  })
  // Metin ve görsel üretimi dakikalar sürebilir; sonuç klasöre yazılır.
  handle('workflows:generate', (id, input) => generateContents(str(id, 200), flowName(str(id, 200)), input))
  const flowName = (id: string) => accounts.connectionsState().overview?.workflows.find((w) => w.id === id)?.name ?? id
  handle('workflows:createLocal', async (name) => {
    await createLocalWorkflow(str(name, 120))
    await accounts.syncAccounts()
  })
  handle('workflows:contents', (id) => listContents(str(id, 200)))
  handle('workflows:openContents', (id) => openContents(str(id, 200), flowName(str(id, 200))))

  handle('workers:list', () => workers.workerDefs())
  handle('workers:save', (id, input) => workers.saveWorker(id === null ? null : str(id, 200), input))
  handle('workers:remove', (id) => workers.removeWorker(str(id, 200)))
  handle('workers:run', (id) => void workers.runWorker(str(id, 200)).catch(() => {}))
  handle('workers:activity', () => deviceActivity())

  handle('site:open', (path) => openSite(str(path, 500)))

  const b = () => browsers!
  handle('browsers:state', () => b().state())
  handle('browsers:thumbnails', () => b().thumbnails())
  handle('browsers:create', (name, url, incognito) => b().create(optStr(name), optStr(url) ?? undefined, true, incognito === true).id)
  handle('browsers:remove', (id) => b().remove(str(id)))
  handle('browsers:update', (id, patch) => {
    const p = (patch ?? {}) as { name?: unknown; note?: unknown; color?: unknown }
    b().update(str(id), { name: optStr(p.name), note: p.note === undefined ? undefined : str(p.note, 10_000), color: optStr(p.color) ?? undefined })
  })
  handle('browsers:close', (id) => b().close(str(id)))
  handle('browsers:activate', (id) => b().activate(id === null ? null : str(id)))
  handle('browsers:move', (id, to) => b().move(str(id), int(to)))
  handle('browsers:openTab', (id, url) => void b().openTab(str(id), optStr(url)))
  handle('browsers:closeTab', (id, tab) => b().closeTab(str(id), str(tab)))
  handle('browsers:activateTab', (id, tab) => b().activateTab(str(id), str(tab)))
  handle('browsers:moveTab', (id, tab, to) => b().moveTab(str(id), str(tab), int(to)))
  handle('browsers:navigate', (input) => b().navigate(str(input)))
  handle('browsers:back', () => void b().current()?.view.webContents.navigationHistory.goBack())
  handle('browsers:forward', () => void b().current()?.view.webContents.navigationHistory.goForward())
  handle('browsers:reload', () => void b().current()?.view.webContents.reload())
  handle('browsers:stop', () => void b().current()?.view.webContents.stop())
  handle('browsers:setBounds', (raw) => {
    const { x, y, width, height } = (raw ?? {}) as Bounds
    if (![x, y, width, height].every(Number.isFinite)) throw new Error('bad-argument')
    b().setBounds({ x, y, width, height })
  })

  handle('browsers:find', (text, forward) => b().find(str(text, 500), forward !== false))
  handle('browsers:stopFind', () => b().stopFind())
  handle('browsers:zoom', (f) => {
    const t = b().current()
    const id = b().state().activeId
    if (t && id) b().setZoom(id, t.id, f === null ? null : Number(f))
  })
  handle('browsers:tabMenu', (id, tab) => b().tabMenu(str(id), str(tab)))
  handle('browsers:reopenTab', () => b().reopenTab())
  handle('browsers:configure', (id, patch) => b().configure(str(id), (patch ?? {}) as never))
  handle('browsers:testConnection', (id) => b().testConnection(str(id)))
  handle('browsers:translate', (lang) => {
    const id = b().state().activeId
    if (id) b().translate(id, undefined, str(lang, 20))
  })
  /** Etkin tarayıcı + sekmesi; şifre işlemleri bunun sitesinde. */
  const current = () => {
    const id = b().state().activeId
    const t = b().current()
    if (!id || !t) throw new Error('Open a browser tab first.')
    return { id, wc: t.view.webContents }
  }
  handle('passwords:list', () => passwords.list())
  handle('passwords:forCurrent', async () => {
    const id = b().state().activeId
    const t = b().current()
    if (!id || !t) return []
    try {
      return await passwords.list(id, passwords.originOf(t.view.webContents.getURL()))
    } catch {
      return []
    }
  })
  handle('passwords:saveCurrent', (user, pass) => {
    const c = current()
    return passwords.save(c.id, c.wc.getURL(), str(user, 200), str(pass, 1000))
  })
  handle('passwords:fillCurrent', (loginId) => {
    const c = current()
    return passwords.fill(c.wc, c.id, str(loginId))
  })
  handle('passwords:remove', (loginId) => passwords.remove(str(loginId)))
  handle('extensions:list', () => extensions.extensions())
  handle('extensions:add', () => extensions.add(win!))
  handle('extensions:remove', (p) => extensions.remove(str(p)))

  /* Chrome eklentisi: bağlanan gerçek Chrome profilleri. */
  const cb = chrome.bridge
  const tabId = (v: unknown) => int(v)
  handle('chrome:state', () => chrome.chromeState())
  handle('chrome:approve', (id) => cb.approve(str(id)))
  handle('chrome:reject', (id) => cb.reject(str(id)))
  handle('chrome:forget', (id) => cb.forget(str(id)))
  handle('chrome:rename', (id, name) => cb.rename(str(id), str(name, 100)))
  handle('chrome:setAgent', (id, on) => cb.setAgent(str(id), on === true))
  handle('chrome:openTab', async (id, input) => void (await cb.call(str(id), 'tabs.create', { url: toUrl(str(input)) }, 45_000)))
  handle('chrome:activateTab', async (id, tab) => void (await cb.call(str(id), 'tabs.activate', { tabId: tabId(tab) })))
  handle('chrome:closeTab', async (id, tab) => void (await cb.call(str(id), 'tabs.close', { tabId: tabId(tab) })))
  handle('chrome:setExtensionEnabled', async (id, ext, on) => void (await cb.call(str(id), 'extensions.setEnabled', { id: str(ext, 100), enabled: on === true })))
  handle('chrome:uninstallExtension', async (id, ext) => void (await cb.call(str(id), 'extensions.uninstall', { id: str(ext, 100) }, 5 * 60_000)))
  handle('chrome:extensionOptions', async (id, ext) => void (await cb.call(str(id), 'extensions.options', { id: str(ext, 100) })))
  handle('chrome:openFolder', () => chrome.openFolder())
  handle('chrome:openChromeExtensions', () => chrome.openChromeExtensions())

  handle('history:list', (q, id) => history.search(str(q, 500), id === null ? null : str(id)))
  handle('history:suggest', (q) => {
    const query = str(q, 500).trim().toLowerCase()
    if (!query) return []
    const seen = new Set<string>()
    const out: { title: string; url: string; bookmark: boolean }[] = []
    for (const x of bookmarks.bookmarks()) if (x.url.toLowerCase().includes(query) || x.title.toLowerCase().includes(query)) out.push({ title: x.title, url: x.url, bookmark: true })
    for (const x of history.search(query, null, 50)) out.push({ title: x.title, url: x.url, bookmark: false })
    return out.filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, 8)
  })
  handle('bookmarks:list', () => bookmarks.bookmarks())
  handle('bookmarks:toggle', (url, title) => bookmarks.toggle(str(url), str(title, 500)))
  handle('bookmarks:remove', (id) => bookmarks.remove(str(id)))
  handle('downloads:list', () => downloads.downloads())
  handle('downloads:open', (id) => downloads.open(str(id)))
  handle('downloads:reveal', (id) => downloads.reveal(str(id)))
  handle('downloads:cancel', (id) => downloads.cancel(str(id)))
  handle('downloads:clear', () => downloads.clear())
  handle('history:clear', () => history.clear())
  handle('history:page', (q, id, n) => {
    const pageSize = 50
    const page = Math.max(0, Math.min(10_000, Number(n) | 0))
    return { ...history.page(str(q, 500), id === null ? null : str(id), page * pageSize, pageSize), pageSize }
  })
  handle('history:remove', (ts, url) => history.removeEntry(Number(ts), str(url)))

  handle('power:get', () => powerState())
  handle('power:set', (on, battery) => setPower(on === true, battery === true))
  handle('settings:get', () => settings())
  handle('settings:set', (patch) => updateSettings((patch ?? {}) as never))
  handle('models:list', (c) => {
    if (!CATEGORIES.has(c as ModelCategory)) throw new Error('bad-argument')
    return models(c as ModelCategory)
  })

  const a = () => agent!
  handle('agent:chats', () => a().summaries())
  handle('agent:chat', (id) => a().chat(str(id)))
  handle('agent:create', () => a().create())
  handle('agent:remove', (id) => a().remove(str(id)))
  handle('agent:send', (id, text, ids) => {
    const picked = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && x.length < 200).slice(0, 50) : []
    void a().send(str(id), str(text, 100_000), accounts.accountsContext(picked))
  })
  handle('agent:stop', (id) => a().stop(str(id)))
  handle('agent:approve', (id, ok) => a().approve(str(id), ok === true))
  handle('agent:rename', (id, title) => a().rename(str(id), str(title, 500)))
  handle('agent:search', (q) => a().search(str(q, 500)))
  handle('agent:unqueue', (id, q) => a().unqueue(str(id), str(q)))
  handle('agent:data', (id) => a().dataList(str(id)))
  handle('agent:dataItem', (id, item) => a().dataItem(str(id), str(item)))

  handle('app:version', () => app.getVersion())
  handle('app:update', () => checkForUpdates())
  handle('app:installUpdate', () => installUpdate())

  handle('backups:list', () => backup.listBackups())
  handle('backups:create', () => backup.createBackup())
  handle('backups:update', (n) => backup.updateBackup(str(n, 255)))
  handle('backups:restore', (n) => backup.restoreBackup(str(n, 255)))
  handle('backups:import', () => backup.importBackup(win!))
  handle('backups:reveal', (n) => backup.revealBackup(str(n, 255)))
  handle('backups:remove', (n) => backup.removeBackup(str(n, 255)))
  handle('backups:openFolder', () => backup.openBackupFolder())
  handle('backups:folder', () => backup.backupDir())

  handle('files:list', () => ws.list())
  handle('files:open', (p) => ws.open(str(p)))
  handle('files:reveal', (p) => ws.reveal(str(p)))
  handle('files:openFolder', () => ws.openFolder())
  handle('files:import', () => ws.importFiles(win!))
  handle('files:saveUpload', (name, data) => {
    if (!(data instanceof Uint8Array) || data.byteLength > 200 * 1024 * 1024) throw new Error('bad-argument')
    return ws.saveUpload(str(name, 255), data)
  })
  handle('files:copy', (p) => ws.copy(str(p)))
  handle('files:remove', (p) => ws.remove(str(p)))
  // Sürükle-bırak: dosya web sayfasına (reklam panelinin yükleme alanı), Gezgin'e ya da başka uygulamaya.
  ipcMain.on('files:drag', (e, p: unknown) => {
    if (!win || e.sender !== win.webContents) return
    try {
      const file = ws.existingSync(str(p))
      const thumb = nativeImage.createFromPath(file)
      const icon = thumb.isEmpty() ? nativeImage.createFromPath(ICON) : thumb
      e.sender.startDrag({ file, icon: icon.resize({ width: 64 }) })
    } catch {}
  })
}

// Windows bildirimlerinin uygulama adıyla görünmesi için (kurulumda electron-builder da aynı kimliği veriyor).
app.setAppUserModelId('com.share97.desktop')

// Tek kopya: ikinci açılış var olan pencereyi öne getirir (iki Worker aynı işi yoklamasın).
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    // Tema: ayardan (değişince `createWindow`daki dinleyici); pencere çerçevesi `nativeTheme` 'updated' ile yenileniyor.
    nativeTheme.themeSource = settings().theme
    protocol.handle('share97-file', async (req) => {
      try {
        const rel = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ''))
        return net.fetch(pathToFileURL(await ws.existing(rel)).toString(), { headers: req.headers })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
    registerIpc()
    createWindow()
    applyBackground()
    await chrome.startChrome()
    startUpdater(() => (agent?.busy() ?? false) || deviceBusy())
    // Giriş yapılınca (açılışta ya da Connect sonrası) hesaplar ve akışlar beklemeden okunuyor.
    auth.onAuthChange((s) => {
      if (s.status !== 'signed-in' || accounts.lastSync() !== 0) return
      pollNow()
      void workers.syncWorkers()
    })
    await auth.restore()
  })

  // Açık tarayıcıların son önizlemeleri: bir sonraki açılışta ana sayfadaki kartlarda.
  app.on('before-quit', () => {
    quitting = true
    browsers?.saveThumbnails()
  })

  app.on('window-all-closed', () => {
    auth.cancel()
    chrome.bridge.stop()
    app.quit()
  })
}
