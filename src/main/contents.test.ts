import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { mock } from 'node:test'

// Electron ve ağ yok: çalışma klasörü geçici bir dizin, geçit ve LangChain modeli sahte. Klasör mantığı gerçek dosya sistemiyle.
const home = mkdtempSync(join(tmpdir(), 's97-contents-'))
const calls: { path: string; body: { messages?: { content: string }[]; prompt?: string } }[] = []
const briefs: unknown[] = []
mock.module('electron', { namedExports: { app: { getPath: () => home, getLocale: () => 'en' }, shell: {}, clipboard: {}, dialog: {}, nativeImage: {}, ClipboardItem: class {} } })
mock.module('./auth.ts', { namedExports: { server: async () => ({}), apiKey: () => 'key' } })
mock.module('./auto.ts', { namedExports: { IMAGE_MODEL: 'image-model' } })
mock.module('./settings.ts', { namedExports: { DEFAULT_MODEL: 'chat-model', settings: () => ({ chatModel: null, imageModel: null }) } })
mock.module('@langchain/openai', {
  namedExports: {
    ChatOpenAI: class {
      invoke = async (messages: unknown) => (briefs.push(messages), { text: 'PROFILE\nA coffee shop in Izmir.\nCONTENT\nCoffee tips.\nPROMPT\nWrite warm, short posts.' })
    },
  },
})
mock.module('./gateway.ts', {
  namedExports: {
    AI_BASE: 'http://ai',
    apiJson: async (path: string, body: (typeof calls)[number]['body']) => {
      calls.push({ path, body })
      if (path === 'images/generations') return { data: [{ b64_json: Buffer.from('png').toString('base64') }] }
      return { choices: [{ message: { content: JSON.stringify({ posts: [{ caption: 'Yeni bir', imagePrompt: 'a cup' }, { caption: 'Yeni iki', imagePrompt: 'a bean' }] }) } }] }
    },
  },
})
const c = await import('./contents.ts')
const acc = { id: 'acc1', platform: 'instagram', handle: '@shop.ist' }
const base = join(home, 'share97-desktop', 'accounts', 'shop.ist', 'instagram')
const root = join(base, 'contents')
const status = (folder: string) => readFileSync(join(root, folder, 'status.txt'), 'utf8').split('\n')[0]

test.after(() => rmSync(home, { recursive: true, force: true }))

test('hesabın alanı: accounts/<ad>/<platform>/contents ve README, örnek içerik yok', async () => {
  await c.syncContents({ workflows: [{}] } as never, [acc])
  assert.ok(existsSync(join(root, 'README.txt')))
  assert.deepEqual(await c.listContents(acc), [])
  assert.equal(c.contentsRel(acc, '3'), 'accounts/shop.ist/instagram/contents/3')
})

test('account.txt yoksa LangChain yazar, varsa okunur, verilen metinle değişir', async () => {
  const first = await c.accountProfile(acc, { notes: 'bio: specialty coffee' })
  assert.equal(first.created, true)
  assert.match(JSON.stringify(briefs[0]), /specialty coffee/)
  assert.match(readFileSync(join(base, 'account.txt'), 'utf8'), /^PROFILE/)
  assert.deepEqual(await c.accountProfile(acc), { text: first.text, created: false })
  assert.equal(briefs.length, 1, 'var olan dosya için model çağrılmaz')
  await c.accountProfile(acc, { content: 'PROFILE\nedited' })
  assert.equal((await c.accountProfile(acc)).text, 'PROFILE\nedited')
})

