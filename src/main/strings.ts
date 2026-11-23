import { app } from 'electron'
import { pickLocale, type Locale } from '../shared/locales.ts'
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
import type { Strings } from './locales/tr.ts'

/** Ana sürecin metinleri (menüler, izin penceresi, bildirimler, etkinlik günlüğü): arayüzle aynı on beş dil (`locales/`), dil sistemin dilinden. */
const DICTS: Record<Locale, Strings> = { tr, en, de, es, fr, it, nl, pl, sv, pt, hi, id, ko, ja, ar }
export const L = (): Strings => DICTS[pickLocale(app.getLocale())]
