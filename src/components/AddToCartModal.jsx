import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ShoppingCart, X } from 'lucide-react'
import { useCart } from '../context/CartContext'

// Abre automaticamente quando um item é adicionado ao carrinho,
// perguntando se o cliente quer finalizar ou continuar comprando
export function AddToCartModal() {
  const { lastAdded, dismissLastAdded, total, count } = useCart()
  const navigate = useNavigate()

  if (!lastAdded) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={dismissLastAdded}
    >
      <div
        className="toast-in w-full max-w-sm space-y-4 rounded-t-2xl bg-white p-5 pb-7 shadow-2xl ring-1 ring-gray-100 safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-800">Adicionado ao carrinho!</p>
            <p className="truncate text-sm text-gray-500">{lastAdded.name}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {count} item(ns) · {lastAdded.quantity}× deste produto
            </p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={dismissLastAdded}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          Subtotal: <span className="font-semibold text-gray-800">{formatTotal(total)}</span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="flex-1 rounded-lg bg-white px-4 py-2.5 font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
            onClick={dismissLastAdded}
          >
            Continuar comprando
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => { dismissLastAdded(); navigate('/carrinho') }}
          >
            <ShoppingCart className="h-4 w-4" /> Finalizar compra
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTotal(v) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
