import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import type { Overview } from '../shared/types.ts'
import { isContentFolder, isWorkflowId, parseLocalUrl, parseStatus, pickContent, statusText, type ContentSettings, type ContentStatus, type LocalContent, type LocalMedia } from '../shared/contents.ts'
import { server } from './auth.ts'
import { inside, kindOf } from './paths.ts'
import { dataPath, readJson, writeJson } from './store.ts'
import * as ws from './workspace.ts'

/**
 * **Akışların yerel içerikleri** (bkz. `shared/contents.ts`). İçerik kaynağı "cihazdaki klasör" olan her
 * akışın bu cihazda bir klasörü var: `<çalışma klasörü>/workflow/<akış kimliği>/contents/1, 2, 3…`.
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
    'are settings of the workflow. Folder 1 is an example and is already "published".',
    '',
    '---',
    'Her içerik numaralı bir klasördür: 1, 2, 3, 4, 5, 6 ...',
    'Klasörün içinde: paylaşım metni (.txt), yüklenecek görseller ya da videolar ve içeriğin durumunu',
    'gösteren status.txt bulunur. Durumlar: pending (bekliyor), publishing (yayınlanıyor),',
    'published (paylaşıldı, bir daha alınmaz), failed (yayın düştü). Bir içeriği yeniden paylaşmak için',
    'status.txt dosyasına "pending" yaz. Sıra ve tekrar akışın ayarlarındadır. 1 numaralı klasör örnektir.',
    '',
  ].join('\r\n')

/** Akışın klasörünü kurar. İlk kez kuruluyorsa içine bir örnek içerik (`1`, durumu `published`) koyar. */
export async function ensureContents(workflowId: string, name: string) {
  const root = dir(workflowId)
  if (existsSync(root)) return root
  await mkdir(join(root, '1'), { recursive: true })
  await writeFile(join(root, README), readme(name))
  await writeFile(join(root, '1', 'content.txt'), 'This is an example content. Replace this text with your post, put the images or videos of the post next to it, and write "pending" into status.txt when it is ready to be shared.\r\n')
  await writeFile(join(root, '1', STATUS), statusText('published', 'example content'))
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
    if (restart) for (const i of items) if (i.status === 'published') await setContentStatus(workflowId, i.folder, 'pending', 'started over')
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

export const openContents = async (workflowId: string, name: string) => void (await shell.openPath(await ensureContents(workflowId, name)))

/* ---------------- Eşitleme ---------------- */

const EXAMPLE_NAME = 'Example local workflow'

/** Sunucuda içeriği bu cihazın klasöründen alan durdurulmuş bir taslak akış açar; klasörü bir sonraki eşitlemede kurulur. */
export const createLocalWorkflow = (name: string) => server('/api/v1/worker/workflows', { body: { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } })
const file = () => dataPath('workflows.json')

/**
 * Sunucudaki akışlarla bu cihazın klasörlerini eşitler (her hesap eşitlemesinde ve "Eşitle" düğmesiyle):
 * içeriği bu cihazda duran her akışın klasörü kurulur. Hesapta hiç akış yoksa bir kez **örnek akış**
 * açılır (durdurulmuş taslak; içeriği bu cihazın klasöründen). Dönüş: örnek akış açıldı, genel bakış
 * yeniden okunmalı.
 */
export async function syncContents(ov: Overview): Promise<boolean> {
  for (const w of ov.workflows) if (w.content.source === 'local' && w.workerId === ov.me) await ensureContents(w.id, w.name).catch((e) => console.error('[contents]', (e as Error).message))
  if (ov.workflows.length || readJson<{ example?: boolean }>(file(), {}).example) return false
  // Bir kez denenir: paket sınırı doluysa ya da kullanıcı örneği sildiyse yeniden açılmaz.
  writeJson(file(), { example: true })
  return createLocalWorkflow(EXAMPLE_NAME).then(
    () => true,
    () => false,
  )
}
