import { clipboard, Menu, shell, type BrowserWindow, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { isWebUrl } from './address.ts'
import { L, type Browsers } from './browsers.ts'

/**
 * **Uygulama arayüzüne sağ tık** (sohbet, ayarlar, Chrome ekranı). Web sayfalarının menüsü ayrı
 * (`Browsers.contextMenu`); kendi menüsü olan yerler (tarayıcı şeridi, sekmeler) `preventDefault`
 * ile bu menüyü açtırmıyor. Seçili metin, bağlantı, görsel ve yazı alanına göre Chrome'daki gibi.
 */
/** Tıklanan yer bir sohbetin içindeyse (`data-chat-id`) o sohbetin kimliği. */
export async function chatAt(wc: WebContents, x: number, y: number): Promise<string | null> {
  const id = await wc.executeJavaScript(`document.elementFromPoint(${Number(x)}, ${Number(y)})?.closest('[data-chat-id]')?.dataset.chatId ?? null`).catch(() => null)
  return typeof id === 'string' && id ? id : null
}

export async function appContextMenu(win: BrowserWindow, browsers: Browsers, p: ContextMenuParams, chatData: { count(chatId: string): number; open(chatId: string): void }) {
  const wc = win.webContents
  const l = L()
  const items: MenuItemConstructorOptions[] = []
  const chatId = await chatAt(wc, p.x, p.y)
  if (chatId) items.push({ label: `${l.chatData} (${chatData.count(chatId)})`, click: () => chatData.open(chatId) }, { type: 'separator' })
  const sep = () => items.length && items.at(-1)?.type !== 'separator' && items.push({ type: 'separator' })
  /** Bağlantı ya da arama: etkin tarayıcıda yeni sekme, tarayıcı yoksa yeni tarayıcı. */
  const openInApp = (url: string) => {
    const id = browsers.state().activeId ?? browsers.all().find((b) => b.open)?.id
    if (id && browsers.openTab(id, url, true)) browsers.activate(id)
    else browsers.create(undefined, url, true)
  }

  if (p.isEditable && p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) })
    items.push({ label: l.addWord, click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) })
    sep()
  }
  if (p.linkURL && isWebUrl(p.linkURL)) {
    items.push({ label: l.openInApp, click: () => openInApp(p.linkURL) }, { label: l.openExternal, click: () => void shell.openExternal(p.linkURL) }, { label: l.copyLink, click: () => clipboard.writeText(p.linkURL) })
    sep()
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push({ label: l.copyImage, click: () => wc.copyImageAt(p.x, p.y) })
    sep()
  }
  const selected = p.selectionText.trim()
  if (p.isEditable) {
    items.push(
      { label: l.undo, role: 'undo', enabled: p.editFlags.canUndo },
      { label: l.redo, role: 'redo', enabled: p.editFlags.canRedo },
      { type: 'separator' },
      { label: l.cut, role: 'cut', enabled: p.editFlags.canCut },
      { label: l.copy, role: 'copy', enabled: p.editFlags.canCopy },
      { label: l.paste, role: 'paste', enabled: p.editFlags.canPaste },
      { label: l.selectAll, role: 'selectAll' },
    )
  } else {
    if (selected) items.push({ label: l.copy, role: 'copy' }, { label: `${l.search}: "${selected.slice(0, 30)}${selected.length > 30 ? '…' : ''}"`, click: () => openInApp(`https://www.google.com/search?q=${encodeURIComponent(selected)}`) })
    items.push({ label: l.selectAll, role: 'selectAll' })
  }
  Menu.buildFromTemplate(items).popup({ window: win })
}
