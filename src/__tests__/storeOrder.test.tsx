import { describe, expect, it, vi } from 'vitest'

// mock do client: só a RPC é usada por este módulo
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: rpcMock } }))

import { createStoreOrder, fulfillmentTotals, groupByFulfillment, isMigrationMissing } from '../lib/storeOrder'

const cliente = {
  full_name: 'Maria Silva',
  phone: '(11) 99999-9999',
  street: 'Rua das Flores',
  number: '10',
  complement: '',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zip: '01000-000',
}

describe('separação retirada x entrega', () => {
  it('separa os itens nos dois destinos', () => {
    const items = [
      { id: 'a', fulfillment: 'retirada' },
      { id: 'b', fulfillment: 'entrega' },
      { id: 'c', fulfillment: 'retirada' },
    ]
    const g = groupByFulfillment(items)
    expect(g.retirada.map((i) => i.id)).toEqual(['a', 'c'])
    expect(g.entrega.map((i) => i.id)).toEqual(['b'])
  })

  it('soma quantidade e valor de cada destino (linhas do banco)', () => {
    const items = [
      { id: 'a', quantity: 2, unit_price: 10.5, fulfillment: 'retirada' },
      { id: 'b', quantity: 1, unit_price: 5, fulfillment: 'entrega' },
      { id: 'c', quantity: 3, unit_price: 1, fulfillment: 'retirada' },
    ]
    const t = fulfillmentTotals(items)
    expect(t.retirada.count).toBe(5)
    expect(t.retirada.total).toBe(24)
    expect(t.entrega.count).toBe(1)
    expect(t.entrega.total).toBe(5)
  })

  it('item sem fulfillment conta como entrega (default do banco)', () => {
    expect(fulfillmentTotals([{ quantity: 1, unit_price: 2 }]).entrega.count).toBe(1)
  })

  it('aceita tanto o item local do PDV (quantity/price) quanto a resposta da RPC (qty/price)', () => {
    const t = fulfillmentTotals([
      { product_id: 'p1', qty: 2, price: 7.5, fulfillment: 'retirada' },
      { product_id: 'p2', quantity: 1, price: 3, fulfillment: 'entrega' },
    ])
    expect(t.retirada.total).toBe(15)
    expect(t.entrega.total).toBe(3)
  })
})

describe('createStoreOrder (venda na loja)', () => {
  it('manda origem loja e o destino de cada item para a RPC', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'o-1', subtotal: 30, discount: 0, total: 30, status: 'confirmed', delivery_method: 'misto', items: [] },
      error: null,
    })

    const out = await createStoreOrder({
      items: [
        { product_id: 'p1', quantity: 2, price: 10, fulfillment: 'retirada' },
        { product_id: 'p2', quantity: 1, price: 10, fulfillment: 'entrega' },
      ],
      customer: cliente,
      paymentMethod: 'dinheiro',
    })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = rpcMock.mock.calls[0]
    expect(fn).toBe('place_order')
    expect(args.p_origin).toBe('loja')
    expect(args.p_items).toEqual([
      { product_id: 'p1', quantity: 2, fulfillment: 'retirada' },
      { product_id: 'p2', quantity: 1, fulfillment: 'entrega' },
    ])
    // o pedido da loja não fica preso à conta do admin
    expect(args.p_user_id).toBeNull()
    expect(args.p_is_guest).toBe(false)
    expect(args.p_delivery_method).toBe('entrega')
    expect(args.p_delivery_address).toContain('Rua das Flores, 10')
    expect(out.total).toBe(30)
  })

  it('venda só de retirada não manda endereço e usa retirada', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'o-2', total: 10, status: 'delivered' }, error: null })
    await createStoreOrder({
      items: [{ product_id: 'p1', quantity: 1, price: 10, fulfillment: 'retirada' }],
      customer: cliente,
      paymentMethod: 'cartao',
    })
    const [, args] = rpcMock.mock.calls[0]
    expect(args.p_delivery_method).toBe('retirada')
    expect(args.p_delivery_address).toBe('')
    expect(args.p_payment_method).toBe('cartao')
  })

  it('sem itens nem chama o servidor', async () => {
    rpcMock.mockClear()
    await expect(createStoreOrder({ items: [], customer: cliente })).rejects.toThrow(/pelo menos um item/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('RPC não implantada vira mensagem que diz o que rodar', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.place_order(p_origin) in the schema cache' },
    })
    await expect(
      createStoreOrder({ items: [{ product_id: 'p1', quantity: 1, fulfillment: 'retirada' }], customer: cliente })
    ).rejects.toThrow(/migration-9/)
  })
})

describe('isMigrationMissing', () => {
  it('reconhece RPC/coluna inexistente', () => {
    expect(isMigrationMissing({ code: 'PGRST202' })).toBe(true)
    expect(isMigrationMissing({ message: 'function public.place_order(...) does not exist' })).toBe(true)
  })
  it('não confunde erro de regra de negócio com migration ausente', () => {
    expect(isMigrationMissing({ message: 'Cupom inválido ou inativo.' })).toBe(false)
    expect(isMigrationMissing(null)).toBe(false)
  })
})
