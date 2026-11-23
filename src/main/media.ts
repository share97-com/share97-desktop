import { BrowserWindow, nativeImage } from 'electron'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { centerCrop, ratioOf, type MediaInfo } from '../shared/media.ts'
import { kindOf } from './paths.ts'

type Box = { x: number; y: number; width: number; height: number }

/** Görselin / videonun özgün boyutu. Video, gizli boş bir pencerede `<video>` ile okunur (döndürme bilgisi dahil);
 * pencere yalnız bu yerel dosyayı yükler, o yüzden `webSecurity` kapalı (boş sayfadan `file:` okunabilsin). */
export async function mediaInfo(full: string): Promise<MediaInfo> {
  if (kindOf(full) === 'image') {
    const { width, height } = nativeImage.createFromPath(full).getSize()
    if (!width || !height) throw new Error('This image format cannot be read (PNG and JPEG can).')
    return { width, height, ratio: ratioOf(width, height) }
  }
  if (kindOf(full) !== 'video') throw new Error('Not an image or video.')
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'media-probe', webSecurity: false } })
  w.webContents.setAudioMuted(true)
  try {
    await w.loadURL('about:blank')
    const v: { width: number; height: number; duration: number } = await Promise.race([
      w.webContents.executeJavaScript(
        `new Promise((ok, no) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; const done = () => ok({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); v.onloadedmetadata = done; v.onerror = () => no(new Error('cannot decode')); v.src = ${JSON.stringify(pathToFileURL(full).href)} })`,
      ),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('timed out')), 15_000)),
    ])
    if (!v.width || !v.height) throw new Error('no video track')
    return { width: v.width, height: v.height, ratio: ratioOf(v.width, v.height), ...(Number.isFinite(v.duration) && { duration: Math.round(v.duration * 10) / 10 }) }
  } catch (e) {
    throw new Error(`The size of this video cannot be read (${(e as Error).message}).`)
  } finally {
    w.destroy()
  }
}

/** Görseli kırpar: `ratio` verilirse o oranda ortadan, yoksa `box`. Dönüş: yeni görselin verisi ve uzantısı. */
export function cropImage(full: string, by: { ratio?: string; box?: Box }) {
  const img = nativeImage.createFromPath(full)
  const { width, height } = img.getSize()
  if (!width || !height) throw new Error('This image format cannot be cropped (PNG and JPEG can).')
  const box = by.ratio ? centerCrop(width, height, by.ratio) : by.box!
  if (box.x < 0 || box.y < 0 || box.width < 1 || box.height < 1 || box.x + box.width > width || box.y + box.height > height) throw new Error(`The crop box is outside the image (${width}x${height}).`)
  const out = img.crop(box)
  const jpg = /^\.jpe?g$/i.test(extname(full))
  return { data: jpg ? out.toJPEG(92) : out.toPNG(), ext: jpg ? 'jpg' : 'png', ...box }
}
