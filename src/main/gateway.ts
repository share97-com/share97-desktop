import type { ModelCategory, ModelInfo } from '../shared/types.ts'
import { SHARE97, apiKey } from './auth.ts'

/**
 * Share97 yapay zekâ geçidi (`/api/v1/ai/*`): OpenAI biçiminde, sunucu isteği api14'e aktarıyor ve
 * bedeli (api14 fiyatı + sitenin marjı) kullanıcının Share97 bakiyesinden düşüyor. Yanıttaki
 * `usage.cost` ve model listesindeki fiyatlar kullanıcının ödediği tutar.
 */
export const AI_BASE = `${SHARE97}/api/v1/ai`

/** Geçide cihaz anahtarıyla istek. Hata gövdesi OpenAI biçiminde: `{ error: { code, message } }`. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const key = apiKey()
  if (!key) throw new Error('Not signed in to Share97.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${key}`)
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  return fetch(`${AI_BASE}/${path}`, { ...init, headers })
}

export async function apiJson<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await api(path, body === undefined ? { signal } : { method: 'POST', body: JSON.stringify(body), signal })
  const json = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null
  if (!res.ok || !json) throw new Error(`${json?.error?.code ?? res.status}: ${json?.error?.message ?? 'AI request failed'}`)
  return json
}

type RawModel = {
  id: string
  name?: string
  category: string
  context_length?: number
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
  price_lines?: { key: string; usd: number; unit: string }[]
}

const UNITS: Record<string, string> = { mtok: '1M tok', mchar: '1M chr', minute: 'min', second: 's', image: 'img', megapixel: 'MP', request: 'req', ksearch: '1K search' }

const priceOf = (lines: RawModel['price_lines'] = []) =>
  lines.length ? lines.slice(0, 2).map((l) => `$${+l.usd.toFixed(4)} ${l.key}/${UNITS[l.unit] ?? l.unit}`).join(' · ') : 'free'

/** Kategori başına 10 dakika önbellek. */
const cache = new Map<string, { at: number; models: ModelInfo[] }>()

export async function models(category: ModelCategory): Promise<ModelInfo[]> {
  const hit = cache.get(category)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.models
  const { data } = await apiJson<{ data: RawModel[] }>(`models?category=${category}`)
  const list = data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    category: m.category,
    contextLength: m.context_length ?? null,
    tools: m.supported_parameters?.includes('tools') ?? false,
    reasoning: m.supported_parameters?.includes('reasoning') ?? false,
    vision: m.architecture?.input_modalities?.includes('image') ?? false,
    price: priceOf(m.price_lines),
    unitPrice: m.price_lines?.[0]?.usd ?? null,
    unit: m.price_lines?.[0]?.unit ?? null,
  }))
  cache.set(category, { at: Date.now(), models: list })
  return list
}
