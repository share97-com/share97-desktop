/**
 * Share97 for Chrome: the bridge between this Chrome profile and the Share97 Desktop app.
 *
 * The app listens on ws://127.0.0.1:17614 (only on this computer). This worker connects, says who
 * it is (a random id and secret made on install, and the name the user gave it) and waits for the
 * user to approve it in the app. After that the app can list windows and tabs, open, close and
 * switch tabs, and drive pages through the Chrome DevTools Protocol (chrome.debugger), exactly
 * like the browsers inside the app. It also lists and manages the other Chrome extensions.
 *
 * Chrome stops idle service workers: a ping every 20 s keeps the socket alive while the app runs,
 * and an alarm every 30 s reconnects after the app was closed or the worker was stopped.
 */

const PORT = 17614
const PING_MS = 20_000
const DETACH_IDLE_MS = 30_000
const LOAD_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 120_000

let ws = null
let pushTimer = null
let extTimer = null
/** Tabs the debugger is attached to: tabId -> idle timer (detached after DETACH_IDLE_MS). */
const attached = new Map()

/* ---------------- identity and status ---------------- */

async function identity() {
  let { instance, token, name } = await chrome.storage.local.get(['instance', 'token', 'name'])
  if (!instance || !token) {
    instance = crypto.randomUUID()
    token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    await chrome.storage.local.set({ instance, token })
  }
  if (!name) {
    name = `Chrome ${instance.slice(0, 4).toUpperCase()}`
    await chrome.storage.local.set({ name })
  }
  return { instance, token, name }
}

/** Full Chrome version (the user agent string only says 157.0.0.0). */
async function chromeVersion() {
  try {
    const { fullVersionList } = await navigator.userAgentData.getHighEntropyValues(['fullVersionList'])
    return fullVersionList.find((b) => /Chrome|Chromium/.test(b.brand))?.version ?? ''
  } catch {
    return /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? ''
  }
}

/** offline | connecting | pending | connected | rejected; the popup reads it from session storage. */
async function setStatus(status) {
  await chrome.storage.session.set({ status })
  const badge = { offline: ['OFF', '#6b7280'], connecting: ['…', '#6b7280'], pending: ['?', '#f59e0b'], rejected: ['X', '#ef4444'], connected: ['', '#10b981'] }[status]
  await chrome.action.setBadgeText({ text: badge[0] })
  await chrome.action.setBadgeBackgroundColor({ color: badge[1] })
}

const send = (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))

/* ---------------- connection ---------------- */

/**
 * One connection at a time: start-up, onInstalled and the alarm all call this; without the shared
 * promise they would open several sockets at once and the app would keep a different one.
 */
let opening = null
const connect = () => (opening ??= open().finally(() => (opening = null)))

async function open() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return
  // After a rejection only the popup's "Connect again" asks again (it resets the status first).
  const { status } = await chrome.storage.session.get('status')
  if (status === 'rejected') return
  await setStatus('connecting')
  const me = await identity()
  const hello = { type: 'hello', instance: me.instance, token: me.token, name: me.name, version: chrome.runtime.getManifest().version, chrome: await chromeVersion() }
  const sock = new WebSocket(`ws://127.0.0.1:${PORT}`)
  ws = sock
  sock.onopen = () => sock.send(JSON.stringify(hello))
  sock.onmessage = (e) => {
    try {
      void onMessage(sock, JSON.parse(e.data))
    } catch {}
  }
  sock.onclose = async () => {
    if (ws !== sock) return
    ws = null
    const { status: now } = await chrome.storage.session.get('status')
    if (now !== 'rejected') await setStatus('offline')
  }
  sock.onerror = () => {}
}

async function onMessage(sock, msg) {
  if (msg.type === 'welcome') {
    await setStatus(msg.status === 'approved' ? 'connected' : msg.status === 'pending' ? 'pending' : 'rejected')
    if (msg.status === 'approved') {
      schedulePush()
      scheduleExtensions()
    }
    if (msg.status === 'rejected') sock.close()
  } else if (msg.type === 'rename' && typeof msg.name === 'string') {
    await chrome.storage.local.set({ name: msg.name.slice(0, 60) })
  } else if (msg.type === 'update') {
    // The app ships a newer copy of this folder: reload to pick it up.
    chrome.runtime.reload()
  } else if (msg.type === 'call') {
    try {
      send({ type: 'result', id: msg.id, result: await call(msg.method, msg.params ?? {}) })
    } catch (e) {
      send({ type: 'result', id: msg.id, error: String(e?.message ?? e) })
    }
  }
}

