import type { Strings } from './tr.ts'

export const pl: Strings = {
  translate: 'Przetłumacz tę stronę',
  incognito: 'Incognito', newTab: "Nowa karta", reload: "Odśwież", duplicate: "Duplikuj", unmute: "Włącz dźwięk witryny", mute: "Wycisz witrynę", close: "Zamknij", closeOthers: "Zamknij pozostałe karty", reopen: "Otwórz ponownie zamkniętą kartę", openLink: "Otwórz link w nowej karcie", copyLink: "Kopiuj adres linku", openImage: "Otwórz obraz w nowej karcie", saveImage: "Zapisz obraz", copyImage: "Kopiuj obraz", undo: "Cofnij", redo: "Ponów", cut: "Wytnij", copy: "Kopiuj", paste: "Wklej", selectAll: "Zaznacz wszystko", search: "Szukaj w Google:", back: "Wstecz", forward: "Dalej", print: "Drukuj…", inspect: "Zbadaj", permAllow: "Zezwól", permDeny: "Zablokuj", permAsk: "prosi o uprawnienie:", permRemember: "Wybór jest zapamiętywany dla tej witryny w tej przeglądarce.", browser: "Przeglądarka", approvalNeeded: "Wymagane zatwierdzenie", agentDone: "Agent zakończył pracę.", agentFailed: "Agent się zatrzymał", openInApp: "Otwórz link w aplikacji", openExternal: "Otwórz link w przeglądarce systemowej", addWord: "Dodaj do słownika", chatData: "Dane czatu", quit: "Zakończ",
  example: 'Przykładowy workflow',
  sessionEnded: (handle: string) => `@${handle}: sesja wygasła i workflow nie mógł się uruchomić na tym koncie. Kliknij, aby zalogować się ponownie.`,
  started: 'rozpoczęto',
  noContent: (flow: string) => `„${flow}” nie ma już treści do udostępnienia. Dodaj treści do jego folderu lub wygeneruj je w aplikacji.`,
  alreadyQueued: 'już czeka w kolejce, to uruchomienie nie zostało dodane',
  queued: (ahead: number) => `w kolejce (uruchomień przed nim: ${ahead})`,
  offWhileQueued: 'wyłączony w czasie oczekiwania w kolejce, nie uruchomiono',
  runDone: 'zakończono',
  runSkipped: 'pominięto',
  stoppedFromSite: 'zatrzymano z poziomu strony',
}
