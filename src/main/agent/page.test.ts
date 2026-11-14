import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hiddenNote, parsePoint, unzoom, zoomBox } from './page.ts'

test('parsePoint reads the vision JSON, also inside prose or code fences', () => {
  assert.deepEqual(parsePoint('{"found": true, "x": 512, "y": 88, "label": "Download"}'), { x: 512, y: 88, label: 'Download' })
  assert.deepEqual(parsePoint('Here:\n```json\n{"found":true,"x":10,"y":990}\n```'), { x: 10, y: 990, label: '' })
})

test('parsePoint rejects not found, missing or out of grid points', () => {
  assert.equal(parsePoint('{"found": false}'), null)
  assert.equal(parsePoint('{"found": true, "x": 1200, "y": 5}'), null)
  assert.equal(parsePoint('I cannot see it'), null)
  assert.equal(parsePoint('{broken json}'), null)
})

test('hiddenNote lists only the areas read_page could not read', () => {
  assert.equal(hiddenNote({ canvas: 0, iframes: 1 }, 1), '')
  assert.match(hiddenNote({ canvas: 2, iframes: 3 }, 1), /2 canvas, 2 unreadable iframe/)
})

test('parsePoint: a mark number becomes the real centre of that element', () => {
  const marks = [{ n: 1, x: 100, y: 50, label: 'İndir' }, { n: 2, x: 900, y: 420, label: '' }]
  assert.deepEqual(parsePoint('{"found": true, "mark": 1, "label": "download"}', marks), { x: 100, y: 50, label: 'İndir', mark: 1 })
  assert.deepEqual(parsePoint('{"found": true, "mark": 2, "label": "chevron"}', marks), { x: 900, y: 420, label: 'chevron', mark: 2 })
  assert.equal(parsePoint('{"found": true, "mark": 7}', marks), null)
  assert.deepEqual(parsePoint('{"found": true, "x": 5, "y": 6}', marks), { x: 5, y: 6, label: '' })
})

test('zoomBox stays inside the image and unzoom maps the refined point back', () => {
  assert.deepEqual(zoomBox({ x: 500, y: 500 }, 1000, 500), { x: 300, y: 150, width: 400, height: 200 })
  const corner = zoomBox({ x: 990, y: 5 }, 1000, 500)
  assert.deepEqual(corner, { x: 600, y: 0, width: 400, height: 200 })
  // Kesitin ortası = kesitin merkezi tam görüntüde.
  assert.deepEqual(unzoom({ x: 500, y: 500 }, corner, 1000, 500), { x: 800, y: 200 })
  assert.deepEqual(unzoom({ x: 0, y: 1000 }, corner, 1000, 500), { x: 600, y: 400 })
})