setInterval(() => send({ type: 'ping' }), PING_MS)
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((a) => a.name === 'reconnect' && void connect())
chrome.runtime.onStartup.addListener(() => void connect())
chrome.runtime.onInstalled.addListener(() => void connect())
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'rename' && typeof msg.name === 'string') {
    const name = msg.name.trim().slice(0, 60)
    void chrome.storage.local.set({ name }).then(() => {
      send({ type: 'rename', name })
      reply(true)
    })
    return true
  }
  if (msg?.type === 'connect') {
    // "Try again" after a rejection: start a fresh request.
    void chrome.storage.session.set({ status: 'offline' }).then(() => {
      ws?.close()
      ws = null
      return connect()
    })
  }
})
void connect()

/* ---------------- state pushed to the app ---------------- */

const tabInfo = (t) => ({
  id: t.id,
  windowId: t.windowId,
  index: t.index,
  title: t.title ?? '',
  // A tab that never navigated reports an empty url: it is about:blank.
  url: t.url || t.pendingUrl || 'about:blank',
  // Large data: favicons would make every update heavy.
  favicon: t.favIconUrl && !(t.favIconUrl.startsWith('data:') && t.favIconUrl.length > 20_000) ? t.favIconUrl : null,
  active: t.active,
  pinned: t.pinned,
  audible: !!t.audible,
  muted: !!t.mutedInfo?.muted,
  incognito: t.incognito,
  loading: t.status === 'loading',
})

async function snapshot() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
  return wins.map((w) => ({ id: w.id, focused: w.focused, incognito: w.incognito, tabs: (w.tabs ?? []).map(tabInfo) }))
}

function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => send({ type: 'state', windows: await snapshot() }), 250)
}

async function listExtensions() {
  const all = await chrome.management.getAll()
  return all
    .filter((x) => x.type === 'extension')
    .map((x) => ({ id: x.id, name: x.name, version: x.version, enabled: x.enabled, mayDisable: x.mayDisable && x.id !== chrome.runtime.id, self: x.id === chrome.runtime.id, description: (x.description ?? '').slice(0, 300), optionsUrl: x.optionsUrl || null, installType: x.installType }))
}

function scheduleExtensions() {
  clearTimeout(extTimer)
  extTimer = setTimeout(async () => send({ type: 'extensions', list: await listExtensions() }), 250)
}

for (const ev of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onActivated, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabs.onReplaced, chrome.windows.onCreated, chrome.windows.onRemoved, chrome.windows.onFocusChanged]) ev.addListener(schedulePush)
chrome.tabs.onUpdated.addListener((_id, change) => {
  if ('status' in change || 'title' in change || 'url' in change || 'favIconUrl' in change || 'audible' in change || 'mutedInfo' in change || 'pinned' in change) schedulePush()
})
for (const ev of [chrome.management.onInstalled, chrome.management.onUninstalled, chrome.management.onEnabled, chrome.management.onDisabled]) ev.addListener(scheduleExtensions)

/* ---------------- calls from the app ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Waits until the tab finished loading (or the timeout passed). */
async function loaded(tabId, timeout = LOAD_TIMEOUT_MS) {
  await sleep(300)
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const t = await chrome.tabs.get(tabId).catch(() => null)
    if (!t || t.status === 'complete') return t
    await sleep(250)
  }
  return chrome.tabs.get(tabId).catch(() => null)
}

