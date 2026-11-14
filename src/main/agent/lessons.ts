import { randomUUID } from 'node:crypto'

/**
 * **Kalıcı hafıza.** Sohbetler arası kısa notlar: bir sitede deneyerek bulunan yol ("Google Ads'te
 * indirme menüsü tablonun sağ üstünde, .csv ikinci seçenek") ve kullanıcının kalıcı tercihleri.
 * Agent `save_memory` ile yazıyor, her sohbetin sistem isteminde görüyor: aynı yolu her sohbette
 * yeniden keşfetmiyor. Notlar ipucu, talimat değil (sistem istemi öyle sunuyor).
 * Burası kural (saf); dosyası `lesson-store.ts`te.
 * ponytail: hepsi isteme giriyor; `MAX` dolunca en eski düşüyor. Çok büyürse aramalı depo.
 */
export type Lesson = { id: string; text: string; ts: number }

const MAX = 60
export const MAX_LESSON = 300

/** Yeni not; aynı metin yeniden gelirse yalnız tarihi yenileniyor. */
export function withLesson(list: Lesson[], text: string, now = Date.now()): { list: Lesson[]; lesson: Lesson } {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LESSON)
  if (!t) throw new Error('Empty memory.')
  const same = list.find((l) => l.text.toLocaleLowerCase() === t.toLocaleLowerCase())
  const lesson = same ? { ...same, ts: now } : { id: randomUUID().slice(0, 6), text: t, ts: now }
  return { list: [...list.filter((l) => l !== same), lesson].slice(-MAX), lesson }
}
