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
