import type { Strings } from './tr.ts'

export const pt: Strings = {
  translate: 'Traduzir esta página',
  incognito: 'Anônima', newTab: "Nova aba", reload: "Recarregar", duplicate: "Duplicar", unmute: "Reativar som do site", mute: "Silenciar site", close: "Fechar", closeOthers: "Fechar outras abas", reopen: "Reabrir aba fechada", openLink: "Abrir link em nova aba", copyLink: "Copiar endereço do link", openImage: "Abrir imagem em nova aba", saveImage: "Salvar imagem", copyImage: "Copiar imagem", undo: "Desfazer", redo: "Refazer", cut: "Recortar", copy: "Copiar", paste: "Colar", selectAll: "Selecionar tudo", search: "Pesquisar no Google por", back: "Voltar", forward: "Avançar", print: "Imprimir…", inspect: "Inspecionar", permAllow: "Permitir", permDeny: "Bloquear", permAsk: "quer permissão para", permRemember: "A escolha é lembrada para este site neste navegador.", browser: "Navegador", approvalNeeded: "Aprovação necessária", agentDone: "O agente terminou.", agentFailed: "O agente parou", openInApp: "Abrir link no app", openExternal: "Abrir link no navegador do sistema", addWord: "Adicionar ao dicionário", chatData: "Dados do chat", quit: "Sair",
  example: 'Fluxo de exemplo',
  sessionEnded: (handle: string) => `@${handle}: a sessão terminou e o fluxo não pôde ser executado nesta conta. Clique para entrar de novo.`,
  started: 'iniciado',
  noContent: (flow: string) => `"${flow}" não tem mais conteúdo para compartilhar. Adicione conteúdo à pasta dele ou gere no app.`,
  alreadyQueued: 'já está aguardando na fila, esta execução não foi adicionada',
  queued: (ahead: number) => `na fila (${ahead} execução(ões) à frente)`,
  offWhileQueued: 'desativado enquanto aguardava na fila, não executado',
  runDone: 'concluído',
  runSkipped: 'ignorado',
  stoppedFromSite: 'parado pelo site',
}
