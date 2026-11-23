import type { Strings } from './tr.ts'

export const fr: Strings = {
  translate: 'Traduire cette page',
  incognito: 'Navigation privée', newTab: "Nouvel onglet", reload: "Actualiser", duplicate: "Dupliquer", unmute: "Réactiver le son du site", mute: "Couper le son du site", close: "Fermer", closeOthers: "Fermer les autres onglets", reopen: "Rouvrir l’onglet fermé", openLink: "Ouvrir le lien dans un nouvel onglet", copyLink: "Copier l’adresse du lien", openImage: "Ouvrir l’image dans un nouvel onglet", saveImage: "Enregistrer l’image", copyImage: "Copier l’image", undo: "Annuler", redo: "Rétablir", cut: "Couper", copy: "Copier", paste: "Coller", selectAll: "Tout sélectionner", search: "Rechercher sur Google", back: "Retour", forward: "Avancer", print: "Imprimer…", inspect: "Inspecter", permAllow: "Autoriser", permDeny: "Bloquer", permAsk: "demande l’autorisation pour", permRemember: "Le choix est mémorisé pour ce site dans ce navigateur.", browser: "Navigateur", approvalNeeded: "Approbation requise", agentDone: "L’agent a terminé.", agentFailed: "L’agent s’est arrêté", openInApp: "Ouvrir le lien dans l’app", openExternal: "Ouvrir le lien dans le navigateur système", addWord: "Ajouter au dictionnaire", chatData: "Données du chat", quit: "Quitter",
  example: 'Workflow d’exemple',
  sessionEnded: (handle: string) => `@${handle} : la session a pris fin et le workflow n’a pas pu s’exécuter sur ce compte. Cliquez pour vous reconnecter.`,
  started: 'démarré',
  noContent: (flow: string) => `« ${flow} » n’a plus de contenu à partager. Ajoutez du contenu à son dossier ou générez-en dans l’app.`,
  alreadyQueued: 'déjà en attente dans la file, cette exécution n’a pas été ajoutée',
  queued: (ahead: number) => `en file (${ahead} exécution(s) devant)`,
  offWhileQueued: 'désactivé pendant l’attente dans la file, non exécuté',
  runDone: 'terminé',
  runSkipped: 'ignoré',
  stoppedFromSite: 'arrêté depuis le site',
}
