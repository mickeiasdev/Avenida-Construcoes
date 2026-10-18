import { useState } from 'react'
import { Plus } from 'lucide-react'
import { effectivePrice, formatBRL, hasActivePromo } from '../lib/utils'
import { useCart } from '../context/CartContext'

// Linha de produto estilo CARDÁPIO (restaurante/menu delivery):
// foto pequena a esquerda, nome + descrição + preço + botão adicionar.
// Mesmos dados do ProductCard, apresentação diferente para o layout cardapio.
export function MenuProductRow({ product }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const price = effectivePrice(product)
  const promo = hasActivePromo(product)
  const soldOut = product.stock != null && Number(product.stock) <= 0

  function handleAdd() {
    if (soldOut) return
    const ok = addItem(product)
    if (ok) {
      setAdded(true)
      setTimeout(() => setAdded(false), 1200)
    }
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={soldOut}
      className={'flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 transition active:scale-[0.98] ' +
        (soldOut
          ? 'opacity-50 ring-gray-100'
          : added
            ? 'ring-2 ring-green-400'
            : 'ring-gray-100 hover:ring-primary/30')}
    >
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name}
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-2xl">
          🍽️
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-800">{product.name}</p>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{product.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-bold text-primary">{formatBRL(price)}</span>
          {promo && (
            <span className="text-xs text-gray-400 line-through">{formatBRL(Number(product.price))}</span>
          )}
          {soldOut && (
            <span className="rounded-lg bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
              Esgotado
            </span>
          )}
        </div>
      </div>

      <span className={
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition ' +
        (soldOut ? 'bg-gray-300' : added ? 'bg-green-500' : 'bg-primary')
      }>
        {added ? '✓' : <Plus className="h-4 w-4" />}
      </span>
    </button>
  )
}
