/** Arayüzün dilleri: sitedekilerle aynı on beş dil (`modules/i18n/locales.ts`). Tanınmayan dilde İngilizce. */
export const LOCALES = ['tr', 'en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'sv', 'pt', 'hi', 'id', 'ko', 'ja', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

/** `tr-TR`, `pt-BR`, `en_US` → dil kodu. */
export const pickLocale = (tag: string | undefined): Locale => {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0]
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : 'en'
}

export const dirOf = (l: Locale) => (l === 'ar' ? 'rtl' : 'ltr')

/** Sitenin dil önekli yolu: İngilizce öneksiz (`/calendar`), öteki diller `/tr/calendar`. */
export const sitePath = (l: Locale, path: string) => {
  const p = path.startsWith('/') ? path : '/'
  return l === 'en' ? p : `/${l}${p === '/' ? '' : p}`
}
