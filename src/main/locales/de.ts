import type { Strings } from './tr.ts'

export const de: Strings = {
  translate: 'Diese Seite übersetzen',
  incognito: "Inkognito", newTab: "Neuer Tab", reload: "Neu laden", duplicate: "Duplizieren", unmute: "Website-Ton einschalten", mute: "Website stummschalten", close: "Schließen", closeOthers: "Andere Tabs schließen", reopen: "Geschlossenen Tab wieder öffnen", openLink: "Link in neuem Tab öffnen", copyLink: "Linkadresse kopieren", openImage: "Bild in neuem Tab öffnen", saveImage: "Bild speichern", copyImage: "Bild kopieren", undo: "Rückgängig", redo: "Wiederholen", cut: "Ausschneiden", copy: "Kopieren", paste: "Einfügen", selectAll: "Alles auswählen", search: "Google suchen nach", back: "Zurück", forward: "Vorwärts", print: "Drucken…", inspect: "Untersuchen", permAllow: "Zulassen", permDeny: "Blockieren", permAsk: "möchte eine Berechtigung für", permRemember: "Die Auswahl wird für diese Website in diesem Browser gespeichert.", browser: "Browser", approvalNeeded: "Genehmigung erforderlich", agentDone: "Der Agent ist fertig.", agentFailed: "Der Agent wurde gestoppt", openInApp: "Link in der App öffnen", openExternal: "Link im System-Browser öffnen", addWord: "Zum Wörterbuch hinzufügen", chatData: "Chat-Daten", quit: "Beenden",
  example: 'Beispiel-Workflow',
  sessionEnded: (handle: string) => `@${handle}: Die Sitzung ist beendet und der Workflow konnte mit diesem Konto nicht laufen. Klicke, um dich erneut anzumelden.`,
  started: 'gestartet',
  noContent: (flow: string) => `„${flow}" hat keine Inhalte mehr zum Teilen. Füge Inhalte zum Ordner hinzu oder erzeuge welche in der App.`,
  alreadyQueued: 'wartet schon in der Warteschlange, dieser Lauf wurde nicht hinzugefügt',
  queued: (ahead: number) => `in der Warteschlange (${ahead} Lauf/Läufe davor)`,
  offWhileQueued: 'in der Warteschlange ausgeschaltet, nicht ausgeführt',
  runDone: 'fertig',
  runSkipped: 'übersprungen',
  stoppedFromSite: 'über die Website gestoppt',
}
