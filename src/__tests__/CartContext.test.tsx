import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock localStorage on window
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
// Ensure window exists
if (typeof window === 'undefined') {
  global.window = {}
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock auth context
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user1', email: 'test@example.com' },
    refreshProfile: vi.fn(),
  }),
}))

// Mock supabase client with minimal stubs
vi.mock('../lib/supabaseClient', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { store_name: 'Test Store', whatsapp: '5511999999999' }, error: null }),
  }
  return { supabase: mockSupabase }
})

import { CartProvider, useCart } from '../context/CartContext'

describe('CartContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('should add item to cart', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    )

    const { result } = renderHook(() => useCart(), { wrapper })

    const fakeProduct = {
      id: '1',
      name: 'Produto Teste',
      price: 10,
      image_url: '',
      stock: 5,
    }

    act(() => {
      result.current.addItem(fakeProduct)
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({
      product_id: '1',
      name: 'Produto Teste',
      quantity: 1,
      price: 10,
    })
    expect(result.current.count).toBe(1)
    expect(result.current.total).toBe(10)
  })

  it('should not add item when stock is zero', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    )

    const { result } = renderHook(() => useCart(), { wrapper })

    const fakeProduct = {
      id: '2',
      name: 'Produto Sem Estoque',
      price: 20,
      image_url: '',
      stock: 0,
    }

    act(() => {
      result.current.addItem(fakeProduct)
    })

    expect(result.current.items).toHaveLength(0)
  })

  it('should clear cart', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    )

    const { result } = renderHook(() => useCart(), { wrapper })

    const fakeProduct = {
      id: '3',
      name: 'Produto Teste 2',
      price: 15,
      image_url: '',
      stock: 10,
    }

    act(() => {
      result.current.addItem(fakeProduct)
      result.current.addItem(fakeProduct) // quantity 2
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(2)

    act(() => {
      result.current.clearCart()
    })

    expect(result.current.items).toHaveLength(0)
    expect(result.current.count).toBe(0)
    expect(result.current.total).toBe(0)
  })
}
)