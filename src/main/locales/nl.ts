import type { Strings } from './tr.ts'

export const nl: Strings = {
  translate: 'Deze pagina vertalen',
  incognito: "Incognito", newTab: "Nieuw tabblad", reload: "Opnieuw laden", duplicate: "Dupliceren", unmute: "Geluid van site aanzetten", mute: "Site dempen", close: "Sluiten", closeOthers: "Andere tabbladen sluiten", reopen: "Gesloten tabblad heropenen", openLink: "Link openen in nieuw tabblad", copyLink: "Linkadres kopiëren", openImage: "Afbeelding openen in nieuw tabblad", saveImage: "Afbeelding opslaan", copyImage: "Afbeelding kopiëren", undo: "Ongedaan maken", redo: "Opnieuw", cut: "Knippen", copy: "Kopiëren", paste: "Plakken", selectAll: "Alles selecteren", search: "Google doorzoeken op", back: "Terug", forward: "Vooruit", print: "Afdrukken…", inspect: "Inspecteren", permAllow: "Toestaan", permDeny: "Blokkeren", permAsk: "vraagt toestemming voor", permRemember: "De keuze wordt onthouden voor deze site in deze browser.", browser: "Browser", approvalNeeded: "Goedkeuring nodig", agentDone: "De agent is klaar.", agentFailed: "De agent is gestopt", openInApp: "Link openen in de app", openExternal: "Link openen in de systeembrowser", addWord: "Toevoegen aan woordenboek", chatData: "Chatgegevens", quit: "Afsluiten",
  example: 'Voorbeeldworkflow',
  sessionEnded: (handle: string) => `@${handle}: de sessie is verlopen en de workflow kon niet draaien op dit account. Klik om opnieuw in te loggen.`,
  started: 'gestart',
  noContent: (flow: string) => `"${flow}" heeft geen content meer om te delen. Voeg content toe aan de map of genereer er wat in de app.`,
  alreadyQueued: 'wacht al in de wachtrij, deze run is niet toegevoegd',
  queued: (ahead: number) => `in de wachtrij (${ahead} run(s) ervoor)`,
  offWhileQueued: 'uitgezet terwijl hij in de wachtrij stond, niet uitgevoerd',
  runDone: 'klaar',
  runSkipped: 'overgeslagen',
  stoppedFromSite: 'gestopt via de website',
}
