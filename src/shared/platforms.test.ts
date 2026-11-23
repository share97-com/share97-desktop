import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPost, cleanHandle, jobPrompt, lockProblem, profileUrl, schedulerNote } from './platforms.ts'

test('platform kuralları', () => {
  assert.equal(cleanHandle(' @@ali '), 'ali')
  assert.equal(profileUrl('tiktok', '@ali'), 'https://www.tiktok.com/@ali')
  assert.equal(checkPost('instagram', { caption: 'x', media: [] }), 'Instagram needs an image or video')
  assert.equal(checkPost('x', { caption: 'x', media: [] }), null)
  assert.equal(checkPost('x', { caption: '', media: [] }), 'post is empty')
  assert.equal(checkPost('x', { caption: 'a', media: [{ url: 'http://a/b.png' }] }), 'media must be https')
  assert.equal(checkPost('instagram', { instruction: 'follow @a', media: [] }), null)
  assert.match(checkPost('myspace', { caption: 'x' }) ?? '', /unsupported/)
  const p = jobPrompt({ platform: 'x', handle: 'ali', browserId: 'b1', post: { caption: 'Hi "you"', type: 'feed' }, files: ['uploads/jobs/1/0.jpg'] })
  assert.match(p, /browser_id b1/)
  assert.match(p, /"Hi \\"you\\""/)
  assert.match(p, /uploads\/jobs\/1\/0\.jpg/)
  // Yerel içerik: medya hesabın içerik klasöründen, https değil.
  const local = { accountId: 'a1', folder: '3' }
  assert.equal(checkPost('instagram', { caption: 'x', media: [{ url: 'local:3/a.jpg' }], local }), null)
  assert.equal(checkPost('instagram', { caption: 'x', media: [{ url: 'https://a/b.png' }], local }), 'media must come from the content folder')
  assert.match(jobPrompt({ platform: 'x', handle: 'ali', browserId: 'b1', post: { caption: 'x', local }, files: [], folder: 'accounts/ali/x/contents/3' }), /account content folder accounts\/ali\/x\/contents\/3/)
})

test('kilitli görev yalnız hesabın tarayıcısını kullanır', () => {
  assert.equal(lockProblem(undefined, 'click', { browser_id: 'x' }), null)
  assert.equal(lockProblem('acc', 'click', { browser_id: 'acc' }), null)
  assert.equal(lockProblem('acc', 'web_search', { query: 'q' }), null)
  assert.match(lockProblem('acc', 'click', { browser_id: 'other' })!, /only use browser_id acc/)
  assert.match(lockProblem('acc', 'create_browser', { name: 'n' })!, /Do not create/)
})

test('zamanlama yönü: kendi zamanlayıcısı olan platformda yol ve araçlar, olmayanda uygulama paylaşır', () => {
  assert.match(schedulerNote('instagram'), /business\.facebook\.com.*upload_account_content.*mark_account_content_scheduled/s)
  assert.match(schedulerNote('reddit'), /no scheduler of its own/)
})
