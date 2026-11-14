/**
 * **Otomatik paylaşım** turunun saf kısmı (main ve testler okuyor). Ayar sitenin Ayarlar'ında; tur
 * sunucudan alınıyor (`/api/v1/worker/auto-content`), her seçili dil için bir paylaşım, hesaplara
 * sırayla, konusu rastgele.
 */
export const LANGUAGES: Record<string, string> = { tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', pt: 'Portuguese', hi: 'Hindi', id: 'Indonesian', ko: 'Korean', ja: 'Japanese', ar: 'Arabic' }

/** Kullanıcı konu yazmadıysa: markadan bağımsız, her alana uyan açılar. */
export const DEFAULT_TOPICS = [
  'A practical tip our audience can use today',
  'A common mistake in our field and how to avoid it',
  'A short behind-the-scenes story from our work',
  'A frequently asked question, answered simply',
  'A simple checklist for beginners in our field',
  'A myth in our field, and what is actually true',
  'A question that invites our audience to share their experience',
  'A small habit that brings steady results in our field',
]

export type AutoRound = { locales: string[]; topics: string; tone: string; turn: number }
export type AutoJob = { locale: string; topic: string; accountId: string; tone: string }

export function randomTopic(written: string | null | undefined, random = Math.random) {
  const own = (written ?? '').split('\n').map((t) => t.trim()).filter(Boolean)
  const pool = own.length ? own : DEFAULT_TOPICS
  return pool[Math.floor(random() * pool.length)]
}

/** Turun işleri: dil başına bir tane, hesaplar sırayla (`turn` her turda kaydırıyor). */
export function planRound(round: AutoRound, accountIds: string[], random = Math.random): AutoJob[] {
  if (!accountIds.length) return []
  return round.locales.filter((l) => LANGUAGES[l]).map((locale, i) => ({ locale, topic: randomTopic(round.topics, random), accountId: accountIds[(round.turn + i) % accountIds.length], tone: round.tone }))
}

/** Metin modelinin sistem talimatı; yanıt `{"caption","imagePrompt"}` JSON. */
export const postInstruction = (locale: string, tone: string) =>
  [
    `You write social media posts. Write in ${LANGUAGES[locale]}.`,
    'Open with a strong hook, use short paragraphs and at most three emojis, end with a call to action.',
    'Never invent prices, statistics, quotes or claims about real people.',
    tone ? `Brand voice: ${tone.slice(0, 500)}` : '',
    'Reply with JSON: {"caption": string, "imagePrompt": string}. imagePrompt is in English and describes one image with no text in it.',
  ]
    .filter(Boolean)
    .join('\n')
