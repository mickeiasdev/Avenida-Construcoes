// ============================================================
// Título da aba do navegador com o selo de não lidas do WhatsApp.
// O PageTitle reescreve o título a cada rota; este módulo guarda a
// contagem e aplica/remove o prefixo "(N)" sem os dois brigarem:
//   • setTabUnread(n)      — grava e re-renderiza o título atual
//   • applyTabBadge(title) — título já "limpo" → título com prefixo
// O PageTitle usa applyTabBadge ao navegar; o AdminLayout chama
// setTabUnread quando o Realtime da caixa mexe a contagem.
// ============================================================

let unread = 0

// tira qualquer prefixo "(N)" ou "(99+)" que já exista
function stripBadge(title) {
  return String(title ?? '').replace(/^\(\d+\+?\)\s/, '')
}

// título final com o selo na frente ("(3) Painel Admin - Loja")
export function applyTabBadge(title) {
  const clean = stripBadge(title)
  if (!unread) return clean
  return '(' + (unread > 99 ? '99+' : unread) + ') ' + clean
}

export function setTabUnread(count) {
  const n = Math.max(0, Math.round(Number(count) || 0))
  if (n === unread) return
  unread = n
  // re-renderiza o título atual mantendo a parte da rota
  document.title = applyTabBadge(stripBadge(document.title))
}
