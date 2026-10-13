import { useEffect, useRef } from 'react'

// Acessibilidade mínima para modais/drawers SEM mexer no layout:
//   • ESC fecha o que está aberto;
//   • foco inicial no painel (primeiro campo/botão);
//   • foco devolvido ao elemento que abriu.
// O onClose fica numa ref de propósito: quase todos os call sites passam arrow
// function (identidade nova a cada render) e, se ele entrasse nas dependências,
// o efeito rodaria a cada tecla digitada e roubaria o foco do usuário.
export function useModalA11y(active, onClose) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!active) return
    const opener = document.activeElement

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
      }
    }
    document.addEventListener('keydown', onKey)

    // O modal acabou de montar: no próximo tick o painel (o MAIS INTERNO, no
    // caso de modal dentro de modal) recebe o foco.
    const timer = setTimeout(() => {
      const panels = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      const panel = panels[panels.length - 1]
      const focusable = panel?.querySelector('input:not([type="hidden"]), select, textarea, button, a[href]')
      const target = focusable ?? panel
      if (target && typeof target.focus === 'function') target.focus()
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [active])
}
