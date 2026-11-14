import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'

/**
 * **Ortak rapor modeli.** Agent içeriği bir kez bu yapıda kuruyor; istenen her biçime
 * (Excel, PowerPoint, PDF, HTML, Markdown, CSV, JSON, metin) buradan dönüşüyor. Aynı veriden
 * tek komutla tablo, yönetici özeti ve sunum çıkıyor.
 */
export type Cell = string | number | null
export type Chart = { type: 'bar' | 'line' | 'pie'; title?: string; labels: string[]; series: { name: string; values: number[] }[] }
export type Section = { heading: string; text?: string; bullets?: string[]; table?: { columns: string[]; rows: Cell[][] }; chart?: Chart; images?: string[] }
export type Report = { title: string; subtitle?: string; sections: Section[] }
export type Format = 'xlsx' | 'pptx' | 'pdf' | 'html' | 'md' | 'csv' | 'json' | 'txt'
export const FORMATS = ['xlsx', 'pptx', 'pdf', 'html', 'md', 'csv', 'json', 'txt'] as const

/** Görsel yolları çalışma klasörüne göre; çözümlemeyi çağıran yapıyor (dışarı çıkamasın). */
export type ImageResolver = (relPath: string) => Promise<string>

export async function render(report: Report, format: Format, image: ImageResolver): Promise<Uint8Array | string> {
  switch (format) {
    case 'xlsx':
      return xlsx(report)
    case 'pptx':
      return pptx(report, image)
    case 'pdf':
      // Aşama adıyla: yazma izni sorunu (`workspace.check`) ile çizim sorunu karışmasın.
      return pdf(await html(report, image)).catch((e: Error) => {
        throw new Error(`PDF rendering failed: ${e.message}. The html format has the same content and can be printed to PDF from a browser.`)
      })
    case 'html':
      return html(report, image)
    case 'md':
      return markdown(report)
    case 'csv':
      return csv(report)
    case 'json':
      return JSON.stringify(report, null, 2)
    case 'txt':
      return text(report)
  }
}

const PALETTE = ['#7c5cff', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6', '#84cc16']

/* ---------------- Excel ---------------- */

async function xlsx(r: Report): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Share97 Desktop'
  const summary = wb.addWorksheet('Özet')
  summary.getColumn(1).width = 100
  summary.addRow([r.title]).font = { bold: true, size: 16 }
  if (r.subtitle) summary.addRow([r.subtitle]).font = { italic: true, color: { argb: 'FF6B7280' } }
  const used = new Set(['Özet'])
  const sheetName = (name: string) => {
    const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sayfa'
    let n = base
    for (let i = 2; used.has(n); i++) n = `${base.slice(0, 25)} ${i}`
    used.add(n)
    return n
  }
  for (const s of r.sections) {
    summary.addRow([])
    summary.addRow([s.heading]).font = { bold: true, size: 13 }
    if (s.text) summary.addRow([s.text]).alignment = { wrapText: true }
    for (const b of s.bullets ?? []) summary.addRow([`• ${b}`])
    const tables: { columns: string[]; rows: Cell[][] }[] = []
    if (s.table) tables.push(s.table)
    if (s.chart) tables.push({ columns: ['', ...s.chart.series.map((x) => x.name)], rows: s.chart.labels.map((l, i) => [l, ...s.chart!.series.map((x) => x.values[i] ?? null)]) })
    for (const t of tables) {
      const ws = wb.addWorksheet(sheetName(s.heading))
      ws.addRow(t.columns).eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C5CFF' } }
      })
      for (const row of t.rows) ws.addRow(row.map((v) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)))
      ws.columns.forEach((col, i) => (col.width = Math.min(50, Math.max(10, ...[t.columns[i] ?? '', ...t.rows.map((row) => String(row[i] ?? ''))].map((v) => v.length + 2)))))
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } }
      ws.views = [{ state: 'frozen', ySplit: 1 }]
      summary.addRow([`→ Tablo: "${ws.name}" sayfası`]).font = { color: { argb: 'FF6B7280' } }
    }
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

