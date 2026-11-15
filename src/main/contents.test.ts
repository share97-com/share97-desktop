import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { mock } from 'node:test'

// Electron ve ağ yok: çalışma klasörü geçici bir dizin, geçit sahte. Klasör mantığının kendisi gerçek dosya sistemiyle.
const home = mkdtempSync(join(tmpdir(), 's97-contents-'))
const calls: { path: string; body: { messages?: { content: string }[]; prompt?: string } }[] = []
mock.module('electron', { namedExports: { app: { getPath: () => home }, shell: {}, clipboard: {}, dialog: {}, nativeImage: {}, ClipboardItem: class {} } })
mock.module('./auth.ts', { namedExports: { server: async () => ({}) } })
mock.module('./auto.ts', { namedExports: { IMAGE_MODEL: 'image-model' } })
mock.module('./settings.ts', { namedExports: { DEFAULT_MODEL: 'chat-model', settings: () => ({ chatModel: null, imageModel: null }) } })
mock.module('./gateway.ts', {
  namedExports: {
    apiJson: async (path: string, body: (typeof calls)[number]['body']) => {
      calls.push({ path, body })
      if (path === 'images/generations') return { data: [{ b64_json: Buffer.from('png').toString('base64') }] }
      return { choices: [{ message: { content: JSON.stringify({ posts: [{ caption: 'Yeni bir', imagePrompt: 'a cup' }, { caption: 'Yeni iki', imagePrompt: 'a bean' }] }) } }] }
    },
  },
})
const c = await import('./contents.ts')
const root = join(home, 'share97-desktop', 'workflow', 'wf1', 'contents')
const status = (folder: string) => readFileSync(join(root, folder, 'status.txt'), 'utf8').split('\n')[0]

test.after(() => rmSync(home, { recursive: true, force: true }))

test('klasör kurulunca 1 numaralı içerik baştan sona örnek: metin, görsel, video, durumu published', async () => {
  await c.ensureContents('wf1', 'Deneme')
  const [one, ...rest] = await c.listContents('wf1')
  assert.equal(rest.length, 0)
  assert.deepEqual({ folder: one.folder, status: one.status, media: one.media }, { folder: '1', status: 'published', media: [{ file: 'example-image.jpg', kind: 'image' }, { file: 'example-video.mp4', kind: 'video' }] })
  assert.ok(one.caption.length > 50 && existsSync(join(root, 'README.txt')))
  // Örnek hiç paylaşılmaz: tekrar açık olsa da.
  assert.equal(await c.takeContent('wf1', { order: 'sequential', repeat: true }), null)
  assert.equal(status('1'), 'published')
})

test('eski sürümün yalnız metinli örneği tamamlanır; kullanıcının dosyasına dokunulmaz', async () => {
  rmSync(join(root, '1', 'example-video.mp4'))
  writeFileSync(join(root, '1', 'content.txt'), 'benim metnim')
  await c.ensureContents('wf1', 'Deneme')
  assert.ok(existsSync(join(root, '1', 'example-video.mp4')))
  assert.equal(readFileSync(join(root, '1', 'content.txt'), 'utf8'), 'benim metnim')
})

