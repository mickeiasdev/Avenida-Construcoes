import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { useModalA11y } from '../lib/useModalA11y'

// Popup de confirmação para ações sensíveis do painel (substitui o
// window.confirm nativo: é feio, bloqueia a thread e não tem identidade).
//   • danger=true  → ícone de alerta + botão vermelho (excluir, cancelar)
//   • danger=false → tom neutro da marca (criar, desativar)
//   • ESC e clique fora cancelam; foco inicial no CANCELAR (em ação
//     destrutiva, o caminho seguro vem primeiro)
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, onConfirm, onCancel }) {
  useModalA11y(open, onCancel)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
    >
      <div
        className="toast-in w-full max-w-sm space-y-5 rounded-t-2xl bg-white p-6 shadow-2xl safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start gap-3">
          <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
            (danger ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary')}>
            {danger ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-gray-800">{title}</p>
            {message && <p className="mt-1 text-sm leading-relaxed text-gray-500">{message}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end mb-4">
          <button type="button" className="btn-soft" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 active:scale-[0.98]'
                : 'btn-primary'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook de uso: ask() devolve uma Promise<boolean> — o handler escreve como
// um "if" normal e o popup fica responsabilidade só do JSX.
//   const confirm = useConfirmDialog()
//   const ok = await confirm.ask({ title: 'Excluir?', danger: true })
//   if (!ok) return
//   ... {confirm.dialog} no fim do JSX da página
export function useConfirmDialog() {
  const resolveRef = useRef(null)
  const [cfg, setCfg] = useState(null)

  const ask = useCallback((options) => {
    setCfg({ danger: false, confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', ...options })
    return new Promise((resolve) => { resolveRef.current = resolve })
  }, [])

  const close = useCallback((answer) => {
    setCfg(null)
    resolveRef.current?.(answer)
    resolveRef.current = null
  }, [])

  const dialog = (
    <ConfirmDialog
      open={Boolean(cfg)}
      title={cfg?.title}
      message={cfg?.message}
      confirmLabel={cfg?.confirmLabel}
      cancelLabel={cfg?.cancelLabel}
      danger={cfg?.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )

  return { ask, dialog }
}
