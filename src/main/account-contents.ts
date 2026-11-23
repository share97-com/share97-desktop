import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanHandle, jobPrompt, platformOf } from '../shared/platforms.ts'
import { dayTimes, intervalSlots, MAX_CAPTION, planSlots, type AccountContent } from '../shared/contents.ts'
import { agentBrowser, closeAfterJob, localAccounts, openForJob, sessionProblem, type LocalAccount } from './accounts.ts'
import type { Agent } from './agent/index.ts'
import { accountRel, contentFiles, contentsRel, listContents, setContentStatus } from './contents.ts'
import * as ws from './workspace.ts'

/**
 * **Hesabın paylaşım planı** (`accounts/<kullanıcı adı>/<platform>/schedule.json`). Sohbetten kurulur: agent önce kullanıcıya
 * günde kaç paylaşım istediğini sorar, sonra hesabın bekleyen içeriklerini (`contents/1, 2…`) günlere dağıtır (`planAccount`).
 * Platform kendi zamanlayıcısını sunuyorsa agent içerikleri hesabın tarayıcısında orada zamanlar (`markScheduled`: içerik
 * `published`, notu "scheduled on …"); sunmuyorsa zamanı gelen içeriği cihaz kendisi paylaşır (`accountStep`, uygulama açıkken).
 */

type Plan = { perDay?: number; everyHours?: number; times: string[]; slots: Record<string, string> }

/** İçerik paylaşılabilir mi (model çağrılmadan): platform görsel/video istiyorsa olmalı, klasör boş olmamalı. Sorun yoksa `null`. */
const unusable = (l: LocalAccount, i: { caption: string; media: unknown[] }) => {
  const p = platformOf(l.platform)
  return p?.needsMedia && !i.media.length ? `${p.label} needs an image or video` : !i.caption && !i.media.length ? 'the folder has no text file and no image or video' : null
}

const planFile = (l: LocalAccount) => join(ws.root(), accountRel(l), 'schedule.json')
const readPlan = async (l: LocalAccount): Promise<Plan | null> => JSON.parse(await readFile(planFile(l), 'utf8').catch(() => 'null')) as Plan | null

/** Agent'ın verdiği ad (`@ad` ya da hesap kimliği) → bu cihazdaki hesap. Aynı ad iki platformdaysa `platform` gerekir. */
export function findAccount(handle: string, platform?: string): LocalAccount {
  const h = cleanHandle(handle).toLowerCase()
  const hits = localAccounts().filter((l) => (l.id === handle || l.handle.toLowerCase() === h) && (!platform || l.platform === platform))
  if (hits.length > 1) throw new Error(`@${h} is on several platforms (${hits.map((l) => l.platform).join(', ')}): pass platform.`)
  if (!hits[0]) throw new Error(`No account @${h}${platform ? ` on ${platform}` : ''} is signed in on this computer.`)
  return hits[0]
}

/** Hesabın içerikleri ve plandaki paylaşım zamanları. */
export async function plannedContents(l: LocalAccount): Promise<AccountContent[]> {
  const plan = await readPlan(l)
  return (await listContents(l)).map((i) => ({ ...i, at: i.status === 'pending' ? (plan?.slots[i.folder] ?? null) : null }))
}

/**
 * **Toplu plan.** Hesabın bekleyen içeriklerini önce denetler (paylaşılamayacak olan plana girmez, `skipped`), sonra klasör
 * sırasıyla dağıtır: `everyHours` verilmişse `from`dan başlayıp her N saatte bir; yoksa günde `perDay` paylaşım (saatler
 * `times` ya da gün içine eşit, bkz. `dayTimes`), `from`dan sonra. Önceki plan yeniden yazılır.
 */
