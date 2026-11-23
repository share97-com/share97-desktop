/**
 * Platform tablosu — saf (main, renderer ve testler okuyor). Yeni platform = buraya bir satır;
 * kimlikler sunucudaki `SocialPlatform` ile aynı.
 *
 * `cookie`: oturumun açıldığını gösteren çerez. Sayfadaki işi agent yapıyor.
 * `scheduler`: platformun tarayıcıdaki kendi zamanlayıcısına giden yol (agent'a ipucu); yoksa paylaşımı zamanında uygulama yapar.
 */
export type Platform = { label: string; color: string; login: string; home: string; profile: string; cookie: { url: string; name: string }; needsMedia?: boolean; desktop?: boolean; scheduler?: string }

export const PLATFORMS = {
  instagram: { label: 'Instagram', color: '#e1306c', login: 'https://www.instagram.com/accounts/login/', home: 'https://www.instagram.com/', profile: 'https://www.instagram.com/{}/', cookie: { url: 'https://www.instagram.com', name: 'sessionid' }, needsMedia: true, desktop: true, scheduler: `Meta Business Suite composer (https://business.facebook.com/latest/composer, desktop view): pick this account under "Post to", add the media and text, turn on "Set date and time" and choose Schedule. instagram.com itself cannot schedule; the account must be a professional account connected in Business Suite.` },
  tiktok: { label: 'TikTok', color: '#25f4ee', login: 'https://www.tiktok.com/login', home: 'https://www.tiktok.com/', profile: 'https://www.tiktok.com/@{}', cookie: { url: 'https://www.tiktok.com', name: 'sessionid' }, needsMedia: true, scheduler: 'TikTok Studio upload (https://www.tiktok.com/tiktokstudio/upload, desktop view): after the video is attached, under "When to post" choose Schedule and set the time.' },
  x: { label: 'X', color: '#9ca3af', login: 'https://x.com/i/flow/login', home: 'https://x.com/home', profile: 'https://x.com/{}', cookie: { url: 'https://x.com', name: 'auth_token' }, scheduler: 'The composer on x.com in desktop view: the Schedule icon (calendar with a clock) in the row of icons under the text.' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', login: 'https://www.linkedin.com/login', home: 'https://www.linkedin.com/feed/', profile: 'https://www.linkedin.com/in/{}/', cookie: { url: 'https://www.linkedin.com', name: 'li_at' }, scheduler: 'Start a post, then the clock icon next to the Post button ("Schedule for later").' },
  facebook: { label: 'Facebook', color: '#1877f2', login: 'https://www.facebook.com/login', home: 'https://www.facebook.com/', profile: 'https://www.facebook.com/{}', cookie: { url: 'https://www.facebook.com', name: 'c_user' }, scheduler: `Meta Business Suite composer (https://business.facebook.com/latest/composer, desktop view): pick this account under "Post to", add the media and text, turn on "Set date and time" and choose Schedule. Only Pages can be scheduled, not personal profiles.` },
  youtube: { label: 'YouTube', color: '#ff0000', login: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://studio.youtube.com/', home: 'https://studio.youtube.com/', profile: 'https://www.youtube.com/@{}', cookie: { url: 'https://www.youtube.com', name: 'SAPISID' }, needsMedia: true, desktop: true, scheduler: 'YouTube Studio upload: on the Visibility step choose Schedule and set the date and time.' },
  pinterest: { label: 'Pinterest', color: '#e60023', login: 'https://www.pinterest.com/login/', home: 'https://www.pinterest.com/', profile: 'https://www.pinterest.com/{}/', cookie: { url: 'https://www.pinterest.com', name: '_auth' }, needsMedia: true, scheduler: 'Pin creation tool (https://www.pinterest.com/pin-creation-tool/, desktop view): "Publish at a later date" (business accounts).' },
  threads: { label: 'Threads', color: '#a3a3a3', login: 'https://www.threads.com/login', home: 'https://www.threads.com/', profile: 'https://www.threads.com/@{}', cookie: { url: 'https://www.threads.com', name: 'sessionid' } },
  reddit: { label: 'Reddit', color: '#ff4500', login: 'https://www.reddit.com/login/', home: 'https://www.reddit.com/', profile: 'https://www.reddit.com/user/{}/', cookie: { url: 'https://www.reddit.com', name: 'reddit_session' } },
} satisfies Record<string, Platform>

export type PlatformId = keyof typeof PLATFORMS
export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]
export const isPlatform = (v: unknown): v is PlatformId => typeof v === 'string' && Object.hasOwn(PLATFORMS, v)
export const platformOf = (id: string): Platform | null => (isPlatform(id) ? PLATFORMS[id] : null)

/** Plan kurulunca agent'a verilen yön: platformun kendi zamanlayıcısı varsa orada zamanla, yoksa uygulama paylaşır. */
export const schedulerNote = (id: string) => {
  const p = platformOf(id)
  return p?.scheduler
    ? `${p.label} can schedule posts itself. Route (a starting point, the site may have changed: read the page): ${p.scheduler} For each content, one at a time: open that screen, call upload_account_content (it attaches the files and returns the text and the planned time), fill the text, set that date and time, confirm, check the page shows it as scheduled, then call mark_account_content_scheduled. If the scheduler is not there for this account, stop after one look and leave the contents: this app publishes each at its time while it is running.`
    : `${p?.label ?? id} has no scheduler of its own in the browser: leave the contents, this app publishes each at its time while it is running.`
}

/** Hesap tarayıcısının varsayılan görünümü: yükleme ekranı yalnız masaüstü sitesinde olan platformlar (`desktop`) dışında mobil. */
export const defaultLayout = (id: string) => (platformOf(id)?.desktop ? 'desktop' : 'mobile')

/** Kullanıcı adı: baştaki @ ve boşluklar adın parçası değil. */
export const cleanHandle = (raw: string) => raw.trim().replace(/^@+/, '').slice(0, 80)

/** Hesabın profil adresi. */
export const profileUrl = (id: PlatformId, handle: string) => PLATFORMS[id].profile.replace('{}', encodeURIComponent(cleanHandle(handle)))

/** `local`: içerik bu cihazdaki bir hesabın içerik klasöründen (bkz. `contents.ts`); medya adresleri `local:<klasör>/<dosya>`. */
export type JobPost = { type?: string; caption?: string; media?: { url: string; kind?: string }[]; firstComment?: string; instruction?: string; local?: { accountId: string; folder: string } }

/** Yayın öncesi yerel denetim (model çağrılmadan); `null` geçti demek. Talimatlı iş paylaşım değil, denetlenmiyor. */
export function checkPost(id: string, post: JobPost): string | null {
  const p = platformOf(id)
  if (!p) return `unsupported platform: ${id}`
  const media = post.media ?? []
  if (media.some((m) => !(post.local ? /^local:/ : /^https:\/\//).test(m.url))) return post.local ? 'media must come from the content folder' : 'media must be https'
  if (post.instruction) return null
  if (p.needsMedia && !media.length) return `${p.label} needs an image or video`
  if (!(post.caption ?? '').trim() && !media.length) return 'post is empty'
  return null
}

/**
 * Sunucudan gelen işin agent'a verilen görev metni. Talimat yoksa görev paylaşımdır. Metin ve
 * talimat kullanıcının kendi akışından geliyor; sayfa içeriği gibi güvenilmeyen veri değil.
 */
export function jobPrompt(o: { platform: string; handle: string; browserId: string; post: JobPost; files: string[]; folder?: string }) {
  const label = platformOf(o.platform)?.label ?? o.platform
  return [
    `Work only in browser_id ${o.browserId}: it is signed in to the ${label} account @${o.handle}. Stay on ${label}.`,
    ...(o.post.instruction
      ? [`Chat message from the owner's Share97 workflow (one step of the workflow; earlier steps of this run, if any, are above in this chat: build on their results): ${o.post.instruction}`]
      : [`Publish this ${o.post.type ?? 'feed'} post on the account, uploading every file, and check on the page that it was published.`]),
    ...(o.post.caption ? [`Post caption (use it exactly): ${JSON.stringify(o.post.caption)}`] : []),
    ...(o.post.firstComment ? [`Right after publishing, add this first comment: ${JSON.stringify(o.post.firstComment)}`] : []),
    ...(o.files.length ? [`Files to upload (workspace paths, use upload_files): ${o.files.join(', ')}`] : []),
    ...(o.folder ? [`This content comes from the account content folder ${o.folder} (workspace path). Before publishing, check that every listed file is there and can be uploaded; if one is missing or unusable, stop and call finish_task with success=false.`] : []),
    'Do each action once and never press a final publish or send button twice.',
    'If sign-in, a captcha, identity verification, a rate limit or a warning about automation appears, stop: call finish_task with success=false (and signed_out=true when the account is signed out). Do not try to get around it.',
    "When done, call finish_task: success, a one-line summary, and the post's address in permalink if the page shows one.",
  ].join('\n')
}

/** Akış işi hesabın bağlantıda tanımlı tarayıcısına kilitli (agent `Ctx.only`): araç başka tarayıcı kullanamaz, yenisini açamaz. Sorun yoksa `null`. */
export function lockProblem(only: string | undefined, name: string, args: unknown): string | null {
  if (!only) return null
  if (name === 'create_browser') return `This task may only use browser_id ${only} (the account's own signed-in browser). Do not create another browser.`
  const id = (args as { browser_id?: unknown } | null)?.browser_id
  return typeof id === 'string' && id !== only ? `This task may only use browser_id ${only} (the account's own signed-in browser), not ${id}.` : null
}