/* ---------------- PowerPoint ---------------- */

async function pptx(r: Report, image: ImageResolver): Promise<Uint8Array> {
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_WIDE'
  const title = p.addSlide()
  title.background = { color: '0A0B10' }
  title.addText(r.title, { x: 0.6, y: 2.4, w: 12, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF' })
  if (r.subtitle) title.addText(r.subtitle, { x: 0.6, y: 3.6, w: 12, h: 0.8, fontSize: 20, color: '9CA3AF' })
  title.addShape(p.ShapeType.rect, { x: 0.6, y: 2.2, w: 1.5, h: 0.08, fill: { color: '7C5CFF' } })

  for (const s of r.sections) {
    const slide = p.addSlide()
    slide.addText(s.heading, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: '11131A' })
    let y = 1.2
    const body = [s.text, ...(s.bullets ?? []).map((b) => `• ${b}`)].filter(Boolean).join('\n')
    const visuals = Number(!!s.table) + Number(!!s.chart) + Number(!!s.images?.length)
    if (body) {
      const h = visuals ? 1.6 : 5.5
      slide.addText(body, { x: 0.5, y, w: 12.3, h, fontSize: visuals ? 14 : 18, color: '374151', valign: 'top' })
      y += h + 0.1
    }
    const space = 7.2 - y
    const w = visuals > 1 ? 6 : 12.3
    let x = 0.5
    if (s.chart) {
      slide.addChart(s.chart.type, s.chart.series.map((x) => ({ name: x.name, labels: s.chart!.labels, values: x.values })), { x, y, w, h: space, showLegend: true, legendPos: 'b', chartColors: PALETTE.map((c) => c.slice(1)), showTitle: !!s.chart.title, title: s.chart.title })
      x += w + 0.3
    }
    if (s.table) {
      const rows = s.table.rows.slice(0, 14)
      slide.addTable([s.table.columns.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: '7C5CFF' } } })), ...rows.map((row) => row.map((v) => ({ text: v === null ? '' : String(v) })))], { x, y, w, fontSize: 10, border: { type: 'solid', color: 'D7DAE4', pt: 0.5 }, autoPage: false })
      if (s.table.rows.length > rows.length) slide.addText(`+${s.table.rows.length - rows.length} satır (tamamı Excel raporunda)`, { x, y: 7.1, w, h: 0.3, fontSize: 9, color: '6B7280' })
      x += w + 0.3
    }
    for (const img of s.images?.slice(0, 2) ?? []) {
      slide.addImage({ path: await image(img), x, y, w: 6, h: space, sizing: { type: 'contain', w: 6, h: space } })
      x += 6.3
    }
  }
  return (await p.write({ outputType: 'uint8array' })) as Uint8Array
}

