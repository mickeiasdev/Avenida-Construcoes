export function formatBRL(value) {
  return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Promoção ATIVA: promo_price preenchido E promo_until no futuro.
// Quando o prazo vence, a promoção deixa de valer sozinha — não existe cron
// no banco (ver migration-11); o cliente apenas ignora a data no passado.
export function hasActivePromo(product) {
  if (product?.promo_price == null || product?.promo_until == null) return false
  const promo = Number(product.promo_price)
  if (!Number.isFinite(promo) || promo < 0) return false
  const until = new Date(product.promo_until).getTime()
  return Number.isFinite(until) && until > Date.now()
}

// Preço final do produto: a promoção ATIVA manda; sem promoção vale o
// desconto percentual cadastrado no admin.
// Mesma conta do place_order (SQL): round(price * (1 - desconto/100), 2)
export function effectivePrice(product) {
  if (hasActivePromo(product)) {
    return Math.round(Number(product.promo_price) * 100) / 100
  }
  const p = Number(product?.price ?? 0)
  const d = Number(product?.discount_percent ?? 0)
  return Math.round(p * (1 - d / 100) * 100) / 100
}

// Percentual INTEIRO de desconto da promoção ativa, calculado sobre
// product.price. Retorna 0 quando não há promoção ativa.
export function promoPercent(product) {
  const base = Number(product?.price ?? 0)
  if (!hasActivePromo(product) || base <= 0) return 0
  const promo = Number(product.promo_price)
  if (promo >= base) return 0
  return Math.round((1 - promo / base) * 100)
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

// Máscara CNPJ enquanto digita: XX.XXX.XXX/0001-XX (14 dígitos)
export function maskCnpj(value) {
  const d = String(value ?? '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return d.slice(0, 2) + '.' + d.slice(2)
  if (d.length <= 8) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5)
  if (d.length <= 12) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8)
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12)
}

// CNPJ exibição: dígitos -> XX.XXX.XXX/0001-XX (vazio devolve '—')
export function formatCnpj(value) {
  const d = String(value ?? '').replace(/\D/g, '').padStart(14, '0')
  if (!String(value ?? '').replace(/\D/g, '')) return '—'
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12)
}

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

// ============ WhatsApp ============
// Convenção do app: no banco o número é gravado só com dígitos e com o DDI 55
// na frente (ex.: '5511999999999') porque é o formato que o link wa.me exige
// (CartContext/StoreLayout). No formulário o lojista vê apenas DDD + número.
export function waNumber(raw) {
  const d = onlyDigits(raw)
  return d ? (d.startsWith('55') ? d : '55' + d) : ''
}

export function waLocal(raw) {
  const d = onlyDigits(raw)
  return d.startsWith('55') ? d.slice(2) : d
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
    // sábado sem horário configurado: mesma mensagem do domingo fechado
    if (!s.sat_open || !s.sat_close) {
      const nxt = nextOpeningLabel(s, day)
      return { open: false, label: 'Fechado' + (nxt ? ' — ' + nxt : '') }
    }
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
  const label = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 0: 'domingo' }
  // procura do dia seguinte até uma semana depois (para quando a loja emenda
  // sábado + domingo fechados)
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
