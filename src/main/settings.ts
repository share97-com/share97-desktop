import type { Settings } from '../shared/types.ts'
import { dataPath, readJson, writeJson } from './store.ts'

/** Varsayılan sohbet ve vision modeli: araç çağırıyor, görsel okuyor, ucuz. */
export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash'

const DEFAULTS: Settings = {
  chatModel: DEFAULT_MODEL,
  visionModel: DEFAULT_MODEL,
  subagentModel: null,
  imageModel: null,
  videoModel: null,
  speechModel: null,
  effort: 'medium',
  approval: 'risky',
  theme: 'system',
  background: true,
  autostart: false,
}

const file = () => dataPath('settings.json')
let current: Settings | null = null
let listener: (s: Settings) => void = () => {}
export const onSettingsChange = (cb: (s: Settings) => void) => (listener = cb)

export const settings = (): Settings => (current ??= { ...DEFAULTS, ...readJson<Partial<Settings>>(file(), {}) })

const EFFORTS = new Set(['off', 'low', 'medium', 'high'])
const model = (v: unknown) => (v === null || (typeof v === 'string' && v.length < 200) ? v : undefined)

/** Renderer'dan gelen yama alan alan doğrulanıyor; tanınmayan alan yok sayılıyor. */
export function update(patch: Partial<Record<keyof Settings, unknown>>): Settings {
  const next = { ...settings() }
  for (const k of ['chatModel', 'visionModel', 'subagentModel', 'imageModel', 'videoModel', 'speechModel'] as const) {
    const v = model(patch[k])
    if (v !== undefined) next[k] = v as string | null
  }
  if (typeof patch.effort === 'string' && EFFORTS.has(patch.effort)) next.effort = patch.effort as Settings['effort']
  if (patch.approval === 'risky' || patch.approval === 'all') next.approval = patch.approval
  if (patch.theme === 'system' || patch.theme === 'light' || patch.theme === 'dark') next.theme = patch.theme
  if (typeof patch.background === 'boolean') next.background = patch.background
  if (typeof patch.autostart === 'boolean') next.autostart = patch.autostart
  current = next
  writeJson(file(), next)
  listener(next)
  return next
}
