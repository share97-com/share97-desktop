import { Check, Copy, ExternalLink, FolderOpen, Globe, Loader2, PencilLine, Puzzle, Settings2, Trash2, Unplug, X } from 'lucide-react'
import { useState } from 'react'
import type { ChromeInstance, ChromeState } from '../../shared/types.ts'
import { ConfirmButton } from './Confirm.tsx'
import { api, useChrome } from './hooks.ts'
import { dateTime, t } from './i18n.ts'
import { button, Card, Page, primary, Switch } from './ui.tsx'

const c = t.chrome
const icon = 'rounded p-1 text-muted hover:bg-raised hover:text-fg'
const message = (e: unknown) => String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Bir eylem; hata olursa satırın altında gösteriliyor. */
function useAction() {
  const [error, setError] = useState<string | null>(null)
  const run = (p: Promise<unknown>) => void p.then(() => setError(null), (e) => setError(message(e)))
  return { error, run }
}

/**
 * **Chrome ekranı.** Eklentiyle bağlanan gerçek Chrome profilleri: kurulum yönlendirmesi, onay,
 * her Chrome'un pencereleri ve sekmeleri, kurulu eklentileri. Agent bu Chrome'ları adlarıyla görüyor.
 */
export function ChromeView() {
  const s = useChrome()
  const [guide, setGuide] = useState(false)
  if (!s) return <Loader2 className="m-8 size-5 animate-spin" />
  const pending = s.instances.filter((x) => x.status === 'pending')
  const known = s.instances.filter((x) => x.status !== 'pending')
  return (
    <Page
      title={c.title}
      hint={c.hint}
      actions={
        <button type="button" className={primary} onClick={() => setGuide((g) => !g)} aria-expanded={guide || known.length === 0}>
          <Puzzle className="size-4" /> {c.install}
        </button>
      }
    >

        {!s.listening && (
          <Card className="border-danger/40">
            <p className="text-sm font-medium text-danger">{c.notListening}</p>
            <p className="text-sm text-muted">{s.error}</p>
          </Card>
        )}

        {(guide || known.length === 0) && <InstallGuide state={s} />}

        {pending.map((x) => (
          <Pending key={x.id} chrome={x} />
        ))}

        {known.map((x) => (
          <Instance key={x.id} chrome={x} />
        ))}

        {s.listening && <p className="text-xs text-muted">{c.listening(s.port)}</p>}
    </Page>
  )
}

function InstallGuide({ state }: { state: ChromeState }) {
  const [copied, setCopied] = useState(false)
  const [noChrome, setNoChrome] = useState(false)
  const { error, run } = useAction()
  const copy = () => void navigator.clipboard.writeText(state.extensionPath).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))
  return (
    <Card>
      <h3 className="text-sm font-medium">{c.installTitle}</h3>
      <p className="mb-4 mt-0.5 text-xs text-muted">{c.installHint}</p>
      <ol className="space-y-3">
        {c.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-2 font-mono text-xs text-fg-2">{i + 1}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p>{step}</p>
              {i === 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className={button} onClick={() => run(api().chrome.openFolder())}>
                    <FolderOpen className="size-4" /> {c.openFolder}
                  </button>
                  <button className={button} onClick={copy}>
                    {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />} {copied ? c.copied : c.copyPath}
                  </button>
                  <code className="min-w-0 max-w-full truncate rounded bg-raised px-2 py-1 font-mono text-xs text-muted" title={state.extensionPath}>
                    {state.extensionPath}
                  </code>
                </div>
              )}
              {i === 1 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className={button} onClick={() => void api().chrome.openChromeExtensions().then((ok) => setNoChrome(!ok))}>
                    <ExternalLink className="size-4" /> {c.openExtensions}
                  </button>
                  <code className="rounded bg-raised px-2 py-1 font-mono text-xs">chrome://extensions</code>
                </div>
              )}
              {i === 1 && noChrome && <p className="mt-1 text-xs text-danger">{c.noChrome}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-raised p-3 text-xs text-muted">{c.fileAccess}</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  )
}

function Pending({ chrome }: { chrome: ChromeInstance }) {
  return (
    <Card className="border-warn/50">
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.pending(chrome.name)}</p>
          <p className="text-xs text-muted">
            {c.version(chrome.version, chrome.chrome)}, {c.pendingHint}
          </p>
        </div>
        <button className={primary} onClick={() => void api().chrome.approve(chrome.id)}>
          <Check className="size-4" /> {c.approve}
        </button>
        <button className={button} onClick={() => void api().chrome.reject(chrome.id)}>
          <X className="size-4" /> {c.reject}
        </button>
      </div>
    </Card>
  )
}