/* ---------------- HTML / PDF ---------------- */

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Bağımlılıksız SVG grafik (PDF ve HTML için). */
export function svgChart(c: Chart, width = 640, height = 300): string {
  const pad = { l: 48, r: 12, t: c.title ? 28 : 12, b: 48 }
  const title = c.title ? `<text x="${width / 2}" y="18" text-anchor="middle" font-size="14" font-weight="600">${esc(c.title)}</text>` : ''
  const legend = c.series.map((s, i) => `<g transform="translate(${pad.l + i * 140},${height - 14})"><rect width="10" height="10" fill="${PALETTE[i % PALETTE.length]}"/><text x="14" y="9" font-size="11">${esc(s.name)}</text></g>`).join('')
  if (c.type === 'pie') {
    const values = c.series[0]?.values ?? []
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const cx = width / 2
    const cy = (height - 20 + pad.t) / 2
    const rad = Math.min(width, height - 40 - pad.t) / 2 - 10
    let a0 = -Math.PI / 2
    const slices = values
      .map((v, i) => {
        const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2
        const large = a1 - a0 > Math.PI ? 1 : 0
        const d = `M${cx},${cy} L${cx + rad * Math.cos(a0)},${cy + rad * Math.sin(a0)} A${rad},${rad} 0 ${large} 1 ${cx + rad * Math.cos(a1)},${cy + rad * Math.sin(a1)} Z`
        a0 = a1
        return `<path d="${d}" fill="${PALETTE[i % PALETTE.length]}"><title>${esc(c.labels[i])}: ${v}</title></path>`
      })
      .join('')
    const pieLegend = c.labels.map((l, i) => `<g transform="translate(${8 + (i % 4) * 155},${height - 14 - Math.floor(i / 4) * 0})"><rect width="10" height="10" fill="${PALETTE[i % PALETTE.length]}"/><text x="14" y="9" font-size="11">${esc(l)} (${Math.round(((values[i] ?? 0) / total) * 100)}%)</text></g>`).slice(0, 4).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" font-family="sans-serif">${title}${slices}${pieLegend}</svg>`
  }
  const all = c.series.flatMap((s) => s.values)
  const max = Math.max(0, ...all) || 1
  const min = Math.min(0, ...all)
  const W = width - pad.l - pad.r
  const H = height - pad.t - pad.b
  const yOf = (v: number) => pad.t + H - ((v - min) / (max - min)) * H
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + (max - min) * f
    return `<line x1="${pad.l}" x2="${width - pad.r}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="#e5e7eb"/><text x="${pad.l - 6}" y="${yOf(v) + 4}" text-anchor="end" font-size="10" fill="#6b7280">${+v.toFixed(2)}</text>`
  })
  const step = W / Math.max(1, c.labels.length)
  const labels = c.labels.map((l, i) => `<text x="${pad.l + step * i + step / 2}" y="${pad.t + H + 14}" text-anchor="middle" font-size="10" fill="#374151">${esc(l.length > 12 ? l.slice(0, 11) + '…' : l)}</text>`)
  let marks = ''
  if (c.type === 'bar') {
    const bw = (step * 0.8) / c.series.length
    marks = c.series.map((s, si) => s.values.map((v, i) => `<rect x="${pad.l + step * i + step * 0.1 + bw * si}" y="${Math.min(yOf(v), yOf(0))}" width="${bw}" height="${Math.abs(yOf(v) - yOf(0))}" fill="${PALETTE[si % PALETTE.length]}"><title>${esc(s.name)} ${esc(c.labels[i])}: ${v}</title></rect>`).join('')).join('')
  } else {
    marks = c.series.map((s, si) => `<polyline fill="none" stroke-width="2.5" stroke="${PALETTE[si % PALETTE.length]}" points="${s.values.map((v, i) => `${pad.l + step * i + step / 2},${yOf(v)}`).join(' ')}"/>`).join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" font-family="sans-serif">${title}${grid.join('')}${marks}${labels.join('')}${legend}</svg>`
}

