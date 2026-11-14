import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/** userData altındaki küçük JSON dosyaları (ayarlar, tarayıcılar, sohbetler). */
export const dataPath = (...parts: string[]) => join(app.getPath('userData'), ...parts)

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}

/** Sık değişen durum için: son değeri `ms` sonra yazar. */
export function debouncedWriter(file: () => string, ms = 300) {
  let timer: NodeJS.Timeout | undefined
  return (value: () => unknown) => {
    clearTimeout(timer)
    timer = setTimeout(() => writeJson(file(), value()), ms)
  }
}