export async function planAccount(l: LocalAccount, o: { perDay?: number; everyHours?: number; times?: string[]; from?: Date }) {
  const pending = (await listContents(l)).filter((i) => i.status === 'pending')
  const skipped = pending.flatMap((i) => (unusable(l, i) ? [{ folder: i.folder, reason: unusable(l, i)! }] : []))
  const folders = pending.filter((i) => !unusable(l, i)).map((i) => i.folder)
  if (!folders.length) throw new Error(`No usable pending content in ${contentsRel(l)}${skipped.length ? ` (${skipped.map((x) => `${x.folder}: ${x.reason}`).join('; ')})` : ''}. Add contents first.`)
  const from = o.from ?? new Date()
  const day = o.times?.length ? o.times : dayTimes(o.perDay ?? 1)
  const plan: Plan = o.everyHours ? { everyHours: o.everyHours, times: [], slots: intervalSlots(folders, o.everyHours, from) } : { perDay: o.perDay ?? day.length, times: day, slots: planSlots(folders, day, from) }
  await writeFile(planFile(l), JSON.stringify(plan, null, 2))
  ws.changed()
  return { slots: plan.slots, skipped }
}

/** Agent içeriği platformun kendi zamanlayıcısında zamanladı: cihaz bir daha paylaşmaz. */
export async function markScheduled(l: LocalAccount, folder: string, note: string) {
  const at = (await readPlan(l))?.slots[folder]
  await setContentStatus(l, folder, 'published', `scheduled on ${platformOf(l.platform)?.label ?? l.platform}${at ? ` for ${at}` : ''} ${note}`.trim())
}

/**
 * Bir adım (cihaz yoklamasında): planda zamanı gelmiş ilk bekleyen içerik, hesabın tarayıcısında agent ile paylaşılır.
 * ponytail: yoklama başına en çok bir paylaşım; uygulama kapalıyken kaçanlar açılınca sırayla gider.
 */
export async function accountStep(agent: Agent, run: <T>(fn: () => Promise<T>) => Promise<T>): Promise<{ text: string; ok: boolean; chatId?: string } | null> {
  const now = Date.now()
  for (const l of localAccounts()) {
    const browserId = agentBrowser(l)
    if (!browserId) continue
    const due = (await plannedContents(l).catch(() => [])).find((i) => i.at && Date.parse(i.at) <= now)
    if (!due) continue
    const where = `@${l.handle} #${due.folder}`
    const p = platformOf(l.platform)
    const invalid = unusable(l, due)
    if (invalid) {
      await setContentStatus(l, due.folder, 'failed', invalid)
      return { text: `${where}: ${invalid}`, ok: false }
    }
    // Oturum düştüyse içerik bekler: giriş yapılınca paylaşılır.
    const problem = await sessionProblem(l)
    if (problem) return { text: `${where}: ${problem.error}`, ok: false }
    await setContentStatus(l, due.folder, 'publishing')
    const files = contentFiles(l, due.folder, due.media.map((m) => `local:${due.folder}/${m.file}`))
    const type = due.media.length === 1 && due.media[0].kind === 'video' ? 'reel' : 'feed'
    const prompt = jobPrompt({ platform: l.platform, handle: l.handle, browserId, post: { type, caption: due.caption.slice(0, MAX_CAPTION) }, files, folder: contentsRel(l, due.folder) })
    try {
      let opened: string | null = null
      const r = await run(() => ((opened = openForJob(l)), agent.task(`Planned post · @${l.handle} (${p?.label ?? l.platform}) #${due.folder}`, prompt, null, browserId)))
      if (opened && r.ok) closeAfterJob(opened)
      await setContentStatus(l, due.folder, r.ok ? 'published' : 'failed', r.ok ? (r.permalink ?? '') : r.summary)
      return { text: `${where}: ${r.ok ? 'published' : r.summary}`, ok: r.ok, chatId: r.chatId }
    } catch (e) {
      await setContentStatus(l, due.folder, 'failed', (e as Error).message)
      return { text: `${where}: ${(e as Error).message}`, ok: false }
    }
  }
  return null
}
