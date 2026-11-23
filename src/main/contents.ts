import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { shell } from 'electron'
import { ChatOpenAI } from '@langchain/openai'
import type { FlowTemplate, Overview } from '../shared/types.ts'
import { cleanHandle, platformOf } from '../shared/platforms.ts'
import { contentWarnings, mediaName, MAX_CAPTION, MAX_MEDIA, resultNote, stalePublishing, generationMessages, isContentFolder, MAX_GENERATE, nextFolder, parseGenerated, parseLocalUrl, parseStatus, pickContent, statusText, type ContentSettings, type ContentStatus, type GenerateInput, type LocalContent, type LocalMedia } from '../shared/contents.ts'
import { apiKey, server } from './auth.ts'
import { IMAGE_MODEL } from './auto.ts'
import { AI_BASE, apiJson } from './gateway.ts'
import { DEFAULT_MODEL, settings } from './settings.ts'
import { inside, kindOf, safeName } from './paths.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import { L } from './strings.ts'
import * as ws from './workspace.ts'

/**
 * **Hesap içerikleri** (saf kısmı `shared/contents.ts`). İçerik akışta değil hesapta durur, yalnız cihazda: bu cihazda
 * oturumu olan her sosyal hesabın çalışma klasöründe kendi alanı var:
 *   `accounts/<kullanıcı adı>/<platform>/account.txt`     profil, içerik ve yazım istemi (prompt); yoksa LangChain yazar
 *   `accounts/<kullanıcı adı>/<platform>/contents/1, 2…`  numaralı içerik klasörleri (content.txt, image.*, video.*, status.txt)
 * Akışta içerik bir düğümdür (`queue` "Hesap içeriği" ya da `generate`): düğümde seçilen hesabın klasöründen alır ya da
 * ona üretir; çıkışı bir yayın düğümüne ya da agent'a bağlanır (`runner.ts`). Yayını agent yapar, sonucu `status.txt`e yazar.
 */

export type ContentAccount = { id: string; platform: string; handle: string }

const STATUS = 'status.txt'
const README = 'README.txt'
const PROFILE = 'account.txt'

/** Hesabın alanı, çalışma klasörüne göre (agent'ın dosya araçları bu yolu kullanıyor). */
export const accountRel = (l: Pick<ContentAccount, 'platform' | 'handle'>) => `accounts/${safeName(cleanHandle(l.handle))}/${safeName(l.platform)}`
/** Hesabın `contents` klasörü (ya da içindeki bir içerik), çalışma klasörüne göre. */
export const contentsRel = (l: ContentAccount, folder?: string) => {
  if (folder !== undefined && !isContentFolder(folder)) throw new Error('bad-argument')
  return [accountRel(l), 'contents', ...(folder === undefined ? [] : [folder])].join('/')
}
const dir = (l: ContentAccount, folder?: string) => join(ws.root(), contentsRel(l, folder))

const readme = (l: ContentAccount) =>
  [
    `Share97 Desktop - contents of @${l.handle} (${platformOf(l.platform)?.label ?? l.platform})`,
    '',
    'One numbered folder per content: 1, 2, 3, 4, 5, 6 ...',
    'Inside each folder:',
    '  - content.txt   the post text',
    '  - image.jpg     the image to upload (several: image-1.jpg, image-2.jpg ...; png, webp, gif too)',
    '  - video.mp4     the video to upload (several: video-1.mp4 ...; mov, webm too)',
    '  - status.txt    the state of that content',
    '',
    'status.txt (first line): pending (waiting), publishing, published (never taken again), failed (reason on line 2).',
    'To share a content again, write "pending" into its status.txt.',
    '',
    '../account.txt describes the profile, the content and the prompt used to write new posts for this account.',
    'Workflows use this folder through an "Account content" step; the chat agent plans posts per day from it.',
    '',
    '---',
    'Her içerik numaralı bir klasördür (1, 2, 3 …): metin (content.txt), görseller ya da videolar ve durumu gösteren',
    'status.txt. ../account.txt profilin, içeriğin ve yazım isteminin özetidir. Akışlar bu klasörü "Hesap içeriği"',
    'adımıyla kullanır.',
    '',
  ].join('\r\n')

