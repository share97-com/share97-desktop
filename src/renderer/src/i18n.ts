import { dirOf, pickLocale, type Locale } from '../../shared/locales.ts'
import { tr } from './locales/tr.ts'
import { en } from './locales/en.ts'
import { de } from './locales/de.ts'
import { es } from './locales/es.ts'
import { fr } from './locales/fr.ts'
import { it } from './locales/it.ts'
import { nl } from './locales/nl.ts'
import { pl } from './locales/pl.ts'
import { sv } from './locales/sv.ts'
import { pt } from './locales/pt.ts'
import { hi } from './locales/hi.ts'
import { id } from './locales/id.ts'
import { ko } from './locales/ko.ts'
import { ja } from './locales/ja.ts'
import { ar } from './locales/ar.ts'
import type { Dict } from './locales/tr.ts'

/** Arayüz metinleri: sitedekilerle aynı on beş dil (`locales/`), dil sistemin dilinden; tanınmayan dilde İngilizce. */
const DICTS: Record<Locale, Dict> = { tr, en, de, es, fr, it, nl, pl, sv, pt, hi, id, ko, ja, ar }

export const lang = pickLocale(navigator.language)
export const dir = dirOf(lang)
export const t = DICTS[lang]
export const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' })
/** Sohbet maliyeti küçük tutarlar: 4 ondalık. */
export const cost = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
export const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
