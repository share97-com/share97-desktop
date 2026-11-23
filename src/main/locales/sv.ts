import type { Strings } from './tr.ts'

export const sv: Strings = {
  translate: 'Översätt den här sidan',
  incognito: "Inkognito", newTab: "Ny flik", reload: "Ladda om", duplicate: "Duplicera", unmute: "Ljud på för webbplatsen", mute: "Ljud av för webbplatsen", close: "Stäng", closeOthers: "Stäng övriga flikar", reopen: "Öppna stängd flik igen", openLink: "Öppna länk i ny flik", copyLink: "Kopiera länkadress", openImage: "Öppna bild i ny flik", saveImage: "Spara bild", copyImage: "Kopiera bild", undo: "Ångra", redo: "Gör om", cut: "Klipp ut", copy: "Kopiera", paste: "Klistra in", selectAll: "Markera allt", search: "Sök på Google efter", back: "Bakåt", forward: "Framåt", print: "Skriv ut…", inspect: "Inspektera", permAllow: "Tillåt", permDeny: "Blockera", permAsk: "vill ha behörighet för", permRemember: "Valet sparas för den här webbplatsen i den här webbläsaren.", browser: "Webbläsare", approvalNeeded: "Godkännande krävs", agentDone: "Agenten är klar.", agentFailed: "Agenten stoppades", openInApp: "Öppna länk i appen", openExternal: "Öppna länk i systemets webbläsare", addWord: "Lägg till i ordlistan", chatData: "Chattdata", quit: "Avsluta",
  example: 'Exempelarbetsflöde',
  sessionEnded: (handle: string) => `@${handle}: sessionen har avslutats och arbetsflödet kunde inte köras på det här kontot. Klicka för att logga in igen.`,
  started: 'startad',
  noContent: (flow: string) => `"${flow}" har inget innehåll kvar att dela. Lägg till innehåll i mappen eller generera något i appen.`,
  alreadyQueued: 'väntar redan i kön, den här körningen lades inte till',
  queued: (ahead: number) => `i kö (${ahead} körning(ar) före)`,
  offWhileQueued: 'avstängt medan det väntade i kön, kördes inte',
  runDone: 'klart',
  runSkipped: 'hoppades över',
  stoppedFromSite: 'stoppad från webbplatsen',
}
