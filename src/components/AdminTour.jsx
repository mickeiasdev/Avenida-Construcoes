import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Loader2, X } from 'lucide-react'

// TOUR DE BOAS-VINDAS do painel: mascarilha (spotlight) + popover passo a
// passo. Abre sozinho na primeira visita ("wl_tour_v1" no localStorage) e
// pode ser reaberto pelo botão "Tour" no rodapé da barra lateral.
const TOUR_KEY = 'wl_tour_v1'

const STEPS = [
  { selector: null, title: 'Bem-vindo ao painel! 👋', text: 'Um tour rápido de 1 minuto para você vender no primeiro dia. Dá para rever quando quiser pelo botão "Tour" lá embaixo.' },
  { selector: 'a[href="/admin"]', title: 'Dashboard', text: 'Aqui ficam as vendas do dia, a meta e o alerta de estoque mínimo.' },
  { selector: 'a[href="/admin/pedidos"]', title: 'Pedidos', text: 'Todo pedido do site chega aqui (com selo de pendentes). Avançar o status avisa o cliente no WhatsApp e por push.' },
  { selector: 'a[href="/admin/nova-venda"]', title: 'Nova venda (PDV)', text: 'Venda no balcão registrada por aqui — separa o que foi retirado do que vai para entrega.' },
  { selector: 'a[href="/admin/produtos"]', title: 'Produtos', text: 'Cadastre produtos e serviços: foto, preço, promoção, estoque, calculadora de material e agendamento.' },
  { selector: 'a[href="/admin/whatsapp"]', title: 'WhatsApp', text: 'Atenda os clientes no chat da loja sem sair do painel — integração direta com a Evolution API.' },
  { selector: 'a[href="/admin/automacoes"]', title: 'Automações', text: 'Carrinhos abandonados, pesquisa pós-entrega e convite de recompra — com a mensagem já pronta.' },
  { selector: 'a[href="/admin/configuracoes"]', title: 'Configurações', text: 'Aqui a loja vira SUA: preset de nicho, cores, frete por zona/CEP, retirada com horário e o WhatsApp que recebe os pedidos.' },
  { selector: null, title: 'Pronto para vender! 🚀', text: 'Cadastre seus produtos, configure o WhatsApp e divulgue o link da loja. Qualquer dúvida, o botão de suporte (canto inferior direito) chama o time diretamente.' },
]

export function AdminTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const popoverRef = useRef(null)
  const [pos, setPos] = useState(null)

  // primeira visita? abre o tour
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setOpen(true)
    } catch { /* modo privado */ }
  }, [])

  function finish() {
    try { localStorage.setItem(TOUR_KEY, 'done') } catch { /* */ }
    setOpen(false)
  }

  // recalcula o retângulo do alvo (scroll/resize) — alvo nulo = tela cheia
  useLayoutEffect(() => {
    if (!open) return undefined
    function calc() {
      const s = STEPS[step]
      if (!s) return
      if (s.selector === null) { setRect(null); setPos(null); return }
      let el = null
      try { el = document.querySelector(s.selector) } catch { el = null }
      if (!el) { setRect(null); setPos(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 })
      // popover abaixo do alvo (ou acima quando não cabe)
      const pop = popoverRef.current?.getBoundingClientRect()
      const below = r.bottom + 12 + (pop?.height ?? 160)
      setPos({
        top: below > window.innerHeight - 16 && r.top > (pop?.height ?? 160) + 24
          ? Math.max(12, r.top - (pop?.height ?? 160) - 12)
          : r.bottom + 12,
        left: Math.min(Math.max(12, r.left), window.innerWidth - 320),
      })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => {
      window.removeEventListener('scroll', calc, true)
      window.removeEventListener('resize', calc)
    }
  }, [open, step])

  if (!open) return null
  const s = STEPS[step]

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Tour do painel">
      {/* véu com "furo" no alvo (box-shadow gigante) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* popover */}
      <div
        ref={popoverRef}
        className="absolute w-[300px] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-gray-100"
        style={{ top: pos?.top ?? '50%', left: pos?.left ?? '50%', transform: pos ? undefined : 'translate(-50%,-50%)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold text-gray-800">{s.title}</p>
          <button type="button" onClick={finish} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.text}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={'h-1.5 rounded-full ' + (i === step ? 'w-4 bg-primary' : 'w-1.5 bg-gray-300')} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button type="button" className="btn-soft btn-sm" onClick={() => setStep((v) => v - 1)}>Voltar</button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => setStep((v) => v + 1)}>
                Avançar <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" className="btn-primary btn-sm" onClick={finish}>
                <Check className="h-3.5 w-3.5" /> Concluir
              </button>
            )}
          </div>
        </div>
        <button type="button" className="mt-2 w-full text-center text-[11px] text-gray-400 hover:text-gray-600" onClick={finish}>
          pular tour
        </button>
      </div>
    </div>
  )
}

// botão "rever tour" — vive no rodapé da sidebar do admin
export function TourRestartButton() {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/70 transition hover:bg-white/10 hover:text-white"
      onClick={() => {
        try { localStorage.removeItem('wl_tour_v1') } catch { /* */ }
        setBusy(true)
        setTimeout(() => window.location.reload(), 150)
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Tour do painel
    </button>
  )
}
