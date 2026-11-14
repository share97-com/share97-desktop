/**
 * Worker tanımının zamanlaması — saf. `manual`: yalnız "Çalıştır" düğmesiyle; `interval`: her N
 * dakikada; `daily`: seçilen günlerde (0 = pazar) bilgisayarın yerel saatinde `HH:MM`.
 */
export type Schedule = { kind: 'manual' } | { kind: 'interval'; minutes: number } | { kind: 'daily'; time: string; days: number[] }

export const MIN_INTERVAL = 5
const MAX_INTERVAL = 30 * 24 * 60

/** Arayüzden gelen zamanlamayı doğrular; tanınmayan biçim elle çalıştırmaya düşer. */
export function cleanSchedule(raw: unknown): Schedule {
  const s = (raw ?? {}) as { kind?: unknown; minutes?: unknown; time?: unknown; days?: unknown }
  if (s.kind === 'interval' && Number.isFinite(s.minutes)) return { kind: 'interval', minutes: Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(s.minutes as number))) }
  if (s.kind === 'daily' && typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
    const days = Array.isArray(s.days) ? [...new Set(s.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
    return { kind: 'daily', time: s.time, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] }
  }
  return { kind: 'manual' }
}

/** `after` anından sonraki ilk çalışma (ms); elle çalışan tanımda `null`. */
export function nextRun(s: Schedule, after: number): number | null {
  if (s.kind === 'manual') return null
  if (s.kind === 'interval') return after + s.minutes * 60_000
  const [h, m] = s.time.split(':').map(Number)
  const d = new Date(after)
  d.setHours(h, m, 0, 0)
  // En çok bir hafta ileri: seçili günlerden biri mutlaka denk geliyor.
  for (let i = 0; i < 8; i++) {
    if (d.getTime() > after && s.days.includes(d.getDay())) return d.getTime()
    d.setDate(d.getDate() + 1)
    d.setHours(h, m, 0, 0)
  }
  return null
}
