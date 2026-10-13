import { supabase } from './supabaseClient'
import { formatAddress } from './checkout'

// ============================================================
// Venda presencial (PDV do admin) + a separação retirada x entrega
// que o painel usa para mostrar/gerenciar os pedidos.
// Regra de negócio (preço, cupom, estoque) continua no servidor:
// aqui só montamos a chamada e lemos o que ele devolveu.
// ============================================================

export const FULFILLMENT_LABELS = {
  retirada: 'Retirada na loja',
  entrega: 'Entrega',
}
export const FULFILLMENT_SHORT = { retirada: 'Retirada', entrega: 'Entrega' }

export const PAYMENT_LABELS = {
  pix: 'Pix',
  mercado_pago: 'Pix (Mercado Pago)',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão na entrega/retirada',
}

export const DELIVERY_LABELS = {
  entrega: 'Entrega',
  retirada: 'Retirada no balcão',
  misto: 'Retirada na hora + entrega',
}

// quantidade/preço funcionam tanto com o item local do PDV ({quantity, price})
// quanto com a linha do banco ({quantity, unit_price}) ou a resposta da RPC ({qty, price})
export const itemQty = (it) => Number(it?.quantity ?? it?.qty ?? 0)
export const itemUnit = (it) => Number(it?.unit_price ?? it?.price ?? 0)

// separa o pedido no que saiu do balcão e no que ficou para entrega
export function groupByFulfillment(items = []) {
  const retirada = []
  const entrega = []
  for (const it of items ?? []) {
    if (it?.fulfillment === 'retirada') retirada.push(it)
    else entrega.push(it)
  }
  return { retirada, entrega }
}

// quantidade + valor de cada destino
export function fulfillmentTotals(items = []) {
  const { retirada, entrega } = groupByFulfillment(items)
  const pack = (list) => ({
    items: list,
    count: list.reduce((acc, it) => acc + itemQty(it), 0),
    total: Math.round(list.reduce((acc, it) => acc + itemQty(it) * itemUnit(it), 0) * 100) / 100,
  })
  return { retirada: pack(retirada), entrega: pack(entrega) }
}

// a RPC/coluna ainda não existe no projeto? (migration-8/9 não rodada)
export function isMigrationMissing(error) {
  if (!error) return false
  const msg = String(error.message ?? '')
  return error.code === 'PGRST202' || /could not find the function|does not exist|PGRST202/i.test(msg)
}

// Registra a venda feita no balcão: o admin escolhe os itens e, item a item,
// o que o cliente leva na hora e o que fica para entrega depois.
export async function createStoreOrder({ items, customer, paymentMethod = 'dinheiro' }) {
  const list = (items ?? []).filter((i) => itemQty(i) > 0)
  if (list.length === 0) throw new Error('Adicione pelo menos um item à venda.')

  const hasEntrega = list.some((i) => i.fulfillment === 'entrega')
  const orderId = crypto.randomUUID()

  const { data, error } = await supabase.rpc('place_order', {
    p_order_id: orderId,
    // o servidor relê o preço de products e devolve os itens já precificados
    p_items: list.map((i) => ({
      product_id: i.product_id,
      quantity: itemQty(i),
      fulfillment: i.fulfillment === 'entrega' ? 'entrega' : 'retirada',
    })),
    p_coupon_code: null,
    p_customer_name: customer?.full_name ?? '',
    p_customer_phone: customer?.phone ?? '',
    p_delivery_address: hasEntrega ? formatAddress(customer ?? {}) : '',
    p_delivery_method: hasEntrega ? 'entrega' : 'retirada',
    p_payment_method: paymentMethod ?? 'dinheiro',
    p_user_id: null,
    p_is_guest: false,
    p_origin: 'loja',
  })

  if (error) {
    if (isMigrationMissing(error)) {
      throw new Error('Rode supabase/migration-9.sql no Supabase — a função place_order ainda não aceita venda na loja (p_origin).')
    }
    throw new Error(error.message)
  }
  return data
}
