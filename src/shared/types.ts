/** Main, preload ve renderer arasında taşınan veri biçimleri (yalnız tipler, kod yok). */

import type { ContentSettings, LocalContent } from './contents.ts'

/** Share97 hesabı (`GET /api/v1/worker/me`): paket, site kredisi, yapay zekâ bakiyesi ve bu cihaz (Worker). */
export type Account = {
  email: string | null
  name: string | null
  /** `free` | `pro` */
  plan: string
  /** Site kredisi: günlük hak, bugün kalan, satın alınmış ek kredi. Yapay zekâ harcaması da buradan düşüyor. */
  credits: { daily: number; remaining: number; extra: number; total: number; unlimited: boolean }
  /** Krediden bozdurulan yapay zekâ bakiyesi (USD), bir kredinin karşılığı ve sitenin marjı. */
  ai: { enabled: boolean; marginPercent: number; creditUsd: number; balanceUsd: number; canSpend: boolean }
  /** Paketin sınırları; `null` sınırsız. */
  limits: { maxAccounts: number | null; maxWorkflows: number | null }
  worker: { id: string; name: string } | null
}

export type AuthState = { status: 'signed-out' } | { status: 'connecting' } | { status: 'signed-in'; account: Account } | { status: 'error'; error: ConnectError }

/** Share97 Connect hataları + yerel hatalar. */
export type ConnectError = 'access_denied' | 'key-limit' | 'invalid-code' | 'state-mismatch' | 'timeout' | 'network'

/* ---------------- Bağlantılar: sosyal medya hesapları, Worker'lar, akışlar ---------------- */

/**
 * Bağlı sosyal medya hesabı. `via`: `api` resmî API (sunucudan yayınlanıyor), `worker` bir cihazdaki
 * oturum. `here`: oturum bu cihazda (`where`: uygulama tarayıcısı ya da Chrome). `group`: kullanıcının
 * verdiği grup adı (yerel).
 */
export type SocialAccount = {
  id: string
  platform: string
  handle: string
  name: string | null
  status: 'connected' | 'expired' | 'error'
  via: 'api' | 'worker'
  here: boolean
  where: 'app' | 'chrome' | null
  /** Agent'ın bu hesabı kullandığı tarayıcı (`chrome:<id>` ya da uygulama tarayıcısı). */
  browserId: string | null
  group: string
  /** Hesabı taşıyan cihazın (Worker) adı. */
  worker: string | null
}

type OverviewAccount = { id: string; platform: string; handle: string; status: string; via: string; seenAt: string | null }
type OverviewFlow = { id: string; name: string; slug: string; active: boolean; workerId: string | null }

/** Sunucudaki akışlar, sıradaki yuvalar, son çalışmalar ve bütün cihazlar (`GET /api/v1/worker/overview`). */
export type Overview = {
  /** Bu cihazın Worker kimliği. */
  me: string
  /** `content`: akışın içerik ayarları — kaynak (site / cihazdaki klasör), sıra, tekrar. */
  workflows: (OverviewFlow & { timezone: string; content: ContentSettings; lastRunAt: string | null; queued: number; nodes: string[] })[]
  upcoming: { at: number; workflowId: string; name: string }[]
  runs: { id: string; status: 'running' | 'success' | 'failed' | 'skipped'; error: string | null; startedAt: string; workflow: string; handle: string | null; permalink: string | null }[]
  workers: { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null; online: boolean; accounts: OverviewAccount[]; workflows: OverviewFlow[]; tasks: { id: string; name: string; lastRunAt: string | null; lastOk: boolean | null }[] }[]
  server: { accounts: OverviewAccount[]; workflows: OverviewFlow[] }
  unassigned: OverviewAccount[]
}

export type ConnectionsState = { accounts: SocialAccount[]; overview: Overview | null; error: string | null; syncedAt: number }

/** Başıboş işlerin günlüğü (sunucu işleri, Worker çalışmaları); `chatId`: işin sohbet süreci. */
export type ActivityEntry = { at: number; text: string; tone: 'info' | 'ok' | 'error'; chatId?: string }

/** Başıboş bir görevin (`Agent.task`) sonucu. `expired`: hesabın oturumu düşmüş. */
export type TaskResult = { ok: boolean; summary: string; permalink?: string; data?: string; expired?: boolean }

export type WorkerRun = { at: number; ms: number; ok: boolean; summary: string; chatId: string | null }

