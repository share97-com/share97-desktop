import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { safeStorage, type WebContents } from 'electron'
import type { SavedLogin } from '../shared/types.ts'
import { dataPath } from './store.ts'

/**
 * **Şifre yöneticisi.** Girişler tarayıcı (çerez deposu) + site kökeni başına, bütün kasa
 * safeStorage (Windows DPAPI) ile şifreli tek dosyada. Şifre hiçbir zaman renderer'a ya da
 * agent'a gitmiyor: liste yalnız kullanıcı adını taşıyor, doldurma main süreçte, sayfanın
 * ayrı bir JavaScript dünyasında (`executeJavaScriptInIsolatedWorld`) yapılıyor.
 */
type Login = SavedLogin & { password: string }

const file = () => dataPath('passwords.bin')
const ISOLATED_WORLD = 1001
let vault: Login[] | null = null
let listener: (l: SavedLogin[]) => void = () => {}

export const onLoginsChange = (cb: (l: SavedLogin[]) => void) => (listener = cb)

async function load(): Promise<Login[]> {
  if (vault) return vault
  try {
    vault = JSON.parse((await safeStorage.decryptStringAsync(await readFile(file()))).result) as Login[]
  } catch {
    vault = []
  }
  return vault
}

async function persist() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('Encryption is not available on this system.')
  await writeFile(file(), await safeStorage.encryptStringAsync(JSON.stringify(vault ?? [])))
  listener(await list())
}

const publicView = ({ password: _p, ...l }: Login): SavedLogin => l

export const list = async (browserId?: string, origin?: string) =>
  (await load()).filter((l) => (!browserId || l.browserId === browserId) && (!origin || l.origin === origin)).map(publicView)

export const originOf = (url: string) => {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Logins can only be saved for web pages.')
  return u.origin
}

export async function save(browserId: string, url: string, username: string, password: string): Promise<SavedLogin> {
  if (!password) throw new Error('Password is empty.')
  const origin = originOf(url)
  const all = await load()
  const existing = all.find((l) => l.browserId === browserId && l.origin === origin && l.username === username)
  if (existing) existing.password = password
  else all.push({ id: randomUUID(), browserId, origin, username: username.slice(0, 200), password, ts: Date.now() })
  await persist()
  return publicView(existing ?? all.at(-1)!)
}

export async function remove(id: string) {
  vault = (await load()).filter((l) => l.id !== id)
  await persist()
}

/** Kayıtlı girişi sayfadaki şifre alanına (ve önündeki kullanıcı adı alanına) yazar; şifreyi döndürmez. */
export async function fill(wc: WebContents, browserId: string, loginId?: string): Promise<string> {
  const origin = originOf(wc.getURL())
  const candidates = (await load()).filter((l) => l.browserId === browserId && l.origin === origin)
  const login = loginId ? candidates.find((l) => l.id === loginId) : candidates[0]
  if (!login) throw new Error(`No saved login for ${origin} in this browser.`)
  const code = `(() => {
    const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); p.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
    const visible = (el) => el.offsetParent !== null
    const pass = [...document.querySelectorAll('input[type=password]')].find(visible)
    const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]):not([type=submit])')].filter(visible)
    const user = pass ? inputs.filter((i) => i.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING).pop() : inputs.find((i) => /mail|user|login|identifier/i.test(i.name + i.id + i.type + i.autocomplete))
    if (user && ${JSON.stringify(login.username)}) set(user, ${JSON.stringify(login.username)})
    if (pass) set(pass, ${JSON.stringify(login.password)})
    return { user: !!user, pass: !!pass }
  })()`
  const r = (await wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code }])) as { user: boolean; pass: boolean }
  if (!r.user && !r.pass) throw new Error('No login fields found on this page.')
  return `${login.username}${r.pass ? '' : ' (username only: the password field appears on the next step)'}`
}
