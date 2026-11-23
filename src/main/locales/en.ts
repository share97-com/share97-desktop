import type { Strings } from './tr.ts'

export const en: Strings = {
  translate: 'Translate this page',
  incognito: 'Incognito', newTab: "New tab", reload: "Reload", duplicate: "Duplicate", unmute: "Unmute site", mute: "Mute site", close: "Close", closeOthers: "Close other tabs", reopen: "Reopen closed tab", openLink: "Open link in new tab", copyLink: "Copy link address", openImage: "Open image in new tab", saveImage: "Save image", copyImage: "Copy image", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all", search: "Search Google for", back: "Back", forward: "Forward", print: "Print…", inspect: "Inspect", permAllow: "Allow", permDeny: "Block", permAsk: "wants permission for", permRemember: "The choice is remembered for this site in this browser.", browser: "Browser", approvalNeeded: "Approval needed", agentDone: "The agent finished.", agentFailed: "The agent stopped", openInApp: "Open link in the app", openExternal: "Open link in the system browser", addWord: "Add to dictionary", chatData: "Chat data", quit: "Quit",
  example: 'Example workflow',
  sessionEnded: (handle: string) => `@${handle}: the session ended and the workflow could not run on this account. Click to sign in again.`,
  started: 'started',
  noContent: (flow: string) => `"${flow}" has no content left to share. Add content to its folder or generate some in the app.`,
  alreadyQueued: 'already waiting in the queue, this run was not added',
  queued: (ahead: number) => `queued (${ahead} run(s) ahead)`,
  offWhileQueued: 'turned off while waiting in the queue, not run',
  runDone: 'done',
  runSkipped: 'skipped',
  stoppedFromSite: 'stopped from the site',
}
