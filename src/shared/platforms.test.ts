import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPost, cleanHandle, jobPrompt, profileUrl } from './platforms.ts'

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
  // Yerel içerik: medya akışın klasöründen, https değil.
  const local = { workflowId: 'w1', folder: '3' }
  assert.equal(checkPost('instagram', { caption: 'x', media: [{ url: 'local:3/a.jpg' }], local }), null)
  assert.equal(checkPost('instagram', { caption: 'x', media: [{ url: 'https://a/b.png' }], local }), 'media must come from the content folder')
  assert.match(jobPrompt({ platform: 'x', handle: 'ali', browserId: 'b1', post: { caption: 'x', local }, files: [], folder: 'workflow/w1/contents/3' }), /workflow\/w1\/contents\/3/)
})
