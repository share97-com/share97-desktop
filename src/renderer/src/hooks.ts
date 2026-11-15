import { useEffect, useState } from 'react'
import type { ActivityEntry, Bookmark, BrowsersState, ConnectionsState, ChatSummary, ChromeState, Download, ExtensionInfo, FileEntry, SavedLogin, ModelCategory, ModelInfo, Settings, Thumbnails, UpdateState } from '../../shared/types.ts'

/** Main süreçteki durumun renderer'daki yansıması: ilk değer + değişiklik aboneliği. */

export const api = () => window.share97

export function useBrowsers() {
  const [s, set] = useState<BrowsersState>({ browsers: [], activeId: null })
  useEffect(() => {
    void api().browsers.state().then(set)
    return api().browsers.onChange(set)
  }, [])
  return s
}

export function useThumbnails() {
  const [t, set] = useState<Thumbnails>({})
  useEffect(() => {
    // İlk değer de isteniyor: açılışta gönderilen önizlemeler arayüz dinlemeye başlamadan gelmiş olabilir.
    void api().browsers.thumbnails().then(set)
    return api().browsers.onThumbnails(set)
  }, [])
  return t
}

let settingsCache: Settings | null = null
const settingsListeners = new Set<(s: Settings) => void>()
let settingsSubscribed = false
const publishSettings = (v: Settings) => settingsListeners.forEach((l) => l((settingsCache = v)))

export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const [s, set] = useState(settingsCache)
  useEffect(() => {
    settingsListeners.add(set)
    if (!settingsSubscribed) {
      // Ayar main'de değişince (arayüzden ya da agent'tan) bütün bileşenlere.
      settingsSubscribed = true
      api().settings.onChange(publishSettings)
      void api().settings.get().then(publishSettings)
    }
    return () => void settingsListeners.delete(set)
  }, [])
  const update = (patch: Partial<Settings>) => void api().settings.set(patch)
  return [s, update]
}

const modelCache = new Map<ModelCategory, Promise<ModelInfo[]>>()

export function useModels(category: ModelCategory) {
  const [list, set] = useState<ModelInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let p = modelCache.get(category)
    if (!p) {
      p = api().models.list(category)
      modelCache.set(category, p)
      p.catch(() => modelCache.delete(category))
    }
    p.then(set, (e: Error) => setError(e.message))
  }, [category])
  return { list, error }
}

export function useFiles() {
  const [files, set] = useState<FileEntry[]>([])
  useEffect(() => {
    const load = () => void api().files.list().then(set).catch(() => {})
    load()
    return api().files.onChange(load)
  }, [])
  return files
}

export function useBookmarks() {
  const [list, set] = useState<Bookmark[]>([])
  useEffect(() => {
    void api().bookmarks.list().then(set)
    return api().bookmarks.onChange(set)
  }, [])
  return list
}

export function useLogins() {
  const [list, set] = useState<SavedLogin[]>([])
  useEffect(() => {
    void api().passwords.list().then(set)
    return api().passwords.onChange(set)
  }, [])
  return list
}

export function useExtensions() {
  const [list, set] = useState<ExtensionInfo[]>([])
  useEffect(() => {
    void api().extensions.list().then(set)
    return api().extensions.onChange(set)
  }, [])
  return list
}

/** Sohbet listesi (çalışıyor / onay bekliyor bilgisiyle); ana sayfa ve üst şerit kullanıyor. */
export function useChats() {
  const [list, set] = useState<ChatSummary[]>([])
  useEffect(() => {
    void api().agent.chats().then(set)
    return api().agent.onChats(set)
  }, [])
  return list
}

/** Eklentiyle bağlanan Chrome profilleri (sekmeler ve eklentiler dahil). */
export function useChrome() {
  const [s, set] = useState<ChromeState | null>(null)
  useEffect(() => {
    void api().chrome.state().then(set)
    return api().chrome.onChange(set)
  }, [])
  return s
}

export function useDownloads() {
  const [list, set] = useState<Download[]>([])
  useEffect(() => {
    void api().downloads.list().then(set)
    return api().downloads.onChange(set)
  }, [])
  return list
}

export function useUpdate() {
  const [s, set] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => api().app.onUpdate(set), [])
  return [s, set] as const
}

/** Çalışma klasöründeki dosyanın arayüzdeki adresi (main'deki `share97-file` protokolü). */
export const fileUrl = (rel: string) => `share97-file://local/${rel.split('/').map(encodeURIComponent).join('/')}`

/** Sosyal hesaplar, sunucudaki akışlar ve cihazlar; ekran açılınca sunucudan tazeleniyor. */
export function useConnections() {
  const [s, set] = useState<ConnectionsState | null>(null)
  useEffect(() => {
    void api().connections.state().then(set)
    void api().connections.refresh().catch(() => {})
    return api().connections.onChange(set)
  }, [])
  return s
}

export function useActivity() {
  const [list, set] = useState<ActivityEntry[]>([])
  useEffect(() => {
    void api().activity.list().then(set)
    return api().activity.onChange(set)
  }, [])
  return list
}

/** IPC hatasının önündeki "Error invoking remote method…" kısmı kullanıcıya gösterilmiyor. */
export const errorText = (e: unknown) => String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
