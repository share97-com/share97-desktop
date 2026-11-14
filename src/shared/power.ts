/** `powercfg` komutlarının saf kısmı (bkz. `main/power.ts`). */
export const POWER_SETTINGS = [
  ['SUB_SLEEP', 'STANDBYIDLE'],
  ['SUB_SLEEP', 'HIBERNATEIDLE'],
  ['SUB_VIDEO', 'VIDEOIDLE'],
  ['SUB_BUTTONS', 'LIDACTION'],
] as const

/** Ayar adı → [AC, pil] değerleri. */
export type PowerPrevious = Record<string, [number, number]>

/** `powercfg /qh` çıktısı dile göre değişiyor, sıra sabit: son iki onaltılık değer AC ve pil. */
export function parsePowercfg(text: string): [number, number] {
  const hex = text.match(/0x[0-9a-f]+/gi) ?? []
  if (hex.length < 2) throw new Error('power-read-failed')
  const [ac, dc] = hex.slice(-2).map((h) => parseInt(h, 16))
  return [ac, dc]
}

export const powerApply = (battery: boolean) => [
  ...POWER_SETTINGS.flatMap(([sub, name]) => [['/setacvalueindex', 'SCHEME_CURRENT', sub, name, '0'], ...(battery ? [['/setdcvalueindex', 'SCHEME_CURRENT', sub, name, '0']] : [])]),
  ['/setactive', 'SCHEME_CURRENT'],
]

export const powerRestore = (previous: PowerPrevious) => [
  ...POWER_SETTINGS.flatMap(([sub, name]) => {
    const [ac, dc] = previous[name] ?? [0, 0]
    return [['/setacvalueindex', 'SCHEME_CURRENT', sub, name, String(ac)], ['/setdcvalueindex', 'SCHEME_CURRENT', sub, name, String(dc)]]
  }),
  ['/setactive', 'SCHEME_CURRENT'],
]