/** The debugger stays attached while the agent works on a tab and detaches when idle (Chrome shows a bar meanwhile). */
async function debuggee(tabId) {
  if (!attached.has(tabId)) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3')
    } catch (e) {
      if (!String(e?.message ?? e).includes('Already attached')) throw new Error(`Cannot control this tab: ${e?.message ?? e}. Chrome pages (chrome://, the Web Store) cannot be automated.`)
    }
    void chrome.action.setBadgeText({ tabId, text: 'AI' })
  }
  clearTimeout(attached.get(tabId))
  attached.set(
    tabId,
    setTimeout(() => {
      attached.delete(tabId)
      chrome.debugger.detach({ tabId }).catch(() => {})
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    }, DETACH_IDLE_MS),
  )
  return { tabId }
}
chrome.debugger.onDetach.addListener((source) => {
  clearTimeout(attached.get(source.tabId))
  attached.delete(source.tabId)
  chrome.action.setBadgeText({ tabId: source.tabId, text: '' }).catch(() => {})
})
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(attached.get(tabId))
  attached.delete(tabId)
})

function waitDownload(id) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done(), DOWNLOAD_TIMEOUT_MS)
    const done = async () => {
      clearTimeout(timer)
      chrome.downloads.onChanged.removeListener(listener)
      const [d] = await chrome.downloads.search({ id })
      resolve({ id, filename: d?.filename ?? '', state: d?.state ?? 'unknown', bytes: d?.bytesReceived ?? 0, url: d?.finalUrl ?? d?.url ?? '' })
    }
    const listener = (delta) => {
      if (delta.id === id && delta.state && delta.state.current !== 'in_progress') void done()
    }
    chrome.downloads.onChanged.addListener(listener)
  })
}

/**
 * Scan effect drawn on the page while the agent looks at a screenshot: a glowing frame, a sweeping
 * line and a label; with `point` (0-1000 grid) a pulsing ring where the vision model found the target.
 * It lives in a closed shadow root with pointer-events: none, so it never blocks or leaks into the page.
 * The screenshot is taken before the effect starts, so it is never in what the model sees.
 */
const SCAN_SCRIPT = (on, point) => `(() => {
  const ID = 's97-scan'
  const old = document.getElementById(ID)
  const on = ${JSON.stringify(!!on)}, point = ${JSON.stringify(point ?? null)}
  if (!on && !point) { old?.remove(); return }
  const host = old ?? document.createElement('div')
  if (!old) {
    host.id = ID
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none'
    host.attachShadow({ mode: 'open' })
    ;(document.body ?? document.documentElement).appendChild(host)
  }
  const root = host.shadowRoot
  root.innerHTML = '<style>' +
    '.f{position:fixed;inset:0;border:3px solid #7c5cff;box-shadow:inset 0 0 40px rgba(124,92,255,.45);border-radius:6px;animation:g 1.2s ease-in-out infinite alternate}' +
    '.l{position:fixed;left:0;right:0;height:90px;background:linear-gradient(180deg,rgba(124,92,255,0),rgba(124,92,255,.28) 80%,rgba(160,140,255,.9));animation:s 1.6s linear infinite}' +
    '.t{position:fixed;top:10px;right:12px;font:600 12px system-ui,sans-serif;color:#fff;background:#7c5cff;padding:5px 10px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
    '.p{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#ff3d7f;box-shadow:0 0 0 0 rgba(255,61,127,.7);animation:r .9s ease-out infinite}' +
    '@keyframes s{from{top:-90px}to{top:100%}}@keyframes g{from{opacity:.55}to{opacity:1}}' +
    '@keyframes r{to{box-shadow:0 0 0 26px rgba(255,61,127,0)}}' +
    '</style>' +
    (on ? '<div class="f"></div><div class="l"></div><div class="t">Share97 · scanning screen</div>' : '') +
    (point ? '<div class="p" style="left:' + point.x / 10 + '%;top:' + point.y / 10 + '%"></div>' : '')
  clearTimeout(window.__s97ScanTimer)
  // Safety net: the effect never stays if the app stops talking to this tab.
  window.__s97ScanTimer = setTimeout(() => host.remove(), on ? 60000 : 1500)
})()`

async function scanEffect(tabId, on, point) {
  await chrome.debugger.sendCommand(await debuggee(tabId), 'Runtime.evaluate', { expression: SCAN_SCRIPT(on, point) })
  await chrome.action.setBadgeText({ tabId, text: on ? 'SCAN' : 'AI' }).catch(() => {})
}

