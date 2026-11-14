import assert from 'node:assert/strict'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import { csv, markdown, render, svgChart, type Report } from './reports.ts'

const report: Report = {
  title: 'Q3 Reklam Raporu',
  subtitle: 'Google Ads ve Meta',
  sections: [
    { heading: 'Özet', text: 'Harcama arttı.', bullets: ['ROAS 3,2', 'CPC düştü'] },
    { heading: 'Kampanyalar', table: { columns: ['Kampanya', 'Harcama', 'Tıklama'], rows: [['Marka, TR', 120.5, '340'], ['Arama | Genel', 80, 210]] } },
    { heading: 'Trend', chart: { type: 'bar', title: 'Haftalık', labels: ['H1', 'H2'], series: [{ name: 'Google', values: [10, 20] }, { name: 'Meta', values: [5, -3] }] } },
  ],
}
const noImage = async () => { throw new Error('no images in test') }

test('markdown ve csv', () => {
  const md = markdown(report)
  assert.match(md, /^# Q3 Reklam Raporu/)
  assert.match(md, /\| Arama \\| Genel \| 80 \| 210 \|/)
  assert.match(md, /\| H2 \| 20 \| -3 \|/)
  const c = csv(report)
  assert.ok(c.startsWith('﻿'))
  assert.match(c, /"Marka, TR",120.5,340/)
})

test('svg grafik', () => {
  for (const type of ['bar', 'line', 'pie'] as const) assert.match(svgChart({ ...report.sections[2].chart!, type }), /^<svg[\s\S]*<\/svg>$/)
})

test('excel: tablo sayfaları, sayılar sayı', async () => {
  const buf = (await render(report, 'xlsx', noImage)) as Uint8Array
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buf) as never)
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Özet', 'Kampanyalar', 'Trend'])
  const ws = wb.getWorksheet('Kampanyalar')!
  assert.equal(ws.getCell('A2').value, 'Marka, TR')
  assert.equal(ws.getCell('C2').value, 340)
})

test('powerpoint üretiliyor', async () => {
  const buf = (await render(report, 'pptx', noImage)) as Uint8Array
  assert.equal(Buffer.from(buf.slice(0, 2)).toString(), 'PK')
  assert.ok(buf.length > 10_000)
})
