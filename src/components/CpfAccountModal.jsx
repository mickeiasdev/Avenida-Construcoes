import { LogIn, UserCheck, X } from 'lucide-react'
import { useModalA11y } from '../lib/useModalA11y'

// "Este CPF já tem conta na loja — entrar na sua conta? / continuar assim mesmo?"
// Aparece quando o visitante digita um CPF que já pertence a um cadastro.
// Entrar: dados salvos + acompanhar pedidos. Continuar: segue como visitante,
// com o pedido (e o CPF) gravados normalmente.
export function CpfAccountModal({ open, name, onClose, onLogin, onContinue }) {
  useModalA11y(open, onClose)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
    >
      <div
        className="toast-in w-full max-w-md space-y-5 rounded-t-2xl bg-white p-6 shadow-2xl safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Este CPF já tem conta na loja"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-gray-800">
                {name ? 'Olá, ' + name + '!' : 'Encontramos sua conta!'} Este CPF já tem cadastro
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">
                Entrando na sua conta, seus dados ficam salvos e você acompanha este pedido
                e os próximos em <strong>Meus pedidos</strong>.
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

        <div className="mb-1 space-y-3">
          <button type="button" className="btn-primary w-full" onClick={onLogin}>
            <LogIn className="h-4 w-4" /> Entrar na minha conta
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm font-medium text-gray-500 underline-offset-2 transition hover:text-gray-800 hover:underline"
            onClick={onContinue}
          >
            Continuar assim mesmo (visitante)
          </button>
        </div>
      </div>
    </div>
  )
}