/**
 * **Worker tanımı**: bu cihazda **elle** çalıştırılan agent işi. Talimat, kullanacağı hesaplar ve model
 * (boşsa varsayılan sohbet modeli). Zamanlama yok: zamanı gelince çalışan iş bir akıştır. Her çalışma
 * bir sohbet süreci başlatır.
 */
export type WorkerDef = {
  id: string
  name: string
  prompt: string
  accountIds: string[]
  model: string | null
  createdAt: number
  lastRunAt: number | null
  runs: WorkerRun[]
  running: boolean
}
export type WorkerInput = Pick<WorkerDef, 'name' | 'prompt' | 'accountIds' | 'model'>

/* ---------------- Tarayıcılar: her biri tek çerez deposu, altında sekmeler ---------------- */

export type BrowserTab = {
  id: string
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Agent bu sekmede bir araç çalıştırıyor. */
  agent: boolean
  /** Ses çalıyor / sessize alınmış. */
  audible: boolean
  muted: boolean
  /** Yakınlaştırma (1 = %100). */
  zoom: number
}

/** Tarayıcı başına ayarlar; `null` varsayılan (sistem dili, doğrudan bağlantı, Chrome user agent). */
export type BrowserSettings = {
  /** Sitelere giden dil (Accept-Language) ve yazım denetimi, ör. `tr-TR`. */
  language: string | null
  /** `socks5://host:port`, `http://kullanıcı:şifre@host:port`. */
  proxy: string | null
  userAgent: string | null
  /** Yeni sekmede açılan sayfa. */
  homeUrl: string | null
}

/** Tarayıcı renkleri (şerit, kart, sekme çizgisi); kullanıcı panelden seçiyor. */
export const BROWSER_COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6', '#84cc16', '#6b7280']

export type BrowserInfo = {
  id: string
  /**
   * Chrome profili gibi: kapalı tarayıcının çerezleri, girişleri ve sekme adresleri duruyor ama
   * sayfaları yüklü değil (`tabs` boş). Açılınca sekmeleri geri geliyor.
   */
  open: boolean
  /** Kapalıyken saklanan sekme sayısı. */
  savedTabs: number
  /** Etkin (kapalıysa en son etkin) sekmenin adresi: ana sayfadaki kartta. */
  lastUrl: string | null
  /** Gizli tarayıcı: çerezler yalnız bellekte, geçmişe yazılmıyor, uygulama kapanınca siliniyor. */
  incognito: boolean
  settings: BrowserSettings
  name: string
  /** Kullanıcının (ya da agent'ın) bu tarayıcıya eklediği not. */
  note: string
  color: string
  tabs: BrowserTab[]
  activeTabId: string | null
}

/** `activeId === null`: ana sayfa ya da ayarlar (web görünümü gizli). */
export type BrowsersState = { browsers: BrowserInfo[]; activeId: string | null }

/** Tarayıcı kimliği → etkin sekmesinin canlı önizlemesi (data URL). */
export type Thumbnails = Record<string, string>

export type Bounds = { x: number; y: number; width: number; height: number }

/** Kayıtlı giriş; şifre bu tipte yok (renderer ve agent görmüyor). */
export type SavedLogin = { id: string; browserId: string; origin: string; username: string; ts: number }

export type ExtensionInfo = { id: string; name: string; version: string; path: string; error: string | null }

/* ---------------- Chrome: share97-chrome eklentisiyle bağlanan gerçek Chrome profilleri ---------------- */

export type ChromeTab = { id: number; windowId: number; index: number; title: string; url: string; favicon: string | null; active: boolean; pinned: boolean; audible: boolean; muted: boolean; incognito: boolean; loading: boolean }

export type ChromeWindow = { id: number; focused: boolean; incognito: boolean; tabs: ChromeTab[] }

/** Chrome'da kurulu bir eklenti (chrome.management). `self`: Share97 eklentisinin kendisi. */
export type ChromeExtension = { id: string; name: string; version: string; enabled: boolean; mayDisable: boolean; self: boolean; description: string; optionsUrl: string | null; installType: string }

/**
 * Eklentinin kurulu olduğu bir Chrome profili. `pending`: bağlandı, kullanıcı onayı bekliyor;
 * `offline`: onaylı ama şu an bağlı değil (Chrome kapalı). `agent`: agent bu Chrome'u kullanabilir.
 */
