import { ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { FavoriteButton } from './FavoriteButton'
import { formatBRL } from '../lib/utils'

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80'

export function ProductCard({ product, compact = false }) {
  const { addItem } = useCart()

  // estoque null = sem controle numérico → apenas "Em estoque"
  const stock = product.stock
  const out = !product.active || stock === 0

  return (
    <div className="card group flex h-full flex-col overflow-hidden p-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-violet-50">
        <Link to={'/produto/' + product.id} className="block h-full w-full">
          <img
            src={product.image_url || FALLBACK_IMG}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </Link>
        {product.categories?.name && (
          <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-secondary/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-100 shadow-sm backdrop-blur">
            {product.categories.name}
          </span>
        )}
        <FavoriteButton
          productId={product.id}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/55 p-1.5 backdrop-blur"
          iconClass="h-4 w-4"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <Link
          to={'/produto/' + product.id}
          className="line-clamp-2 text-sm font-medium text-gray-800 transition hover:text-primary sm:text-base"
        >
          {product.name}
        </Link>
        {!compact && (
          <p className="line-clamp-2 hidden text-xs text-gray-500 sm:block">{product.description}</p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pt-3">
          <span className="w-fit rounded-lg bg-primary/10 px-2 py-0.5 text-base font-extrabold leading-tight tracking-tight text-primary sm:text-lg">
            {formatBRL(product.price)}
          </span>
          <button
            type="button"
            className="btn-primary w-full px-2.5 py-1.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
            disabled={out}
            onClick={() => addItem(product)}
          >
            <ShoppingCart className="h-4 w-4" />
            {out ? 'Sem estoque' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