/**
 * Agent downloads: files that start while the agent is driving a tab of this Chrome (the debugger is
 * attached) or that it asked for. Sites like Google Ads build an export first and start the file
 * seconds after the click, so they are remembered here (session storage survives a worker restart)
 * until the app takes them into its workspace, however late they arrive.
 */
const AGENT_DOWNLOADS = 'agentDownloads'
const agentIds = async () => (await chrome.storage.session.get(AGENT_DOWNLOADS))[AGENT_DOWNLOADS] ?? []
const setAgentIds = (ids) => chrome.storage.session.set({ [AGENT_DOWNLOADS]: ids })
async function markAgentDownload(id) {
  const ids = await agentIds()
  if (!ids.includes(id)) await setAgentIds([...ids, id])
}
chrome.downloads.onCreated.addListener((d) => {
  if (attached.size) void markAgentDownload(d.id)
})
chrome.downloads.onErased.addListener(async (id) => {
  const ids = await agentIds()
  if (ids.includes(id)) await setAgentIds(ids.filter((x) => x !== id))
})

/**
 * The agent downloads not taken yet. `waitStartMs`: wait that long for one to start (after a click
 * on an export button); then wait up to `waitMs` while any is still in progress.
 */
async function agentDownloads(waitStartMs, waitMs) {
  const started = Date.now()
  for (;;) {
    const ids = await agentIds()
    const list = (await Promise.all(ids.map((id) => chrome.downloads.search({ id })))).flat()
    const waiting = (!list.length && Date.now() - started < waitStartMs) || (list.some((d) => d.state === 'in_progress') && Date.now() - started < waitMs)
    if (!waiting) return list.map((d) => ({ id: d.id, filename: d.filename, state: d.state, bytes: d.bytesReceived, url: d.finalUrl || d.url, exists: d.exists }))
    await sleep(400)
  }
}