function Instance({ chrome }: { chrome: ChromeInstance }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(chrome.name)
  const [url, setUrl] = useState('')
  const { error, run } = useAction()
  const online = chrome.status === 'connected'
  const saveName = () => {
    if (name.trim() && name !== chrome.name) void api().chrome.rename(chrome.id, name)
    setEditing(false)
  }
  const openTab = () => {
    const u = url.trim()
    if (!u) return
    run(api().chrome.openTab(chrome.id, u))
    setUrl('')
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${online ? 'bg-ok' : 'bg-line'}`} aria-hidden />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                saveName()
              }}
            >
              <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveName} className="w-full rounded-lg border border-muted/70 bg-bg px-2 py-1 text-sm outline-none focus:border-brand" aria-label={c.rename} />
            </form>
          ) : (
            <p className="flex items-center gap-2 font-medium">
              <span className="truncate">{chrome.name}</span>
              <button className={icon} aria-label={c.rename} title={c.rename} onClick={() => (setName(chrome.name), setEditing(true))}>
                <PencilLine className="size-3.5" />
              </button>
            </p>
          )}
          <p className="text-xs text-muted">
            {online ? `${c.connected}, ${c.version(chrome.version, chrome.chrome)}` : c.offlineHint(chrome.lastSeen ? dateTime.format(chrome.lastSeen) : '-')}
            {chrome.outdated && `, ${c.outdated}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm" title={c.agentHint}>
          {c.agent}
          <Switch on={chrome.agent} label={c.agent} onChange={(on) => void api().chrome.setAgent(chrome.id, on)} />
        </label>
        <ConfirmButton className={icon} armedClassName="bg-danger/15 !text-danger" label={c.forget} title={`${c.forget}. ${c.forgetHint}`} onConfirm={() => void api().chrome.forget(chrome.id)}>
          <Unplug className="size-4" />
        </ConfirmButton>
      </div>

      {online && (
        <>
          <h4 className="mb-2 mt-5 text-xs text-muted">{c.windows}</h4>
          <div className="space-y-3">
            {chrome.windows.map((w, i) => (
              <div key={w.id} className="rounded-lg border border-line">
                <p className="border-b border-line px-3 py-1.5 text-xs text-muted">{c.window(i + 1, w.focused, w.incognito)}</p>
                <ul className="divide-y divide-line">
                  {w.tabs.map((tab) => (
                    <li key={tab.id} className="group flex items-center gap-3 px-3 py-1.5">
                      {tab.favicon && /^(https?|data):/.test(tab.favicon) ? <img src={tab.favicon} alt="" className="size-4 shrink-0" /> : <Globe className="size-4 shrink-0 text-muted" />}
                      <button className="min-w-0 flex-1 text-left" title={c.show} onClick={() => run(api().chrome.activateTab(chrome.id, tab.id))}>
                        <p className={`truncate text-sm ${tab.active ? 'font-medium' : ''}`}>
                          {tab.loading && <Loader2 className="mr-1 inline size-3 animate-spin" />}
                          {tab.title || (tab.url === 'about:blank' ? c.emptyTab : tab.url)}
                        </p>
                        <p className="truncate text-xs text-muted">{tab.url}</p>
                      </button>
                      <button className={`${icon} opacity-0 focus:opacity-100 group-hover:opacity-100`} aria-label={c.show} title={c.show} onClick={() => run(api().chrome.activateTab(chrome.id, tab.id))}>
                        <ExternalLink className="size-4" />
                      </button>
                      <button className={`${icon} opacity-0 hover:!text-danger focus:opacity-100 group-hover:opacity-100`} aria-label={c.closeTab} title={c.closeTab} onClick={() => run(api().chrome.closeTab(chrome.id, tab.id))}>
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              openTab()
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={c.newTab} spellCheck={false} className="min-w-0 flex-1 rounded-full border border-muted/70 bg-bg px-3.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-brand" />
            <button className={button} type="submit" disabled={!url.trim()}>
              {c.open}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Extensions chrome={chrome} />
        </>
      )}
    </Card>
  )
}

function Extensions({ chrome }: { chrome: ChromeInstance }) {
  const { error, run } = useAction()
  const others = chrome.extensions.filter((x) => !x.self)
  const self = chrome.extensions.find((x) => x.self)
  return (
    <>
      <h4 className="mb-1 mt-5 text-xs text-muted">{c.extensions}</h4>
      <p className="mb-2 text-xs text-muted">{c.extensionsHint}</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {self && (
          <li className="flex items-center gap-3 px-3 py-2">
            <Puzzle className="size-4 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 truncate text-sm">
              {self.name} <span className="text-xs text-muted">{self.version}, {c.self}</span>
            </p>
          </li>
        )}
        {others.map((x) => (
          <li key={x.id} className="group flex items-center gap-3 px-3 py-2">
            <Puzzle className={`size-4 shrink-0 ${x.enabled ? 'text-fg' : 'text-muted'}`} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${x.enabled ? '' : 'text-muted'}`}>
                {x.name} <span className="text-xs text-muted">{x.version}</span>
              </p>
              {x.description && <p className="truncate text-xs text-muted">{x.description}</p>}
            </div>
            {x.optionsUrl && (
              <button className={`${icon} opacity-0 focus:opacity-100 group-hover:opacity-100`} aria-label={`${c.options}: ${x.name}`} title={c.options} onClick={() => run(api().chrome.extensionOptions(chrome.id, x.id))}>
                <Settings2 className="size-4" />
              </button>
            )}
            {x.mayDisable && (
              <button className={`${icon} opacity-0 hover:!text-danger focus:opacity-100 group-hover:opacity-100`} aria-label={`${c.uninstall}: ${x.name}`} title={c.uninstall} onClick={() => run(api().chrome.uninstallExtension(chrome.id, x.id))}>
                <Trash2 className="size-4" />
              </button>
            )}
            <Switch on={x.enabled} disabled={!x.mayDisable} label={x.name} onChange={(on) => run(api().chrome.setExtensionEnabled(chrome.id, x.id, on))} />
          </li>
        ))}
        {!others.length && <li className="px-3 py-2 text-sm text-muted">{c.noExtensions}</li>}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  )
}
