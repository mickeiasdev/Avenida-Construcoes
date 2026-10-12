import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useCart } from '../context/CartContext'

// O modal cheio ("finalizar ou continuar comprando") só aparece na PRIMEIRA vez
// que o cliente coloca algo na sacola; da segunda em diante basta este aviso.
export function CartToast() {
  const { addedToast, dismissAddedToast } = useCart()

  useEffect(() => {
    if (!addedToast) return undefined
    const t = setTimeout(dismissAddedToast, 3200)
    return () => clearTimeout(t)
  }, [addedToast, dismissAddedToast])

  if (!addedToast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-8"
    >
      <div className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-white shadow-2xl">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{addedToast.quantity}× {addedToast.name}</span> na sacola
        </p>
        <button
          type="button"
          onClick={dismissAddedToast}
          className="shrink-0 rounded-lg p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Fechar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