test('içerik üretimi yeni numaralı klasörler yazar; akış sırayla alır, sonucu status.txt gösterir', async () => {
  assert.equal(await c.generateContents('wf1', 'Deneme', { from: '1', topic: 'kısa', count: 2, withImage: true }), 2)
  assert.match(calls[0].body.messages![1].content, /benim metnim/, 'örnek içerik modele gidiyor')
  assert.equal(calls.filter((x) => x.path === 'images/generations').length, 2)
  const items = await c.listContents('wf1')
  assert.deepEqual(items.map((i) => [i.folder, i.status, i.caption, i.media.map((m) => m.file).join()]), [['1', 'published', 'benim metnim', 'example-image.jpg,example-video.mp4'], ['2', 'pending', 'Yeni bir', 'image.png'], ['3', 'pending', 'Yeni iki', 'image.png']])
  await assert.rejects(c.generateContents('wf1', 'Deneme', { from: null, topic: ' ', count: 1, withImage: false }), /topic/)

  const first = await c.takeContent('wf1', { order: 'sequential', repeat: false })
  assert.deepEqual(first, { folder: '2', caption: 'Yeni bir', media: [{ file: 'image.png', kind: 'image' }] })
  assert.equal(status('2'), 'publishing')
  assert.deepEqual(c.contentFiles('wf1', '2', ['local:2/image.png']), ['workflow/wf1/contents/2/image.png'])
  assert.throws(() => c.contentFiles('wf1', '2', ['local:3/image.png']), /missing/)
  assert.throws(() => c.contentFiles('wf1', '2', ['local:2/..']), /missing/)
  await c.finishContent('wf1', '2', 'ali', true, 'https://x.com/1')
  assert.match(readFileSync(join(root, '2', 'status.txt'), 'utf8'), /^published\n.*https:\/\/x\.com\/1/)

  assert.equal((await c.takeContent('wf1', { order: 'sequential', repeat: false }))?.folder, '3')
  await c.finishContent('wf1', '3', 'ali', false, 'rate limit')
  assert.equal(status('3'), 'failed')
  // Paylaşılan bir daha alınmaz, düşen kendiliğinden yeniden denenmez.
  assert.equal(await c.takeContent('wf1', { order: 'sequential', repeat: false }), null)
  // Başka bir hesapta paylaşılmış içerik sonraki hatayla düşmüyor; düşen hesap notta kalıyor (kısmi).
  await c.finishContent('wf1', '2', 'veli', false, 'x')
  assert.equal(status('2'), 'published')
  assert.match(readFileSync(join(root, '2', 'status.txt'), 'utf8'), /@ali ok https:\/\/x\.com\/1; @veli failed: x/)
  // Düşen içerik uygulamadan yeniden sıraya alınır; örnek alınmaz.
  await c.requeueContent('wf1', '3')
  assert.equal(status('3'), 'pending')
  await assert.rejects(c.requeueContent('wf1', '1'), /example/)
  await c.finishContent('wf1', '3', 'ali', false, 'again')
  // Tekrar açık: paylaşılanlar (örnek hariç) baştan başlar.
  assert.equal((await c.takeContent('wf1', { order: 'sequential', repeat: true }))?.folder, '2')
  assert.equal(status('1'), 'published')
})

test('metni de dosyası da olmayan klasör failed yazılıp atlanır', async () => {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(root, '7'))
  assert.equal(await c.takeContent('wf1', { order: 'sequential', repeat: false }), null)
  assert.equal(status('7'), 'failed')
})

test('uygulamadan içerik ekleme: sıradaki klasör, metin ve kopyalanan medya, durumu pending', async () => {
  const src = join(home, 'foto.jpg')
  writeFileSync(src, 'jpg')
  writeFileSync(join(home, 'not.pdf'), 'pdf')
  const folder = await c.addContent('wf1', 'Deneme', ' merhaba ', [src, join(home, 'not.pdf')])
  const made = (await c.listContents('wf1')).find((i) => i.folder === folder)!
  assert.deepEqual({ caption: made.caption, status: made.status, media: made.media.map((m) => m.file) }, { caption: 'merhaba', status: 'pending', media: ['1-foto.jpg'] })
  await assert.rejects(c.addContent('wf1', 'Deneme', ' ', []), /text/)
})

test('klasördeki sessiz kesmeler uyarı olarak görünür', async () => {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(root, '90', 'alt'), { recursive: true })
  writeFileSync(join(root, '90', 'a.txt'), 'x'.repeat(5001))
  writeFileSync(join(root, '90', 'b.txt'), 'y')
  assert.deepEqual((await c.listContents('wf1')).find((i) => i.folder === '90')!.warnings, ['long-text', 'many-texts', 'subfolders'])
})
