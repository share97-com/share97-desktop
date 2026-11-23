import type { Strings } from './tr.ts'

export const es: Strings = {
  translate: 'Traducir esta página',
  incognito: 'Incógnito', newTab: "Nueva pestaña", reload: "Recargar", duplicate: "Duplicar", unmute: "Activar sonido del sitio", mute: "Silenciar sitio", close: "Cerrar", closeOthers: "Cerrar otras pestañas", reopen: "Reabrir pestaña cerrada", openLink: "Abrir enlace en una pestaña nueva", copyLink: "Copiar dirección del enlace", openImage: "Abrir imagen en una pestaña nueva", saveImage: "Guardar imagen", copyImage: "Copiar imagen", undo: "Deshacer", redo: "Rehacer", cut: "Cortar", copy: "Copiar", paste: "Pegar", selectAll: "Seleccionar todo", search: "Buscar en Google", back: "Atrás", forward: "Adelante", print: "Imprimir…", inspect: "Inspeccionar", permAllow: "Permitir", permDeny: "Bloquear", permAsk: "solicita permiso para", permRemember: "La elección se recuerda para este sitio en este navegador.", browser: "Navegador", approvalNeeded: "Se necesita aprobación", agentDone: "El agente terminó.", agentFailed: "El agente se detuvo", openInApp: "Abrir enlace en la app", openExternal: "Abrir enlace en el navegador del sistema", addWord: "Añadir al diccionario", chatData: "Datos del chat", quit: "Salir",
  example: 'Flujo de ejemplo',
  sessionEnded: (handle: string) => `@${handle}: la sesión terminó y el flujo no se pudo ejecutar en esta cuenta. Haz clic para iniciar sesión de nuevo.`,
  started: 'iniciado',
  noContent: (flow: string) => `«${flow}» no tiene contenido que compartir. Añade contenido a su carpeta o genéralo en la app.`,
  alreadyQueued: 'ya está esperando en la cola, esta ejecución no se añadió',
  queued: (ahead: number) => `en cola (${ahead} ejecución(es) por delante)`,
  offWhileQueued: 'se desactivó mientras esperaba en la cola, no se ejecutó',
  runDone: 'hecho',
  runSkipped: 'omitido',
  stoppedFromSite: 'detenido desde el sitio',
}
