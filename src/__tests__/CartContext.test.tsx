import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider, useCart } from '../context/CartContext'
import { supabase } from '../lib/supabaseClient'

// ---------------------------------------------------------------------------
// Mock do cliente Supabase.
// Cada tabela devolve um "query builder" encadeável E thenável, então tanto
// `await from(t).update().eq()` quanto `from(t).select().ilike().maybeSingle()`
// funcionam como no supabase-js.
// ---------------------------------------------------------------------------
const couponRow = { code: 'VEM10', kind: 'percent', value: 10, min_total: 0 }

const tableResults: Record<string, { data: unknown; error: unknown }> = {
  coupons: { data: couponRow, error: null },
  products: { data: [], error: null },
  profiles: { data: null, error: null },
  store_settings: { data: { store_name: 'Loja Teste', whatsapp: '(11) 98888-7777' }, error: null },
}

vi.mock('../lib/supabaseClient', () => {
  function builder(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: vi.fn(self),
      insert: vi.fn(self),
      update: vi.fn(self),
      delete: vi.fn(self),
      eq: vi.fn(self),
      ilike: vi.fn(self),
      in: vi.fn(self),
      maybeSingle: vi.fn(async () => result),
      single: vi.fn(async () => result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    })
    return chain
  }
  return {
    STORAGE_BUCKET: 'store',
    uploadImage: vi.fn(async () => 'https://exemplo/imagem.png'),
    supabase: {
      functions: {
        // Edge Function do gateway de Pix: devolve o QR como a função real
        invoke: vi.fn(async () => ({
          data: { qr_code: '000201PIXTESTE', qr_code_base64: null, payment_ref: 'pix_char_1', status: 'pending' },
          error: null,
        })),
      },
      from: vi.fn((table: string) => builder(tableResults[table] ?? { data: null, error: null })),
      // o servidor recalcula o pedido: 25 - 5 = 20, ignorando o preço do cliente
      rpc: vi.fn(async () => ({
        data: { id: 'pedido-1', subtotal: 25, discount: 5, total: 20 },
        error: null,
      })),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'cliente@teste.com' },
    profile: null,
    refreshProfile: vi.fn(),
  }),
}))

// CartContext.jsx é JavaScript: sem checkJs o TypeScript não consegue inferir
// o formato do contexto, então declaramos aqui a parte da API sob teste.
type CartApi = {
  items: { product_id: string; price: number; quantity: number }[]
  count: number
  total: number
  coupon: { code: string } | null
  discountValue: number
  addItem: (product: typeof produto) => boolean
  clearCart: () => void
  applyCoupon: (code: string) => Promise<{ error?: string }>
  checkout: (
    form: Record<string, string>,
    directItems?: { product_id: string; name: string; price: number; quantity: number }[],
    options?: { deliveryMethod?: string; paymentMethod?: string },
  ) => Promise<{
    id: string
    subtotal: number
    discount: number
    total: number
    whatsappSent: boolean
    paymentMethod: string
    mpPix: { qr_code: string } | null
    mpError?: boolean
  }>
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
)

const produto = { id: 'p1', name: 'Cimento CP-II', price: 10, image_url: '', stock: 10 }

function renderCart() {
  return renderHook(() => useCart() as unknown as CartApi, { wrapper })
}

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('adiciona item e calcula total/quantidade', () => {
    const { result } = renderCart()

    act(() => { result.current.addItem(produto) })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.count).toBe(1)
    expect(result.current.total).toBe(10)
  })

  it('não adiciona item sem estoque', () => {
    const { result } = renderCart()

    act(() => { result.current.addItem({ ...produto, stock: 0 }) })

    expect(result.current.items).toHaveLength(0)
  })

  it('limpa o carrinho', () => {
    const { result } = renderCart()

    act(() => {
      result.current.addItem(produto)
      result.current.addItem(produto) // vira quantidade 2
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(2)

    act(() => { result.current.clearCart() })

    expect(result.current.items).toHaveLength(0)
    expect(result.current.count).toBe(0)
    expect(result.current.total).toBe(0)
  })

  it('aplica cupom sem quebrar o render (regressão: total em TDZ)', async () => {
    const { result } = renderCart()

    act(() => { result.current.addItem(produto) })

    await act(async () => {
      const res = await result.current.applyCoupon('vem10')
      expect(res.error).toBeUndefined()
    })

    // 10% de R$ 10,00 — o cálculo lê `total` DEPOIS de ele existir
    expect(result.current.coupon?.code).toBe('VEM10')
    expect(result.current.discountValue).toBe(1)
  })

  it('usa os totais calculados pelo servidor no checkout', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { result } = renderCart()

    let pedido: Awaited<ReturnType<typeof result.current.checkout>> | undefined
    await act(async () => {
      pedido = await result.current.checkout(
        { full_name: 'Maria Silva', phone: '(11) 98888-7777' },
        // preço absurdo de propósito: o servidor é quem manda no valor
        [{ product_id: 'p1', name: 'Cimento CP-II', price: 999, quantity: 2 }],
        { deliveryMethod: 'retirada', paymentMethod: 'pix' },
      )
    })

    expect(pedido?.total).toBe(20) // veio da RPC, não dos 999 * 2 do cliente
    expect(pedido?.discount).toBe(5)
    expect(pedido?.whatsappSent).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('place_order', expect.objectContaining({
      p_items: [{ product_id: 'p1', quantity: 2 }],
      p_is_guest: false,
      p_delivery_method: 'retirada',
    }))

    open.mockRestore()
  })

  it('usa Pix online quando nenhuma forma de pagamento é informada', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { result } = renderCart()

    let pedido: Awaited<ReturnType<typeof result.current.checkout>> | undefined
    await act(async () => {
      pedido = await result.current.checkout(
        { full_name: 'Maria Silva', phone: '(11) 98888-7777' },
        [{ product_id: 'p1', name: 'Cimento CP-II', price: 999, quantity: 1 }],
      )
    })

    // o fallback do CartContext ('mercado_pago') precisa ser aplicado de verdade
    expect(pedido?.paymentMethod).toBe('mercado_pago')
    expect(pedido?.mpPix?.qr_code).toBe('000201PIXTESTE')
    expect(pedido?.whatsappSent).toBe(false)
    expect(window.open).not.toHaveBeenCalled()

    open.mockRestore()
  })
})
