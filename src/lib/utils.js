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
