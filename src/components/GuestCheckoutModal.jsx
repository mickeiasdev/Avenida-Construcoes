import { useNavigate } from 'react-router-dom'
import { LogIn, ShoppingBag, UserPlus, X } from 'lucide-react'

// Pergunta para quem vai finalizar SEM login: entrar/criar conta
// (vantagem: dados salvos para as próximas compras) ou seguir como visitante.
// Se seguir como visitante, o pedido grava com user_id = null e is_guest = true.
export function GuestCheckoutModal({ open, onClose, onContinueGuest, from }) {
  const navigate = useNavigate()
  if (!open) return null

  function goLogin() {
    onClose()
    navigate('/login', { state: { from: from || '/carrinho' } })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="toast-in w-full max-w-md space-y-5 rounded-t-2xl bg-white p-6 shadow-2xl safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quer entrar ou seguir como visitante?"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-gray-800">Quase lá! Como prefere continuar?</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">
                Com uma conta, seus dados de entrega ficam salvos e suas próximas compras
                ficam muito mais rápidas.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            aria-label="Voltar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button type="button" className="btn-primary w-full" onClick={goLogin}>
          <LogIn className="h-4 w-4" /> Entrar na minha conta
        </button>
        <button
          type="button"
          className="w-full rounded-full bg-white py-2.5 text-sm font-bold text-primary ring-1 ring-primary/40 transition hover:bg-primary/5"
          onClick={goLogin}
        >
          <UserPlus className="mr-1.5 inline h-4 w-4" /> Criar conta grátis
        </button>

        <div className="relative py-1 text-center">
          <span className="bg-white px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-300">ou</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-gray-100" />
        </div>

        <button
          type="button"
          className="w-full py-2 text-sm font-medium text-gray-500 underline-offset-2 transition hover:text-gray-800 hover:underline"
          onClick={onContinueGuest}
        >
          Continuar como visitante
        </button>
      </div>
    </div>
  )
}