export type ChromeInstance = {
  id: string
  name: string
  status: 'connected' | 'pending' | 'offline'
  agent: boolean
  /** Eklentinin ve Chrome'un sürümü. */
  version: string
  chrome: string
  /** Uygulamanın taşıdığı eklenti sürümünden eski: yeniden yükleniyor. */
  outdated: boolean
  lastSeen: number
  windows: ChromeWindow[]
  extensions: ChromeExtension[]
}

export type ChromeState = {
  port: number
  /** Köprü dinliyor mu; dinleyemiyorsa sebebi (port başka uygulamada). */
  listening: boolean
  error: string | null
  /** Eklenti klasörü (Chrome'da "Paketlenmemiş öğe yükle" ile seçilen). */
  extensionPath: string
  instances: ChromeInstance[]
}

export type Bookmark = { id: string; title: string; url: string; ts: number }

export type Download = { id: string; name: string; path: string; url: string; state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'; received: number; total: number; ts: number }

/** Sayfada bul sonucu (Ctrl+F). */
export type FindResult = { matches: number; active: number }

export type HistoryEntry = { ts: number; browserId: string; browserName: string; url: string; title: string }

/* ---------------- Ayarlar ve modeller ---------------- */

export type Effort = 'off' | 'low' | 'medium' | 'high'

/** Açılıştaki otomatik güncelleme durumu (GitHub sürümleri). */
export type UpdateState = { status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error'; version?: string; percent?: number; error?: string }

export type Settings = {
  chatModel: string | null
  /** Ekran görüntüsü ve görselleri okuyan model (look_at_page, click_by_vision, read_file). */
  visionModel: string | null
  subagentModel: string | null
  imageModel: string | null
  videoModel: string | null
  speechModel: string | null
  effort: Effort
  /** `risky`: yalnız para harcatan / geri alınamayan eylemlerde sor. `all`: her tıklama ve yazmada sor. */
  approval: 'risky' | 'all'
  /** Uygulamanın teması; `system` Windows'u izliyor. */
  theme: 'system' | 'light' | 'dark'
  /** Pencere kapatılınca tepside çalışmaya devam et: sunucudan gelen akış işleri sürsün. */
  background: boolean
  /** Bilgisayar açılınca (gizli) başlat. */
  autostart: boolean
}

/** Sürekli çalışma (Windows güç ayarları, bkz. `main/power.ts`). */
export type PowerState = { supported: boolean; enabled: boolean; battery: boolean }

export type ModelCategory = 'text' | 'image' | 'video' | 'speech' | 'transcription'

export type ModelInfo = {
  id: string
  name: string
  category: string
  contextLength: number | null
  tools: boolean
  reasoning: boolean
  vision: boolean
  /** Gösterime hazır fiyat ("$3 / $15 · 1M token"). */
  price: string
  /** İlk fiyat satırı: USD ve birim (`image`, `second`, `mchar`, `mtok`...); varsayılan modeli en ucuzdan seçmek için. */
  unitPrice: number | null
  unit: string | null
}

/* ---------------- Sohbet ve agent ---------------- */

export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

export type Part =
  | { type: 'text'; text: string }
  /** `startedAt`/`ms`: düşünmenin ne kadar sürdüğü (canlıyken arayüz saniye sayıyor). */
  | { type: 'reasoning'; text: string; startedAt?: number; ms?: number }
  /**
   * `writing`: model aracın argümanlarını hâlâ yazıyor (büyük create_report gövdesi gibi); `args`
   * yazılanın sonu, `chars` uzunluğu. `slow`: araç uzun süredir çalışıyor (bekçi işaretliyor).
   */
  | { type: 'tool'; id: string; name: string; args: string; status: 'writing' | 'running' | 'done' | 'error'; result?: string; ms?: number; startedAt?: number; writeMs?: number; chars?: number; slow?: boolean }
  /** Bekçinin ya da bağlantının uyarısı (model yanıt vermiyor, MCP bağlanamadı...). */
  | { type: 'notice'; level: 'warn' | 'error'; text: string }
  | { type: 'todos'; items: Todo[] }
  | { type: 'subagent'; id: string; task: string; status: 'running' | 'done' | 'error'; activity: string; steps: number; summary?: string }
  | { type: 'approval'; id: string; text: string; status: 'pending' | 'approved' | 'rejected' }
  | { type: 'file'; path: string; name: string; kind: FileKind }

/** Mesajla birlikte işaretlenen sosyal hesaplar (sohbette rozet olarak görünür). */
export type AccountTag = { platform: string; handle: string }

/** `accounts`: kullanıcının bu mesaj için işaretlediği hesaplar; agent işi o hesapların tarayıcısında yapar. */
export type ChatMessage = { id: string; role: 'user' | 'assistant'; parts: Part[]; error?: string; accounts?: AccountTag[] }

export type Chat = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  model: string | null
  messages: ChatMessage[]
  costUsd: number
  running: boolean
  /** Agent çalışırken gönderilen mesajlar: sıradaki model adımında agent'a veriliyor (iş kesilmiyor). */
  queued: QueuedMessage[]
  /** Sohbette toplanan veri sayısı (`DataItem`; içerikleri ayrı istenir, sohbetle taşınmıyor). */
  dataCount: number
  /** Başıboş görev (Worker tanımı ya da sunucudan gelen akış işi): onaylar kendiliğinden veriliyor. */
  task?: boolean
}

/** `note`: modele mesajla birlikte giden bağlam (işaretlenen hesaplar ve tarayıcıları). */
export type QueuedMessage = { id: string; text: string; note?: string; accounts?: AccountTag[] }

/**
 * **Sohbet verisi.** Agent'ın bir sohbette topladığı her şey: araç sonuçları (sayfa okumaları,
 * tablolar, dosyalar), Google aramaları ve okunan sayfalar, oluşturulan raporların yapısı.
 * Kalıcı; agent her adımda dizinini görüyor ve LangChain vektör aramasıyla içinde arıyor.
 */
export type DataKind = 'search' | 'page' | 'tool' | 'report' | 'file'
export type DataItem = { id: string; kind: DataKind; title: string; source: string | null; content: string; ts: number }
export type DataSummary = Omit<DataItem, 'content'> & { size: number }

/** `pending`: agent bir onay bekliyor. */
export type ChatSummary = Pick<Chat, 'id' | 'title' | 'updatedAt' | 'running' | 'task'> & { pending: boolean }

/* ---------------- Çalışma klasörü (kullanıcı klasörü/share97-desktop) ---------------- */

export type FileKind = 'image' | 'audio' | 'video' | 'document'

export type FileEntry = { path: string; name: string; size: number; mtime: number; kind: FileKind }

/* ---------------- Preload yüzeyi ---------------- */

/** Renderer'ın işlediği kısayollar; geri kalanları (yenile, yakınlaştır, yazdır...) main doğrudan yapıyor. */
export type Shortcut = 'new-chat' | 'new-tab' | 'close-tab' | 'focus-address' | 'next-tab' | 'prev-tab' | 'new-browser' | 'find' | 'bookmark' | 'history' | 'downloads' | { tab: number }

/** Belgeler\Share97\Yedekler altındaki bir `.share97` dosyası. */
export type BackupEntry = { name: string; size: number; updatedAt: number }

export type Api = {
  auth: {
    state(): Promise<AuthState>
    connect(): Promise<AuthState>
    cancel(): Promise<void>
    signOut(): Promise<AuthState>
    refresh(): Promise<AuthState>
    onChange(cb: (s: AuthState) => void): () => void
  }
  connections: {
    state(): Promise<ConnectionsState>
    /** Sunucudan yeniden okur (hesaplar, akışlar, cihazlar); `force` olmadan son 5 saniyede okunduysa atlar. */
    refresh(force?: boolean): Promise<void>
    /** `chromeId` verilmezse hesaba özel bir uygulama tarayıcısı açılır ve giriş beklenir. */
    add(platform: string, handle: string, chromeId?: string): Promise<{ ok: boolean; error?: string }>
    cancelAdd(): Promise<void>
    relogin(id: string): Promise<{ ok: boolean; error?: string }>
    remove(id: string): Promise<void>
    open(id: string): Promise<void>
    setGroup(id: string, group: string): Promise<void>
    onChange(cb: (s: ConnectionsState) => void): () => void
  }
  /** Sunucudaki akışlar: web ile aynı kayıt, aynı kurallar. */
  workflows: {
    setActive(id: string, active: boolean): Promise<void>
    /** Akışın Worker hesaplarını yayınlayacak cihaz; `null` hesabın kendi cihazı. */
    setWorker(id: string, workerId: string | null): Promise<void>
    /** Sunucuda şimdi çalıştırır; dönen durum `success` | `failed` | `skipped`. */
    run(id: string): Promise<{ status: string; error: string | null }>
    /** İçerik ayarları (kaynak, sıra, tekrar). Kaynak bu cihazın klasörüyse `workerId` ile akış bu cihaza atanır. */
    setContent(id: string, content: ContentSettings, workerId?: string): Promise<void>
    /** Akışın bu cihazdaki içerik klasörleri (`workflow/<id>/contents/1, 2, 3…`) ve durumları. */
    contents(id: string): Promise<LocalContent[]>
    openContents(id: string): Promise<void>
    /** İçeriği bu cihazın klasöründen alan yeni bir taslak akış (klasörü örnek içerikle kurulur). */
    createLocal(name: string): Promise<void>
  }
  workers: {
    list(): Promise<WorkerDef[]>
    save(id: string | null, input: WorkerInput): Promise<string>
    remove(id: string): Promise<void>
    run(id: string): Promise<void>
    activity(): Promise<ActivityEntry[]>
    onChange(cb: (defs: WorkerDef[]) => void): () => void
    onActivity(cb: (list: ActivityEntry[]) => void): () => void
  }
  /** Share97 sitesini (faturalama, akış düzenleyicisi...) bu cihazın oturumuyla ayrı pencerede açar. */
  site: {
    open(path: string): Promise<void>
  }
  browsers: {
    state(): Promise<BrowsersState>
    create(name?: string, url?: string, incognito?: boolean): Promise<string>
    remove(id: string): Promise<void>
    update(id: string, patch: { name?: string; note?: string; color?: string }): Promise<void>
    /** Kapatır (çerezler ve sekmeler korunur); gizli tarayıcı kapanınca silinir. */
    close(id: string): Promise<void>
    activate(id: string | null): Promise<void>
    move(id: string, toIndex: number): Promise<void>
    openTab(browserId: string, url?: string): Promise<void>
    closeTab(browserId: string, tabId: string): Promise<void>
    activateTab(browserId: string, tabId: string): Promise<void>
    moveTab(browserId: string, tabId: string, toIndex: number): Promise<void>
    navigate(input: string): Promise<void>
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    stop(): Promise<void>
    setBounds(b: Bounds): Promise<void>
    find(text: string, forward: boolean): Promise<void>
    stopFind(): Promise<void>
    zoom(factor: number | null): Promise<void>
    tabMenu(browserId: string, tabId: string): Promise<void>
    reopenTab(): Promise<void>
    configure(id: string, patch: Partial<BrowserSettings>): Promise<BrowserSettings>
    translate(lang: string): Promise<void>
    testConnection(id: string): Promise<string>
    onFind(cb: (r: FindResult) => void): () => void
    onChange(cb: (s: BrowsersState) => void): () => void
    thumbnails(): Promise<Thumbnails>
    onThumbnails(cb: (t: Thumbnails) => void): () => void
    onShortcut(cb: (s: Shortcut) => void): () => void
  }
  history: {
    list(query: string, browserId: string | null): Promise<HistoryEntry[]>
    page(query: string, browserId: string | null, page: number): Promise<{ items: HistoryEntry[]; total: number; pageSize: number }>
    remove(ts: number, url: string): Promise<void>
    clear(): Promise<void>
    /** Adres çubuğu önerileri: yer imleri + geçmiş, tekilleştirilmiş. */
    suggest(query: string): Promise<{ title: string; url: string; bookmark: boolean }[]>
  }
  bookmarks: {
    list(): Promise<Bookmark[]>
    toggle(url: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    onChange(cb: (b: Bookmark[]) => void): () => void
  }
  downloads: {
    list(): Promise<Download[]>
    open(id: string): Promise<void>
    reveal(id: string): Promise<void>
    cancel(id: string): Promise<void>
    clear(): Promise<void>
    onChange(cb: (d: Download[]) => void): () => void
  }
  power: {
    get(): Promise<PowerState>
    set(on: boolean, battery: boolean): Promise<PowerState>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    onChange(cb: (s: Settings) => void): () => void
  }
  models: {
    list(category: ModelCategory): Promise<ModelInfo[]>
  }
  agent: {
    chats(): Promise<ChatSummary[]>
    chat(id: string): Promise<Chat | null>
    create(): Promise<string>
    remove(id: string): Promise<void>
    /** `accountIds`: bu mesaj için işaretlenen sosyal hesaplar; agent her birinde kendi tarayıcısında (ya da Chrome'unda) çalışır. */
    send(chatId: string, text: string, accountIds?: string[]): Promise<void>
    /** Durdurur; kuyruktaki (gönderilmemiş) mesajları döndürür. */
    stop(chatId: string): Promise<string[]>
    approve(approvalId: string, ok: boolean): Promise<void>
    rename(chatId: string, title: string): Promise<void>
    /** Başlıkta ya da mesajlarda geçen sohbetler. */
    search(query: string): Promise<ChatSummary[]>
    /** Kuyruktaki mesajı geri al. */
    unqueue(chatId: string, id: string): Promise<void>
    data(chatId: string): Promise<DataSummary[]>
    dataItem(chatId: string, id: string): Promise<DataItem | null>
    /** Sohbete sağ tık > "Sohbet verileri". */
    onShowData(cb: (chatId: string) => void): () => void
    onChat(cb: (c: Chat) => void): () => void
    onChats(cb: (c: ChatSummary[]) => void): () => void
  }
  passwords: {
    list(): Promise<SavedLogin[]>
    /** Etkin sekmenin sitesindeki kayıtlar. */
    forCurrent(): Promise<SavedLogin[]>
    saveCurrent(username: string, password: string): Promise<SavedLogin>
    fillCurrent(id: string): Promise<string>
    remove(id: string): Promise<void>
    onChange(cb: (l: SavedLogin[]) => void): () => void
  }
  extensions: {
    list(): Promise<ExtensionInfo[]>
    add(): Promise<ExtensionInfo | null>
    remove(path: string): Promise<void>
    onChange(cb: (list: ExtensionInfo[]) => void): () => void
  }
  chrome: {
    state(): Promise<ChromeState>
    approve(id: string): Promise<void>
    reject(id: string): Promise<void>
    forget(id: string): Promise<void>
    rename(id: string, name: string): Promise<void>
    setAgent(id: string, on: boolean): Promise<void>
    openTab(id: string, url: string): Promise<void>
    activateTab(id: string, tabId: number): Promise<void>
    closeTab(id: string, tabId: number): Promise<void>
    setExtensionEnabled(id: string, extensionId: string, enabled: boolean): Promise<void>
    uninstallExtension(id: string, extensionId: string): Promise<void>
    extensionOptions(id: string, extensionId: string): Promise<void>
    /** Kurulum: eklenti klasörünü Gezgin'de açar. */
    openFolder(): Promise<void>
    /** Kurulum: Chrome'da chrome://extensions sayfasını açar; Chrome bulunamazsa `false`. */
    openChromeExtensions(): Promise<boolean>
    onChange(cb: (s: ChromeState) => void): () => void
  }
  app: {
    version(): Promise<string>
    update(): Promise<UpdateState>
    installUpdate(): Promise<void>
    onUpdate(cb: (s: UpdateState) => void): () => void
    /** Bildirime tıklandı: o sohbeti aç. */
    onOpenChat(cb: (chatId: string) => void): () => void
  }
  backups: {
    list(): Promise<BackupEntry[]>
    create(): Promise<string>
    /** Var olan yedeği bugünkü ayarlarla günceller. */
    update(name: string): Promise<void>
    /** Önce bugünkü durumu yedekler, sonra geri yükler ve uygulamayı yeniden başlatır. */
    restore(name: string): Promise<void>
    /** Başka yerdeki bir .share97 dosyasını yedek klasörüne kopyalar; iptalde null. */
    importFile(): Promise<string | null>
    reveal(name: string): Promise<void>
    remove(name: string): Promise<void>
    openFolder(): Promise<void>
    folder(): Promise<string>
  }
  files: {
    list(): Promise<FileEntry[]>
    open(path: string): Promise<void>
    reveal(path: string): Promise<void>
    openFolder(): Promise<void>
    /** Bilgisayardan dosya seçip çalışma klasörüne (uploads/) kopyalar. */
    importFiles(): Promise<string[]>
    /** Sürüklenen ya da yapıştırılan dosya: uploads/ altına yazar, çalışma klasöründeki yolunu döndürür. */
    saveUpload(name: string, data: Uint8Array): Promise<string>
    copy(path: string): Promise<void>
    remove(path: string): Promise<void>
    /** `dragstart` içinde çağrılır: dosya sayfaya / Gezgin'e sürüklenir. */
    drag(path: string): void
    onChange(cb: () => void): () => void
  }
}