test('hesaptan içerik üretimi account.txt ile yeni numaralı klasörler yazar; akış sırayla alır, sonucu status.txt gösterir', async () => {
  assert.deepEqual(await c.generateContents(acc, { from: null, topic: '', count: 2, withImage: true }), ['1', '2'])
  assert.match(calls[0].body.messages![0].content, /PROFILE\nedited/, 'hesabın özeti modele gidiyor')
  assert.equal(calls.filter((x) => x.path === 'images/generations').length, 2)
  assert.deepEqual((await c.listContents(acc)).map((i) => [i.folder, i.status, i.caption, i.media.map((m) => m.file).join()]), [['1', 'pending', 'Yeni bir', 'image.png'], ['2', 'pending', 'Yeni iki', 'image.png']])

  const first = await c.takeContent(acc, { order: 'sequential', repeat: false })
  assert.deepEqual(first, { folder: '1', caption: 'Yeni bir', media: [{ file: 'image.png', kind: 'image' }] })
  assert.equal(status('1'), 'publishing')
  assert.deepEqual(c.contentFiles(acc, '1', ['local:1/image.png']), ['accounts/shop.ist/instagram/contents/1/image.png'])
  assert.throws(() => c.contentFiles(acc, '1', ['local:2/image.png']), /missing/)
  assert.throws(() => c.contentFiles(acc, '1', ['local:1/..']), /missing/)
  await c.finishContent(acc, '1', 'ali', true, 'https://x.com/1')
  assert.match(readFileSync(join(root, '1', 'status.txt'), 'utf8'), /^published\n.*https:\/\/x\.com\/1/)

  assert.equal((await c.takeContent(acc, { order: 'sequential', repeat: false }))?.folder, '2')
  await c.finishContent(acc, '2', 'ali', false, 'rate limit')
  assert.equal(status('2'), 'failed')
  assert.equal(await c.takeContent(acc, { order: 'sequential', repeat: false }), null)
  await c.finishContent(acc, '1', 'veli', false, 'x')
  assert.equal(status('1'), 'published')
  assert.match(readFileSync(join(root, '1', 'status.txt'), 'utf8'), /@ali ok https:\/\/x\.com\/1; @veli failed: x/)
  await c.requeueContent(acc, '2')
  assert.equal(status('2'), 'pending')
  await c.finishContent(acc, '2', 'ali', false, 'again')
  // Tekrar açık: paylaşılanlar baştan başlar.
  assert.equal((await c.takeContent(acc, { order: 'sequential', repeat: true }))?.folder, '1')
})

test('metni de dosyası da olmayan klasör failed yazılıp atlanır', async () => {
  mkdirSync(join(root, '7'))
  assert.equal(await c.takeContent(acc, { order: 'sequential', repeat: false }), null)
  assert.equal(status('7'), 'failed')
})

test('uygulamadan içerik ekleme: sıradaki klasör, metin ve kopyalanan medya, durumu pending', async () => {
  const src = join(home, 'foto.jpg')
  writeFileSync(src, 'jpg')
  writeFileSync(join(home, 'not.pdf'), 'pdf')
  const folder = await c.addContent(acc, ' merhaba ', [src, join(home, 'not.pdf')])
  writeFileSync(join(home, 'b.PNG'), 'png')
  writeFileSync(join(home, 'c.mp4'), 'mp4')
  const many = await c.addContent(acc, '', [src, join(home, 'b.PNG'), join(home, 'c.mp4')])
  assert.deepEqual((await c.listContents(acc)).find((i) => i.folder === many)!.media.map((m) => m.file), ['image-1.jpg', 'image-2.png', 'video.mp4'])
  const made = (await c.listContents(acc)).find((i) => i.folder === folder)!
  assert.deepEqual({ caption: made.caption, status: made.status, media: made.media.map((m) => m.file) }, { caption: 'merhaba', status: 'pending', media: ['image.jpg'] })
  await assert.rejects(c.addContent(acc, ' ', []), /text/)
})

test('klasördeki sessiz kesmeler uyarı olarak görünür', async () => {
  mkdirSync(join(root, '90', 'alt'), { recursive: true })
  writeFileSync(join(root, '90', 'a.txt'), 'x'.repeat(5001))
  writeFileSync(join(root, '90', 'b.txt'), 'y')
  assert.deepEqual((await c.listContents(acc)).find((i) => i.folder === '90')!.warnings, ['long-text', 'many-texts', 'subfolders'])
})
