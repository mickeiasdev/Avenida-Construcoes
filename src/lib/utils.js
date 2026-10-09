export function formatBRL(value) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', { dateStyle: 'short' })
}

// ============ Máscaras BR ============
export function maskPhone(value) {
  const d = String(value ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2)
  if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
}

export function maskCep(value) {
  const d = String(value ?? '').replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : d.slice(0, 5) + '-' + d.slice(5)
}

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

// ============ Pipeline de status dos pedidos ============
export const ORDER_PIPELINE = ['pending', 'confirmed', 'preparing', 'shipping', 'delivered']

export const ORDER_LABELS = {
  pending: 'Aguardando confirmação',
  confirmed: 'Pedido confirmado',
  preparing: 'Separando itens',
  shipping: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

export const ORDER_SHORT = {
  pending: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Separando',
  shipping: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

export const ORDER_CLS = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-indigo-100 text-indigo-700',
  shipping: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const ORDER_NEXT_ACTION = {
  pending: 'Confirmar pedido',
  confirmed: 'Marcar como separando',
  preparing: 'Marcar saída para entrega',
  shipping: 'Concluir entrega',
}


// ============ Horário de funcionamento ============
// Converte 'HH:MM'/'HH:MM:SS' em minutos desde 00:00
export function timeToMin(t) {
  const [h, m] = String(t ?? '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fmtHora(t) {
  const [h, m] = String(t ?? '').split(':')
  return (m && m !== '00') ? h + 'h' + m : h + 'h'
}

// Status de abertura AGORA, baseado nos horários salvos no banco.
// Retorna { open: boolean, label: string } — ex.: 'Aberto até 18h' / 'Fechado — abre às 7h'
export function getOpenStatus(s, now = new Date()) {
  if (!s) return { open: false, label: 'Horário não informado' }
  const day = now.getDay() // 0=dom .. 6=sáb
  let open, close
  if (day === 0) {
    if (s.sun_closed || !s.sun_open || !s.sun_close) {
      const nxt = nextOpeningLabel(s, day)
      return { open: false, label: 'Fechado' + (nxt ? ' — ' + nxt : '') }
    }
    open = s.sun_open; close = s.sun_close
  } else if (day === 6) {
    if (!s.sat_open || !s.sat_close) return { open: false, label: 'Fechado' }
    open = s.sat_open; close = s.sat_close
  } else {
    open = s.weekday_open; close = s.weekday_close
  }
  if (!open || !close) return { open: false, label: 'Fechado' }
  const cur = now.getHours() * 60 + now.getMinutes()
  const o = timeToMin(open), c = timeToMin(close)
  if (cur >= o && cur < c) return { open: true, label: 'Aberto até ' + fmtHora(close) }
  return { open: false, label: 'Fechado' + (cur < o ? ' — abre às ' + fmtHora(open) : ' — ' + nextOpeningLabel(s, day)) }
}

// Próxima abertura: hoje (se não passou) / amanhã / segunda (fim de semana fechado)
function nextOpeningLabel(s, today) {
  const order = [] // dia -> [open, available]
  const label = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 0: 'domingo' }
  for (let d = 0; d < 7; d++) order.push(d)
  for (const k of [1, 2, 3, 4, 5, 6, 0, 1]) {
    const d = (today + k) % 7
    let open
    if (d === 0) open = s.sun_closed ? null : s.sun_open
    else if (d === 6) open = s.sat_open
    else open = s.weekday_open
    if (open) return (k === 1 ? 'abre amanhã às ' : 'abre ' + label[d] + ' às ') + fmtHora(open)
  }
  return ''
}

// Texto legível para o rodapé: 'Seg a Sex 7h–18h · Sáb 7h–13h · Dom fechado'
export function formatBusinessHoursText(s) {
  if (!s) return ''
  const parts = []
  if (s.weekday_open && s.weekday_close) parts.push('Seg a Sex ' + fmtHora(s.weekday_open) + '-' + fmtHora(s.weekday_close))
  if (s.sat_open && s.sat_close) parts.push('Sáb ' + fmtHora(s.sat_open) + '-' + fmtHora(s.sat_close))
  if (s.sun_closed) parts.push('Dom fechado')
  else if (s.sun_open && s.sun_close) parts.push('Dom ' + fmtHora(s.sun_open) + '-' + fmtHora(s.sun_close))
  return parts.join(' · ')
}
