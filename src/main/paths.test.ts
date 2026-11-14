import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { inside, kindOf, safeName, writeProblem } from './paths.ts'

const root = join(process.cwd(), 'ws')

test('çalışma klasörü dışına çıkılamıyor', () => {
  assert.equal(inside(root, 'rapor.xlsx'), join(root, 'rapor.xlsx'))
  assert.equal(inside(root, 'media/2026/a.png'), join(root, 'media', '2026', 'a.png'))
  assert.equal(inside(root, '../x.txt'), null)
  assert.equal(inside(root, 'a/../../x.txt'), null)
  assert.equal(inside(root, process.platform === 'win32' ? 'C:\\Windows\\x' : '/etc/passwd'), null)
  assert.equal(inside(root, ''), null)
  assert.equal(inside(root, '.'), null)
  assert.equal(inside(root, 'a\0b'), null)
})

test('dosya türü ve güvenli ad', () => {
  assert.equal(kindOf('a/B.PNG'), 'image')
  assert.equal(kindOf('x.mp4'), 'video')
  assert.equal(kindOf('r.pdf'), 'document')
  assert.equal(safeName('../Q3: rapor?.xlsx'), '-Q3- rapor-.xlsx')
  assert.equal(safeName('...'), 'dosya')
})

test('yazma sorunu: neden ve çözüm', () => {
  const err = (code: string) => Object.assign(new Error('x'), { code })
  assert.match(writeProblem(err('EPERM'), 'D:/Docs', 'D:/app.exe'), /Cannot write files to D:\/Docs \((x)\).*Controlled folder access.*D:\/app\.exe/)
  assert.match(writeProblem(err('ENOENT'), 'd'), /Controlled folder access/)
  assert.match(writeProblem(err('ENOSPC'), 'd'), /disk is full/)
  assert.match(writeProblem(err('EBUSY'), 'd'), /open in another program/)
})
