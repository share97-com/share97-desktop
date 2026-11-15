import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import type { Overview } from '../shared/types.ts'
import { EXAMPLE_NOTE, generationMessages, isContentFolder, isExample, isWorkflowId, MAX_GENERATE, nextFolder, parseGenerated, parseLocalUrl, parseStatus, pickContent, statusText, type ContentSettings, type ContentStatus, type GenerateInput, type LocalContent, type LocalMedia } from '../shared/contents.ts'
import { server } from './auth.ts'
import { IMAGE_MODEL } from './auto.ts'
import { apiJson } from './gateway.ts'
import { DEFAULT_MODEL, settings } from './settings.ts'
import { inside, kindOf } from './paths.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import * as ws from './workspace.ts'

/**
 * **Akışların yerel içerikleri** (bkz. `shared/contents.ts`). İçerik yalnız cihazda duruyor: bu cihaza
 * atanmış her akışın bir klasörü var: `<çalışma klasörü>/workflow/<akış kimliği>/contents/1, 2, 3…`.
 * Akış çalışınca sunucu sıradaki içeriği buradan istiyor (`takeContent`); yayını yine bu cihazdaki agent
 * yapıyor ve sonucu klasörün `status.txt`ine yazıyor. Dosyalar cihazdan çıkmıyor.
 */

const STATUS = 'status.txt'
const README = 'README.txt'

/** Çalışma klasörüne göre yol (agent'ın dosya araçları bu yolu kullanıyor). */
export const contentsRel = (workflowId: string, folder?: string) => {
  if (!isWorkflowId(workflowId) || (folder !== undefined && !isContentFolder(folder))) throw new Error('bad-argument')
  return ['workflow', workflowId, 'contents', ...(folder === undefined ? [] : [folder])].join('/')
}
const dir = (workflowId: string, folder?: string) => join(ws.root(), contentsRel(workflowId, folder))

const readme = (name: string) =>
  [
    `Share97 Desktop - local contents of the workflow "${name}"`,
    '',
    'One numbered folder per content: 1, 2, 3, 4, 5, 6 ...',
    'Inside each folder:',
    '  - one .txt file with the post text (for example content.txt)',
    '  - the images or videos to upload (jpg, png, webp, gif, mp4, mov, webm)',
    '  - status.txt with the state of that content',
    '',
    'status.txt (first line):',
    '  pending     waiting to be shared (a folder without status.txt is pending too)',
    '  publishing  handed to the workflow, the post is being published',
    '  published   shared; it is never taken again',
    '  failed      publishing failed; the reason is on the second line',
    'To share a content again, write "pending" into its status.txt.',
    '',
    'The order (in order or random) and "start over when everything has been shared"',
    'are settings of the workflow. Folder 1 is a complete example (text, image, video) and is',
    'already "published", so it is never shared: copy it, or use "Generate content" in the app.',
    '',
    '---',
    'Her içerik numaralı bir klasördür: 1, 2, 3, 4, 5, 6 ...',
    'Klasörün içinde: paylaşım metni (.txt), yüklenecek görseller ya da videolar ve içeriğin durumunu',
    'gösteren status.txt bulunur. Durumlar: pending (bekliyor), publishing (yayınlanıyor),',
    'published (paylaşıldı, bir daha alınmaz), failed (yayın düştü). Bir içeriği yeniden paylaşmak için',
    'status.txt dosyasına "pending" yaz. Sıra ve tekrar akışın ayarlarındadır. 1 numaralı klasör örnektir.',
    '',
  ].join('\r\n')

const EXAMPLES = join(import.meta.dirname, '../../resources/examples')

/**
 * `1` numaralı klasör baştan sona örnek: metin, bir görsel, bir video ve `status.txt` (`published`: hiç
 * paylaşılmaz). Eksik dosyası tamamlanır; kullanıcının değiştirdiği dosyaya dokunulmaz.
 */
async function writeExample(root: string) {
  const dir = join(root, '1')
  await mkdir(dir, { recursive: true })
  const put = async (name: string, write: (to: string) => Promise<void>) => existsSync(join(dir, name)) || (await write(join(dir, name)))
  await put('content.txt', (to) => writeFile(to, 'This folder is an example of one content: this text file is the post text, example-image.jpg and example-video.mp4 are the files that get uploaded, and status.txt holds the state.\r\n\r\nFor your own content, create the next numbered folder (2, 3, 4 ...), put the text and the images or videos in it, and leave status.txt out or write "pending" into it. #share97\r\n'))
  for (const f of ['example-image.jpg', 'example-video.mp4']) await put(f, (to) => copyFile(join(EXAMPLES, f), to))
  await put(STATUS, (to) => writeFile(to, statusText('published', EXAMPLE_NOTE)))
}

