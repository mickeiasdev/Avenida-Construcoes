import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, Minus, Package, Plus, ShoppingCart, X } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useModalA11y } from '../lib/useModalA11y'
import { effectivePrice, formatBRL, hasActivePromo, promoPercent } from '../lib/utils'

// AMOSTRAGEM RÁPIDA DO PRODUTO (modal estilo cardápio): a linha do cardápio
// abre isto ao clicar — foto grande, nota, preço com promoção, quantidade
// e botão de adicionar. "Ver página completa" leva à tela de produto
// completa (galeria, avaliações, calculadora e comprar-agora).
export function ProductQuickView({ product, onClose }) {
  const { addItem } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [busy, setBusy] = useState(false)
  useModalA11y(!!product, onClose)

  useEffect(() => { setQty(1); setAdded(false) }, [product?.id])

  if (!product) return null

  const promo = hasActivePromo(product)
  const promoOff = promo ? promoPercent(product) : 0
  const hasDeal = promo || Number(product.discount_percent) > 0
  const out = !product.active || product.stock === 0
  const maxQty = product.stock == null ? 99 : Math.max(1, Number(product.stock))
  const image = product.image_url ?? (product.images ?? [])[0] ?? null
  const category = product.categories?.name ?? null

  function commit() {
    setBusy(true)
    // pequena pausa para o feedback "adicionado" não piscar rápido demais
    setTimeout(() => {
      addItem(product, qty)
      setAdded(true)
      setBusy(false)
      setTimeout(() => { setAdded(false); onClose?.() }, 650)
    }, 120)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-2xl safe-bottom sm:rounded-2xl sm:p-5 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={'Detalhes de ' + product.name}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Detalhes do produto</span>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* foto */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
          {image ? (
            <img src={image} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-300">
              <Package className="h-16 w-16" />
            </span>
          )}
          {category && (
            <span className="absolute left-2.5 top-2.5 truncate rounded-lg bg-secondary/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-gray-100 backdrop-blur">
              {category}
            </span>
          )}
          {hasDeal && (
            <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-red-500 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md">
              {promo ? 'OFERTA' + (promoOff > 0 ? ' -' + promoOff + '%' : '') : '-' + product.discount_percent + '% OFF'}
            </span>
          )}
        </div>

        {/* nome, descrição, preço, estoque */}
        <h2 className="mt-3 text-xl font-bold text-gray-800">{product.name}</h2>
        {product.description && (
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{product.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          {hasDeal && (
            <span className="text-sm font-medium text-gray-400 line-through">{formatBRL(product.price)}</span>
          )}
          <p className="text-2xl font-extrabold tracking-tight text-primary">{formatBRL(effectivePrice(product))}</p>
        </div>
        <p className={'mt-1 text-sm font-medium ' + (out ? 'text-red-500' : 'text-green-600')}>
          {product.stock == null ? 'Em estoque' : product.stock === 0 ? 'Fora de estoque' : 'Em estoque: ' + product.stock + ' unidade(s)'}
        </p>

        {/* quantidade + adicionar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-lg ring-1 ring-gray-200">
            <button
              type="button"
              className="p-2.5 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Diminuir quantidade"
              disabled={qty <= 1}
              onClick={() => setQty((v) => Math.max(1, v - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-sm font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              className="p-2.5 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Aumentar quantidade"
              disabled={qty >= maxQty}
              onClick={() => setQty((v) => Math.min(maxQty, v + 1))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={out || added || busy}
            onClick={commit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" />
              : added ? <Check className="h-4 w-4" />
              : <ShoppingCart className="h-4 w-4" />}
            {added ? 'Adicionado!' : out ? 'Sem estoque' : 'Adicionar ' + formatBRL(effectivePrice(product) * qty)}
          </button>
        </div>

        <Link
          to={'/produto/' + product.id}
          className="mt-3 block w-full text-center text-sm font-bold text-primary transition hover:underline"
          onClick={onClose}
        >
          Ver página completa →
        </Link>
      </div>
    </div>
  )
}
