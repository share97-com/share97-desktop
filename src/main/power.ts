import { execFile } from 'node:child_process'
import { app } from 'electron'
import type { PowerState } from '../shared/types.ts'
import { parsePowercfg, powerApply, powerRestore, POWER_SETTINGS, type PowerPrevious } from '../shared/power.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/**
 * **Sürekli çalışma**: Windows'un uyku, hazırda bekleme, ekran kapanması ve kapak eylemi kapatılır,
 * uygulama açılışta başlar. Yalnız kullanıcı açınca; önceki değerler saklanır ve kapatınca geri yüklenir.
 * Uygulama açıkken uygulama askıya alınmasın diye `index.ts` ayrıca `powerSaveBlocker` tutuyor.
 */
type Saved = { enabled: boolean; battery: boolean; previous: PowerPrevious | null; autostartBefore: boolean }
const file = () => dataPath('power.json')
const load = () => readJson<Saved>(file(), { enabled: false, battery: false, previous: null, autostartBefore: false })

const powercfg = (args: string[]) =>
  new Promise<string>((resolve, reject) => execFile('powercfg', args, { timeout: 120_000, windowsHide: true }, (err, out) => (err ? reject(err) : resolve(String(out)))))
const runAll = async (list: string[][]) => {
  for (const args of list) await powercfg(args)
}

export const powerState = (): PowerState => {
  const s = load()
  return { supported: process.platform === 'win32', enabled: s.enabled, battery: s.battery }
}

/** Açar ya da kapatır; yarıda düşen açma önceki hale döner. */
export async function setPower(on: boolean, battery: boolean): Promise<PowerState> {
  if (process.platform !== 'win32') return powerState()
  const s = load()
  if (on && !s.enabled) {
    const previous: PowerPrevious = {}
    for (const [sub, name] of POWER_SETTINGS) previous[name] = parsePowercfg(await powercfg(['/qh', 'SCHEME_CURRENT', sub, name]))
    try {
      await runAll(powerApply(battery))
    } catch (e) {
      await runAll(powerRestore(previous)).catch(() => {})
      throw e
    }
    writeJson(file(), { enabled: true, battery, previous, autostartBefore: app.getLoginItemSettings().openAtLogin })
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })
  } else if (!on && s.enabled) {
    if (s.previous) await runAll(powerRestore(s.previous))
    app.setLoginItemSettings({ openAtLogin: s.autostartBefore, args: ['--hidden'] })
    writeJson(file(), { ...s, enabled: false, previous: null })
  }
  return powerState()
}