async function dataUri(path: string) {
  const ext = extname(path).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${(await readFile(path)).toString('base64')}`
}

async function html(r: Report, image: ImageResolver): Promise<string> {
  const sections = await Promise.all(
    r.sections.map(async (s) => {
      const imgs = await Promise.all((s.images ?? []).map(async (i) => `<img src="${await dataUri(await image(i))}" alt="">`))
      return `<section><h2>${esc(s.heading)}</h2>${s.text ? `<p>${esc(s.text).replace(/\n/g, '<br>')}</p>` : ''}${s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${s.chart ? `<figure>${svgChart(s.chart)}</figure>` : ''}${
        s.table ? `<table><thead><tr>${s.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((row) => `<tr>${row.map((v) => `<td${typeof v === 'number' ? ' class="n"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''
      }${imgs.length ? `<div class="imgs">${imgs.join('')}</div>` : ''}</section>`
    }),
  )
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font:12px/1.55 'Segoe UI',system-ui,sans-serif;color:#11131a;margin:32px}
header{border-left:6px solid #7c5cff;padding-left:14px;margin-bottom:24px}h1{margin:0;font-size:26px}header p{margin:4px 0 0;color:#6b7280}
h2{font-size:17px;margin:26px 0 8px;color:#3b2fb0}section{break-inside:avoid-page}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:11px}th{background:#7c5cff;color:#fff;text-align:left}th,td{padding:5px 8px;border:1px solid #d7dae4}td.n{text-align:right;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#f7f8fb}
figure{margin:10px 0}.imgs{display:flex;flex-wrap:wrap;gap:8px}.imgs img{max-width:48%;border-radius:6px}
footer{margin-top:32px;color:#9ca3af;font-size:10px}</style></head><body><header><h1>${esc(r.title)}</h1>${r.subtitle ? `<p>${esc(r.subtitle)}</p>` : ''}</header>${sections.join('')}<footer>Share97 Desktop · ${new Date().toLocaleString('tr-TR')}</footer></body></html>`
}

const PDF_TIMEOUT_MS = 90_000

/**
 * HTML → PDF: görünmez pencerede Chromium'un kendi yazdırma motoru (yazıcı gerekmiyor). HTML geçici dosyadan
 * yükleniyor: görselli raporlar data URL sınırını (2 MB) aşıp yüklemeyi asılı bırakıyordu.
 */
async function pdf(source: string): Promise<Uint8Array> {
  // Geç yükleme: modülün geri kalanı Electron dışında (testlerde) de çalışıyor.
  const { app, BrowserWindow } = await import('electron')
  // Uygulamanın kendi veri klasörü: ayarların yazıldığı yer, sistem TEMP'i bozuk ya da kısıtlı olsa da yazılabiliyor.
  const file = join(app.getPath('userData'), `report-${randomUUID()}.html`)
  await writeFile(file, source)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  let timer: NodeJS.Timeout | undefined
  try {
    const work = (async () => {
      await win.loadFile(file)
      return new Uint8Array(await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } }))
    })()
    return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`PDF rendering timed out after ${PDF_TIMEOUT_MS / 1000} s`)), PDF_TIMEOUT_MS)))])
  } finally {
    clearTimeout(timer)
    win.destroy()
    void rm(file, { force: true })
  }
}

/* ---------------- Metin biçimleri ---------------- */

const mdCell = (v: Cell) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function markdown(r: Report): string {
  const out = [`# ${r.title}`, r.subtitle ? `_${r.subtitle}_` : '']
  for (const s of r.sections) {
    out.push('', `## ${s.heading}`)
    if (s.text) out.push('', s.text)
    if (s.bullets?.length) out.push('', ...s.bullets.map((b) => `- ${b}`))
    const t = s.table ?? (s.chart && { columns: ['', ...s.chart.series.map((x) => x.name)], rows: s.chart.labels.map((l, i) => [l, ...s.chart!.series.map((x) => x.values[i] ?? null)]) })
    if (t) out.push('', `| ${t.columns.map(mdCell).join(' | ')} |`, `| ${t.columns.map(() => '---').join(' | ')} |`, ...t.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`))
    for (const img of s.images ?? []) out.push('', `![](${img})`)
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') + '\n'
}

const csvCell = (v: Cell) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Bütün tablolar, aralarında boş satır ve başlık; Excel'in açabildiği UTF-8 BOM'lu. */
export function csv(r: Report): string {
  const blocks = r.sections.filter((s) => s.table).map((s) => [csvCell(s.heading), s.table!.columns.map(csvCell).join(','), ...s.table!.rows.map((row) => row.map(csvCell).join(','))].join('\r\n'))
  return '﻿' + blocks.join('\r\n\r\n') + '\r\n'
}

function text(r: Report): string {
  return markdown(r)
    .replace(/^#+ /gm, '')
    .replace(/^_(.*)_$/gm, '$1')
}