async function call(method, p) {
  switch (method) {
    case 'windows.list':
      return snapshot()
    case 'windows.focus':
      await chrome.windows.update(p.windowId, { focused: true })
      return true
    case 'tabs.get':
      return tabInfo(await chrome.tabs.get(p.tabId))
    case 'tabs.create': {
      const t = await chrome.tabs.create({ url: p.url || undefined, active: p.active !== false, ...(p.windowId && { windowId: p.windowId }) })
      if (p.focus !== false) await chrome.windows.update(t.windowId, { focused: true })
      return tabInfo((p.url && (await loaded(t.id))) || t)
    }
    case 'tabs.activate': {
      const t = await chrome.tabs.update(p.tabId, { active: true })
      await chrome.windows.update(t.windowId, { focused: true })
      return true
    }
    case 'tabs.close':
      await chrome.tabs.remove(p.tabId)
      return true
    case 'tabs.navigate':
      await chrome.tabs.update(p.tabId, { url: p.url })
      return tabInfo(await loaded(p.tabId))
    case 'tabs.back':
      await chrome.tabs.goBack(p.tabId).catch(() => {})
      return tabInfo(await loaded(p.tabId))
    case 'tabs.forward':
      await chrome.tabs.goForward(p.tabId).catch(() => {})
      return tabInfo(await loaded(p.tabId))
    case 'tabs.reload':
      await chrome.tabs.reload(p.tabId, { bypassCache: !!p.hard })
      return tabInfo(await loaded(p.tabId))
    case 'tabs.duplicate':
      return tabInfo(await chrome.tabs.duplicate(p.tabId))
    case 'tabs.zoom':
      await chrome.tabs.setZoom(p.tabId, p.factor)
      return true
    case 'tabs.mute':
      await chrome.tabs.update(p.tabId, { muted: !!p.muted })
      return true
    case 'cdp':
      return chrome.debugger.sendCommand(await debuggee(p.tabId), p.method, p.params ?? {})
    // Is the user signed in to a platform in this Chrome? Only whether the session cookie exists; its value never leaves Chrome.
    case 'cookies.has':
      return Boolean(await chrome.cookies.get({ url: p.url, name: p.name }))
    case 'history.search':
      return (await chrome.history.search({ text: p.text ?? '', maxResults: p.maxResults ?? 50, startTime: 0 })).map((h) => ({ url: h.url, title: h.title ?? '', lastVisit: h.lastVisitTime ?? 0, visits: h.visitCount ?? 0 }))
    case 'downloads.download': {
      const id = await chrome.downloads.download({ url: p.url })
      await markAgentDownload(id)
      return waitDownload(id)
    }
    case 'downloads.agent':
      return agentDownloads(Math.min(p.waitStartMs ?? 0, DOWNLOAD_TIMEOUT_MS), Math.min(p.waitMs ?? 0, DOWNLOAD_TIMEOUT_MS))
    case 'downloads.list':
      // Chrome's own download history (newest first), for the agent to see and pick from.
      return (await chrome.downloads.search({ orderBy: ['-startTime'], limit: Math.min(p.limit ?? 20, 100) })).map((d) => ({ id: d.id, filename: d.filename, state: d.state, bytes: d.bytesReceived, url: d.finalUrl || d.url, started: d.startTime, exists: d.exists }))
    case 'tabs.pin':
      return tabInfo(await chrome.tabs.update(p.tabId, { pinned: !!p.pinned }))
    case 'tabs.print':
      // Chrome's print dialog for the page (the user picks the printer).
      await chrome.debugger.sendCommand(await debuggee(p.tabId), 'Runtime.evaluate', { expression: 'setTimeout(() => print(), 0)' })
      return true
    case 'windows.create': {
      const w = await chrome.windows.create({ url: p.url || undefined, focused: p.focus !== false, incognito: !!p.incognito })
      const t = w.tabs?.[0]
      return t ? tabInfo((p.url && (await loaded(t.id))) || t) : null
    }
    case 'windows.close':
      await chrome.windows.remove(p.windowId)
      return true
    case 'sessions.restore': {
      // Ctrl+Shift+T: the most recently closed tab or window.
      const s = await chrome.sessions.restore()
      return s?.tab ? tabInfo(s.tab) : s?.window ? { windowId: s.window.id, tabs: (s.window.tabs ?? []).length } : null
    }
    case 'bookmarks.list': {
      const out = []
      const walk = (nodes, path) => {
        for (const n of nodes) {
          if (out.length >= 500) return
          if (n.url) out.push({ id: n.id, title: n.title, url: n.url, folder: path })
          else if (n.children) walk(n.children, path ? `${path}/${n.title}` : n.title)
        }
      }
      walk(await chrome.bookmarks.getTree(), '')
      const q = (p.query ?? '').toLowerCase()
      return q ? out.filter((b) => `${b.title} ${b.url} ${b.folder}`.toLowerCase().includes(q)) : out
    }
    case 'bookmarks.add': {
      const b = await chrome.bookmarks.create({ title: p.title || p.url, url: p.url })
      return { id: b.id, title: b.title, url: b.url }
    }
    case 'bookmarks.remove':
      await chrome.bookmarks.remove(p.id)
      return true
    case 'downloads.erase':
      // The app moved the file into its workspace (or it failed): drop the entry from Chrome's list.
      await chrome.downloads.erase({ id: p.id })
      return true
    case 'effect.scan':
      await scanEffect(p.tabId, !!p.on, p.point)
      return true
    case 'extensions.list':
      return listExtensions()
    case 'extensions.setEnabled':
      if (p.id === chrome.runtime.id) throw new Error('This is the Share97 extension itself.')
      await chrome.management.setEnabled(p.id, !!p.enabled)
      return true
    case 'extensions.uninstall':
      if (p.id === chrome.runtime.id) throw new Error('This is the Share97 extension itself.')
      // Chrome asks the user to confirm.
      await chrome.management.uninstall(p.id, { showConfirmDialog: true })
      return true
    case 'extensions.options': {
      const x = await chrome.management.get(p.id)
      if (!x.optionsUrl) throw new Error('This extension has no options page.')
      await chrome.tabs.create({ url: x.optionsUrl })
      return true
    }
    default:
      throw new Error(`Unknown method ${method}`)
  }
}
