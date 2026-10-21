import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useCart } from '../context/CartContext'

// O modal cheio ("finalizar ou continuar comprando") só aparece na PRIMEIRA vez
// que o cliente coloca algo na sacola; da segunda em diante basta este aviso.
// Mostra também AVISOS GERAIS da loja (notice) — ex.: itens indisponíveis ao
// refazer um pedido. Vive no StoreLayout, então sobrevive à navegação.
export function CartToast() {
  const { addedToast, dismissAddedToast, notice, dismissNotice } = useCart()

  useEffect(() => {
    if (!addedToast) return undefined
    const t = setTimeout(dismissAddedToast, 3200)
    return () => clearTimeout(t)
  }, [addedToast, dismissAddedToast])

  // aviso geral fica mais tempo: costuma ter uma frase completa para ler
  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(dismissNotice, 7000)
    return () => clearTimeout(t)
  }, [notice, dismissNotice])

  if (!addedToast && !notice) return null

  const text = notice?.text ?? ''
  const close = notice ? dismissNotice : dismissAddedToast

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-8"
    >
      <div className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-white shadow-2xl">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        {notice ? (
          <p className="min-w-0 flex-1">{text}</p>
        ) : (
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{addedToast.quantity}× {addedToast.name}</span> na sacola
          </p>
        )}
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-lg p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Fechar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