/** Hesabın alanını kurar (`contents/` ve `README.txt`); dönüş: `contents` klasörünün tam yolu. */
export async function ensureContents(l: ContentAccount) {
  const root = dir(l)
  if (!existsSync(root)) {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, README), readme(l))
  }
  return root
}

/** Bir içerik klasörü (`contents` klasörünün tam yolu + numara). */
async function readAt(contents: string, folder: string): Promise<LocalContent> {
  const root = join(contents, folder)
  const entries = await readdir(root, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const texts = files.filter((f) => /\.txt$/i.test(f) && f.toLowerCase() !== STATUS)
  const text = texts.find((f) => f.toLowerCase() === 'content.txt') ?? texts[0]
  const caption = text ? (await readFile(join(root, text), 'utf8')).replace(/^﻿/, '').trim() : ''
  const media = files.flatMap((file): LocalMedia[] => {
    const kind = kindOf(file)
    return kind === 'image' || kind === 'video' ? [{ file, kind }] : []
  })
  const status = files.includes(STATUS) ? parseStatus(await readFile(join(root, STATUS), 'utf8')) : parseStatus('')
  return { folder, caption, media, ...status, warnings: contentWarnings({ caption: caption.length, media: media.length, texts: texts.length, dirs: entries.filter((e) => e.isDirectory()).length }) }
}
const readContent = (l: ContentAccount, folder: string) => readAt(dir(l), folder)

/** Hesabın içerikleri, klasör numarasına göre. Klasör yoksa boş. */
export async function listContents(l: ContentAccount): Promise<LocalContent[]> {
  const root = dir(l)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((e) => e.isDirectory() && isContentFolder(e.name)).map((e) => e.name).sort((a, b) => Number(a) - Number(b))
  return Promise.all(folders.map((f) => readAt(root, f)))
}

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')

export async function setContentStatus(l: ContentAccount, folder: string, status: ContentStatus, note = '') {
  await writeFile(join(dir(l, folder), STATUS), statusText(status, `${stamp()} ${note}`.trim()))
  ws.changed()
}

/**
 * Akışın istediği sıradaki içerik: seçilir ve `publishing` yazılır (aynı içerik ikinci bir çalışmaya
 * verilmesin). Boş içerik (metni de dosyası da yok) `failed` yazılıp atlanır. `null`: içerik kalmadı.
 */
export async function takeContent(l: ContentAccount, o: Pick<ContentSettings, 'order' | 'repeat'>): Promise<Pick<LocalContent, 'folder' | 'caption' | 'media'> | null> {
  for (;;) {
    const items = await listContents(l)
    const { pick, restart } = pickContent(items, o)
    if (!pick) return null
    if (restart) for (const i of items) if (i.status === 'published') await setContentStatus(l, i.folder, 'pending', 'started over')
    if (!pick.caption && !pick.media.length) {
      await setContentStatus(l, pick.folder, 'failed', 'the folder has no text file and no image or video')
      continue
    }
    await setContentStatus(l, pick.folder, 'publishing')
    return { folder: pick.folder, caption: pick.caption.slice(0, MAX_CAPTION), media: pick.media.slice(0, MAX_MEDIA) }
  }
}

/** Bir hesabın yayın sonucu `status.txt`e; birden çok hesabın sonuçları aynı notta birikir (bkz. `resultNote`). */
export async function finishContent(l: ContentAccount, folder: string, handle: string, ok: boolean, detail: string) {
  const prev = await readContent(l, folder).catch(() => null)
  if (!prev) return
  const next = resultNote(prev, handle, ok, detail)
  await setContentStatus(l, folder, next.status, next.note).catch(() => {})
}

/** İçeriği yeniden sıraya alır (`pending`): düşen, takılan ya da yeniden paylaşılmak istenen içerik. */
export const requeueContent = (l: ContentAccount, folder: string) => setContentStatus(l, folder, 'pending', 'queued again')

/** `publishing`de takılan içerikler `failed`e çekilir: kullanıcı hesabı kontrol edip yeniden sıraya alır (kendiliğinden yeniden paylaşmak çift gönderi riski). */
async function recoverStale(l: ContentAccount) {
  for (const i of await listContents(l)) if (stalePublishing(i)) await setContentStatus(l, i.folder, 'failed', 'interrupted before the result was known: check the account, then queue it again')
}

/**
 * Yeni içerik: sıradaki numaralı klasör, metin (`content.txt`) ve seçilen görseller/videolar (standart adlarla
 * kopyalanır, bkz. `mediaName`), durumu `pending`. Dönüş: klasör numarası.
 */
export async function addContent(l: ContentAccount, caption: string, files: string[]): Promise<string> {
  const media = files.filter((f) => ['image', 'video'].includes(kindOf(f)))
  if (!caption.trim() && !media.length) throw new Error('Write a text or choose an image or video.')
  const root = await ensureContents(l)
  const folder = nextFolder((await readdir(root)).filter(isContentFolder))
  await mkdir(join(root, folder))
  if (caption.trim()) await writeFile(join(root, folder, 'content.txt'), `${caption.trim()}\r\n`)
  for (const kind of ['image', 'video'] as const) {
    const same = media.filter((f) => kindOf(f) === kind)
    for (const [i, f] of same.entries()) await copyFile(f, join(root, folder, mediaName(kind, i, same.length, extname(f))))
  }
  await writeFile(join(root, folder, STATUS), statusText('pending', `${stamp()} added in the app`))
  ws.changed()
  return folder
}

/** Yayın işinin `local:` adresli medyası → çalışma klasörüne göre dosya yolları (agent `upload_files` ile yüklüyor). */
export function contentFiles(l: ContentAccount, folder: string, urls: string[]): string[] {
  const root = dir(l, folder)
  return urls.map((url) => {
    const ref = parseLocalUrl(url)
    const full = ref && ref.folder === folder ? inside(root, ref.file) : null
    if (!full || !existsSync(full)) throw new Error(`content file is missing: ${url}`)
    return ws.rel(full)
  })
}

/**
 * **`account.txt`**: hesabın profili, içerik özellikleri ve yazım istemi. Yoksa LangChain (Share97 geçidindeki sohbet
 * modeli) yazar. `notes`: agent'ın profil sayfasından okuduğu bilgiler (bio, son gönderiler, kitle) — yazının gerçeklere
 * dayanan kısmı bunlar. `content` verilirse dosya onunla değiştirilir (kullanıcı ya da agent düzeltti).
 */
export async function accountProfile(l: ContentAccount, o: { notes?: string; content?: string; name?: string | null; group?: string } = {}): Promise<{ text: string; created: boolean }> {
  await ensureContents(l)
  const file = join(ws.root(), accountRel(l), PROFILE)
  if (o.content?.trim()) {
    await writeFile(file, `${o.content.trim()}\r\n`)
    ws.changed()
    return { text: o.content.trim(), created: false }
  }
  if (existsSync(file)) return { text: (await readFile(file, 'utf8')).replace(/^﻿/, '').trim(), created: false }
  const label = platformOf(l.platform)?.label ?? l.platform
  const model = new ChatOpenAI({ model: settings().chatModel ?? DEFAULT_MODEL, apiKey: apiKey() ?? '', maxRetries: 2, timeout: 120_000, configuration: { baseURL: AI_BASE } })
  const res = await model.invoke([
    [
      'system',
      [
        'You write account.txt, the brief a social media manager keeps for one account. Plain text with exactly these three section headings:',
        'PROFILE: who the account is, niche, audience, language, tone of voice, what to avoid.',
        `CONTENT: content pillars and topics, the mix of formats (text, image, video/mp4) that fits ${label}, caption length, hashtag and emoji style, calls to action.`,
        'PROMPT: a reusable instruction to write one post for this account, then one for its image and one for its short video.',
        'Use the profile notes as the only facts. Never invent prices, numbers or claims; where something is unknown, write a sensible default and mark it "(to confirm)".',
        'Write in the language of the profile notes; without notes, in English.',
      ].join('\n'),
    ],
    ['human', [`Platform: ${label}`, `Handle: @${l.handle}`, o.name ? `Name: ${o.name}` : '', o.group ? `Group / client: ${o.group}` : '', o.notes?.trim() ? `Profile notes:\n${o.notes.trim().slice(0, 6000)}` : 'No profile notes.'].filter(Boolean).join('\n')],
  ])
  const text = res.text.trim()
  if (!text) throw new Error('The model returned an empty account.txt. Try again.')
  await writeFile(file, `${text}\r\n`)
  ws.changed()
  return { text, created: true }
}

/**
 * **Hesaptan içerik üretimi.** Hesabın `account.txt`i (yoksa önce yazılır) ve isteğe bağlı örnek içerik (`from`) ya da konu
 * ile hesabın klasörüne yeni numaralı içerikler: metin (`content.txt`), istenirse bir görsel (`image.png`) ve `pending`
 * durumu. Metin ve görsel Share97 geçidiyle üretilir (bedeli bakiyeden). Dönüş: yazılan içerik klasörleri.
 */
export async function generateContents(l: ContentAccount, raw: unknown): Promise<string[]> {
  const r = (raw ?? {}) as Partial<Record<keyof GenerateInput, unknown>>
  const from = typeof r.from === 'string' && isContentFolder(r.from) ? r.from : null
  const topic = typeof r.topic === 'string' ? r.topic.slice(0, 2000) : ''
  const count = Math.min(MAX_GENERATE, Math.max(1, Math.round(Number(r.count)) || 1))
  const source = from ? (await readContent(l, from)).caption : null
  const brief = (await accountProfile(l)).text

  const chat = await apiJson<{ choices?: { message?: { content?: string } }[] }>('chat/completions', { model: settings().chatModel ?? DEFAULT_MODEL, response_format: { type: 'json_object' }, messages: generationMessages({ count, topic, source, brief }) })
  const posts = parseGenerated(chat.choices?.[0]?.message?.content ?? '', count)
  if (!posts.length) throw new Error('The model returned no usable post. Try again or choose another chat model in Settings.')

  const root = await ensureContents(l)
  const made: string[] = []
  for (const post of posts) {
    // Görsel önce üretilir: düşerse yarım (görselsiz) bir içerik klasörü kalmaz.
    let image: Uint8Array | null = null
    if (r.withImage === true) {
      const img = await apiJson<{ data?: { url?: string; b64_json?: string }[] }>('images/generations', { model: settings().imageModel ?? IMAGE_MODEL, prompt: post.imagePrompt || post.caption.slice(0, 500), n: 1 })
      const first = img.data?.[0]
      image = first?.b64_json ? Buffer.from(first.b64_json, 'base64') : first?.url ? new Uint8Array(await (await fetch(first.url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()) : null
      if (!image?.length) throw new Error(`The image model returned no image (${made.length} content(s) were created).`)
    }
    const number = nextFolder((await readdir(root)).filter(isContentFolder))
    const folder = join(root, number)
    await mkdir(folder)
    await writeFile(join(folder, 'content.txt'), `${post.caption}\r\n`)
    if (image) await writeFile(join(folder, 'image.png'), image)
    await writeFile(join(folder, STATUS), statusText('pending', `${stamp()} generated${from ? ` from ${from}` : ''}`))
    made.push(number)
  }
  ws.changed()
  return made
}

export const openContents = async (l: ContentAccount) => void (await shell.openPath(await ensureContents(l)))

/* ---------------- Eşitleme ---------------- */

/** Sunucuda bu cihaza atanmış, cihazdaki hesaplarla dolu, durdurulmuş hazır bir akış açar (`template`, bkz. `shared/types.ts`). */
export const createLocalWorkflow = (name: string, template: FlowTemplate = 'post') =>
  server<{ id: string }>('/api/v1/worker/workflows', { body: { name, template, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })
const file = () => dataPath('workflows.json')

/**
 * Her hesap eşitlemesinde: bu cihazdaki her hesabın alanı kurulur, `publishing`de takılan içerikler `failed`e çekilir.
 * Hesapta hiç akış yoksa bir kez **örnek akış** açılır (durdurulmuş taslak, bu cihaza atanmış). Dönüş: örnek akış açıldı,
 * genel bakış yeniden okunmalı.
 */
export async function syncContents(ov: Overview, locals: ContentAccount[]): Promise<boolean> {
  for (const l of locals)
    await ensureContents(l)
      .then(() => recoverStale(l))
      .catch((e) => console.error('[contents]', (e as Error).message))
  if (ov.workflows.length || readJson<{ example?: boolean }>(file(), {}).example) return false
  // Bir kez denenir: paket sınırı doluysa ya da kullanıcı örneği sildiyse yeniden açılmaz.
  writeJson(file(), { example: true })
  return createLocalWorkflow(L().example).then(
    () => true,
    () => false,
  )
}