/** Akışın klasörünü kurar; ilk kez kuruluyorsa içine örnek içeriği (`1`) ve `README.txt`i koyar. */
export async function ensureContents(workflowId: string, name: string) {
  const root = dir(workflowId)
  if (!existsSync(root)) {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, README), readme(name))
    await writeExample(root)
  } else {
    // Eski sürümün yalnız metinli örneği tamamlanır.
    const one = await readContent(workflowId, '1').catch(() => null)
    if (one && isExample(one)) await writeExample(root)
  }
  return root
}

async function readContent(workflowId: string, folder: string): Promise<LocalContent> {
  const root = dir(workflowId, folder)
  const files = (await readdir(root, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const text = files.find((f) => f.toLowerCase() === 'content.txt') ?? files.find((f) => /\.txt$/i.test(f) && f.toLowerCase() !== STATUS)
  const caption = text ? (await readFile(join(root, text), 'utf8')).replace(/^﻿/, '').trim() : ''
  const media = files.flatMap((file): LocalMedia[] => {
    const kind = kindOf(file)
    return kind === 'image' || kind === 'video' ? [{ file, kind }] : []
  })
  const status = files.includes(STATUS) ? parseStatus(await readFile(join(root, STATUS), 'utf8')) : parseStatus('')
  return { folder, caption, media, ...status }
}

/** Akışın içerikleri, klasör numarasına göre. Klasör yoksa boş. */
export async function listContents(workflowId: string): Promise<LocalContent[]> {
  const entries = await readdir(dir(workflowId), { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((e) => e.isDirectory() && isContentFolder(e.name)).map((e) => e.name).sort((a, b) => Number(a) - Number(b))
  return Promise.all(folders.map((f) => readContent(workflowId, f)))
}

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')

export async function setContentStatus(workflowId: string, folder: string, status: ContentStatus, note = '') {
  await writeFile(join(dir(workflowId, folder), STATUS), statusText(status, `${stamp()} ${note}`.trim()))
  ws.changed()
}

/**
 * Akışın istediği sıradaki içerik: seçilir ve `publishing` yazılır (aynı içerik ikinci bir çalışmaya
 * verilmesin). Boş içerik (metni de dosyası da yok) `failed` yazılıp atlanır. `null`: içerik kalmadı.
 */
export async function takeContent(workflowId: string, o: Pick<ContentSettings, 'order' | 'repeat'>): Promise<Pick<LocalContent, 'folder' | 'caption' | 'media'> | null> {
  for (;;) {
    const items = await listContents(workflowId)
    const { pick, restart } = pickContent(items, o)
    if (!pick) return null
    if (restart) for (const i of items) if (i.status === 'published' && !isExample(i)) await setContentStatus(workflowId, i.folder, 'pending', 'started over')
    if (!pick.caption && !pick.media.length) {
      await setContentStatus(workflowId, pick.folder, 'failed', 'the folder has no text file and no image or video')
      continue
    }
    await setContentStatus(workflowId, pick.folder, 'publishing')
    return { folder: pick.folder, caption: pick.caption.slice(0, 5000), media: pick.media.slice(0, 20) }
  }
}

/** Yayın işinin sonucu `status.txt`e. Başka bir hesapta paylaşılmış içerik sonraki hatayla `failed`e düşmüyor. */
export async function finishContent(workflowId: string, folder: string, ok: boolean, note: string) {
  if (!ok && (await readContent(workflowId, folder).catch(() => null))?.status === 'published') return
  await setContentStatus(workflowId, folder, ok ? 'published' : 'failed', note).catch(() => {})
}

/** Yayın işinin `local:` adresli medyası → çalışma klasörüne göre dosya yolları (agent `upload_files` ile yüklüyor). */
export function contentFiles(workflowId: string, folder: string, urls: string[]): string[] {
  const root = dir(workflowId, folder)
  return urls.map((url) => {
    const ref = parseLocalUrl(url)
    const full = ref && ref.folder === folder ? inside(root, ref.file) : null
    if (!full || !existsSync(full)) throw new Error(`content file is missing: ${url}`)
    return ws.rel(full)
  })
}

/**
 * **Yapay zekâ ile içerik üretimi.** Bir içerik örnek alınarak (`from`) ya da yalnız konudan, akışın klasörüne
 * yeni numaralı içerikler yazılır: metin (`content.txt`), istenirse bir görsel (`image.png`) ve `pending`
 * durumu. Her biri özgün bir paylaşımdır (bkz. `generationMessages`). Metin ve görsel Share97 geçidiyle
 * üretilir (bedeli krediden). Dönüş: yazılan içerik sayısı.
 */
export async function generateContents(workflowId: string, name: string, raw: unknown): Promise<number> {
  const r = (raw ?? {}) as Partial<Record<keyof GenerateInput, unknown>>
  const from = typeof r.from === 'string' && isContentFolder(r.from) ? r.from : null
  const topic = typeof r.topic === 'string' ? r.topic.slice(0, 2000) : ''
  const count = Math.min(MAX_GENERATE, Math.max(1, Math.round(Number(r.count)) || 1))
  const source = from ? (await readContent(workflowId, from)).caption : null
  if (!source && !topic.trim()) throw new Error('Write a topic or choose a content to start from.')

  const chat = await apiJson<{ choices?: { message?: { content?: string } }[] }>('chat/completions', { model: settings().chatModel ?? DEFAULT_MODEL, response_format: { type: 'json_object' }, messages: generationMessages({ count, topic, source }) })
  const posts = parseGenerated(chat.choices?.[0]?.message?.content ?? '', count)
  if (!posts.length) throw new Error('The model returned no usable post. Try again or choose another chat model in Settings.')

  const root = await ensureContents(workflowId, name)
  let made = 0
  for (const post of posts) {
    // Görsel önce üretilir: düşerse yarım (görselsiz) bir içerik klasörü kalmaz.
    let image: Uint8Array | null = null
    if (r.withImage === true) {
      const img = await apiJson<{ data?: { url?: string; b64_json?: string }[] }>('images/generations', { model: settings().imageModel ?? IMAGE_MODEL, prompt: post.imagePrompt || post.caption.slice(0, 500), n: 1 })
      const first = img.data?.[0]
      image = first?.b64_json ? Buffer.from(first.b64_json, 'base64') : first?.url ? new Uint8Array(await (await fetch(first.url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()) : null
      if (!image?.length) throw new Error(`The image model returned no image (${made} content(s) were created).`)
    }
    const folder = join(root, nextFolder((await readdir(root)).filter(isContentFolder)))
    await mkdir(folder)
    await writeFile(join(folder, 'content.txt'), `${post.caption}\r\n`)
    if (image) await writeFile(join(folder, 'image.png'), image)
    await writeFile(join(folder, STATUS), statusText('pending', `${stamp()} generated${from ? ` from ${from}` : ''}`))
    made++
  }
  ws.changed()
  return made
}

export const openContents = async (workflowId: string, name: string) => void (await shell.openPath(await ensureContents(workflowId, name)))

/* ---------------- Eşitleme ---------------- */

const EXAMPLE_NAME = 'Example workflow'

/** Sunucuda bu cihaza atanmış, durdurulmuş bir taslak akış açar; içerik klasörü bir sonraki eşitlemede kurulur. */
export const createLocalWorkflow = (name: string) => server('/api/v1/worker/workflows', { body: { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })
const file = () => dataPath('workflows.json')

/**
 * Sunucudaki akışlarla bu cihazın klasörlerini eşitler (her hesap eşitlemesinde ve "Eşitle" düğmesiyle):
 * bu cihaza atanmış, kuyruktan içerik alan her akışın klasörü kurulur. Hesapta hiç akış yoksa bir kez
 * **örnek akış** açılır (durdurulmuş taslak, bu cihaza atanmış). Dönüş: örnek akış açıldı, genel bakış
 * yeniden okunmalı.
 */
export async function syncContents(ov: Overview): Promise<boolean> {
  for (const w of ov.workflows) if (w.workerId === ov.me && w.nodes.includes('queue')) await ensureContents(w.id, w.name).catch((e) => console.error('[contents]', (e as Error).message))
  if (ov.workflows.length || readJson<{ example?: boolean }>(file(), {}).example) return false
  // Bir kez denenir: paket sınırı doluysa ya da kullanıcı örneği sildiyse yeniden açılmaz.
  writeJson(file(), { example: true })
  return createLocalWorkflow(EXAMPLE_NAME).then(
    () => true,
    () => false,
  )
}
