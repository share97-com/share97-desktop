import type { Strings } from './tr.ts'

export const it: Strings = {
  translate: 'Traduci questa pagina',
  incognito: 'Incognito', newTab: "Nuova scheda", reload: "Ricarica", duplicate: "Duplica", unmute: "Riattiva audio del sito", mute: "Disattiva audio del sito", close: "Chiudi", closeOthers: "Chiudi altre schede", reopen: "Riapri scheda chiusa", openLink: "Apri link in una nuova scheda", copyLink: "Copia indirizzo del link", openImage: "Apri immagine in una nuova scheda", saveImage: "Salva immagine", copyImage: "Copia immagine", undo: "Annulla", redo: "Ripeti", cut: "Taglia", copy: "Copia", paste: "Incolla", selectAll: "Seleziona tutto", search: "Cerca con Google", back: "Indietro", forward: "Avanti", print: "Stampa…", inspect: "Ispeziona", permAllow: "Consenti", permDeny: "Blocca", permAsk: "chiede l'autorizzazione per", permRemember: "La scelta viene ricordata per questo sito in questo browser.", browser: "Browser", approvalNeeded: "Serve approvazione", agentDone: "L'agente ha finito.", agentFailed: "L'agente si è fermato", openInApp: "Apri link nell'app", openExternal: "Apri link nel browser di sistema", addWord: "Aggiungi al dizionario", chatData: "Dati della chat", quit: "Esci",
  example: 'Workflow di esempio',
  sessionEnded: (handle: string) => `@${handle}: la sessione è terminata e il workflow non ha potuto girare su questo account. Clicca per accedere di nuovo.`,
  started: 'avviato',
  noContent: (flow: string) => `«${flow}» non ha più contenuti da condividere. Aggiungi contenuti alla sua cartella o generali nell'app.`,
  alreadyQueued: 'già in attesa in coda, questa esecuzione non è stata aggiunta',
  queued: (ahead: number) => `in coda (${ahead} esecuzione/i davanti)`,
  offWhileQueued: 'disattivato mentre era in coda, non eseguito',
  runDone: 'completato',
  runSkipped: 'saltato',
  stoppedFromSite: 'interrotto dal sito',
}
