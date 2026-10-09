import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, MapPin, MessageCircle, Minus, Package, Pencil, Plus, ShoppingBag, Trash2, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/utils'
import { CheckoutForm, profileToForm, missingFields, fieldLabel, formatAddress } from '../components/CheckoutForm'
import { GuestCheckoutModal } from '../components/GuestCheckoutModal'

const STEPS = [
  { n: 1, label: 'Sacola' },
  { n: 2, label: 'Entrega' },
  { n: 3, label: 'Revisão' },
]

// CHECKOUT EM 3 PASSOS (mobile-first):
// 1) Sacola — itens com controles de quantidade
// 2) Entrega — form validado (nada sai com campo obrigatório vazio)
// 3) Revisão — resumo + confirmação via WhatsApp
// CTA fixo no rodapé (acima da bottom nav no mobile), total sempre visível.
export default function Cart() {
  const { user, profile } = useAuth()
  const { items, count, total, updateQuantity, removeItem, checkout } = useCart()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [missing, setMissing] = useState(null)
  const [askGuest, setAskGuest] = useState(false)
  const [doneOrder, setDoneOrder] = useState(null) // pedido concluído como visitante

  useEffect(() => { setForm(profileToForm(profile)) }, [profile])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  function go(nextStep) {
    // só avança para a revisão com os dados completos
    if (nextStep === 3) {
      const miss = missingFields(form)
      if (miss.length > 0) {
        setMissing(miss)
        return
      }
    }
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleCheckout() {
    const miss = missingFields(form)
    if (miss.length > 0) {
      setStep(2)
      setMissing(miss)
      return
    }
    // Deslogado? Pergunta se quer entrar/criar conta ou seguir como visitante
    if (!user) { setAskGuest(true); return }
    finishCheckout()
  }

  async function finishCheckout() {
    setAskGuest(false)
    setBusy(true)
    setMsg(null)
    try {
      const order = await checkout(form)
      if (user) {
        navigate('/pedidos', { state: { justOrdered: true } })
      } else {
        // Visitante não tem /pedidos — mostra confirmação na tela
        setDoneOrder(order)
        window.scrollTo({ top: 0 })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function preencherAgora() {
    const first = missing?.[0]
    setMissing(null)
    if (first) {
      const el = document.getElementById('f_' + first)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => el?.focus(), 350)
    }
  }

  if (doneOrder) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <Check className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-800">Pedido enviado!</h1>
        <p className="text-sm text-gray-500">
          Pedido nº <b className="text-gray-800">{doneOrder.id.slice(0, 8)}</b> recebido.
          Abrimos o WhatsApp com o resumo — é só enviar para combinarmos a entrega.
        </p>
        <p className="text-xs text-gray-400">
          Criando uma conta, seus dados ficam salvos e você acompanha os próximos pedidos.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
          <Link to="/" className="btn-primary flex-1">Continuar comprando</Link>
          <button
            type="button"
            className="flex-1 rounded-full bg-white py-2.5 text-sm font-bold text-primary ring-1 ring-primary/40 transition hover:bg-primary/5"
            onClick={() => navigate('/login')}
          >
            Criar uma conta
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center text-gray-500">
        <ShoppingBag className="h-10 w-10 text-gray-300" />
        <p className="font-medium">Seu carrinho está vazio</p>
        <Link to="/" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">Finalizar compra</h1>

      <Stepper step={step} />

      {step > 1 && (
        <button
          type="button"
          onClick={() => go(step - 1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para {step === 3 ? 'entrega' : 'a sacola'}
        </button>
      )}

      {/* ============ PASSO 1 · SACOLA ============ */}
      {step === 1 && (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.product_id} className="card space-y-2.5">
              <div className="flex items-start gap-3">
                <Link to={'/produto/' + i.product_id} className="shrink-0">
                  <img src={i.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={'/produto/' + i.product_id} className="line-clamp-2 font-medium text-gray-800 hover:text-primary">
                    {i.name}
                  </Link>
                  <p className="text-xs text-gray-400">{formatBRL(i.price)} / un</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remover item"
                  onClick={() => removeItem(i.product_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
                <div className="flex items-center rounded-lg ring-1 ring-gray-200">
                  <button type="button" className="p-2 hover:bg-gray-50" aria-label="Diminuir" onClick={() => updateQuantity(i.product_id, i.quantity - 1)}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-9 text-center text-sm font-medium">{i.quantity}</span>
                  <button type="button" className="p-2 hover:bg-gray-50" aria-label="Aumentar" onClick={() => updateQuantity(i.product_id, Math.min(i.stock ?? 999, i.quantity + 1))}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="font-semibold text-gray-800">{formatBRL(i.price * i.quantity)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ PASSO 2 · ENTREGA ============ */}
      {step === 2 && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-bold text-gray-800">Dados para entrega</h2>
              <p className="text-xs text-gray-400">Já preenchemos com os dados da sua conta</p>
            </div>
          </div>

          {form && <CheckoutForm form={form} set={set} missing={missing} />}

          {msg && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</div>
          )}

          <p className="text-[11px] leading-relaxed text-gray-400">
            Os campos com * são obrigatórios — o pedido só é enviado com os dados completos. Ficam salvos no seu perfil.
          </p>
        </div>
      )}

      {/* ============ PASSO 3 · REVISÃO ============ */}
      {step === 3 && form && (
        <div className="space-y-3">
          <div className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <Package className="h-5 w-5 text-primary" /> Seu pedido
            </h2>
            <div className="space-y-1.5 text-sm text-gray-600">
              {items.map((i) => (
                <div key={i.product_id} className="flex justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{i.quantity}× {i.name}</span>
                  <span className="shrink-0 text-gray-400">{formatBRL(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-800">
              <span>Total ({count} itens)</span>
              <span className="text-primary">{formatBRL(total)}</span>
            </div>
          </div>

          <div className="card space-y-2.5">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <MapPin className="h-5 w-5 text-primary" /> Entrega
            </h2>
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-800">{form.full_name}</p>
              <p>{form.phone}</p>
              <p className="leading-relaxed">{formatAddress(form)}</p>
            </div>
            <button
              type="button"
              onClick={() => go(2)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar dados de entrega
            </button>
          </div>
        </div>
      )}

      {msg && step === 3 && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</div>
      )}

      {/* ============ CTA FIXO (acima da bottom nav no mobile) ============ */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-3 mt-6 border-t border-gray-200 bg-white/95 px-3 py-3 backdrop-blur md:bottom-4 md:mx-0 md:rounded-xl md:border md:px-4 md:shadow-sm ring-1 ring-transparent md:ring-gray-100">
        {step < 3 ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-sm font-bold text-gray-800">{formatBRL(total)}</p>
            </div>
            <button type="button" className="btn-primary flex-1" onClick={() => go(step + 1)}>
              {step === 1 ? 'Continuar para entrega' : 'Continuar para revisão'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={handleCheckout}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {busy ? 'Processando...' : 'Confirmar pedido via WhatsApp'}
          </button>
        )}
      </div>

      {/* ============ POPUP: DADOS INCOMPLETOS ============ */}
      {missing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setMissing(null)}>
          <div className="toast-in w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <User className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-gray-800">Não é possível finalizar sem os dados de entrega</p>
                <p className="text-sm text-gray-500">Preencha os campos destacados para enviar o pedido.</p>
              </div>
            </div>

            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              {missing.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  {fieldLabel(k)}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={preencherAgora}>
                Atualizar dados agora
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-white px-4 py-2.5 font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
                onClick={() => setMissing(null)}
              >
                Preencher depois
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============ LOGIN OU VISITANTE ============ */}
      <GuestCheckoutModal
        open={askGuest}
        onClose={() => setAskGuest(false)}
        onContinueGuest={finishCheckout}
        from="/carrinho"
      />
    </div>
  )
}

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, idx) => (
        <div key={s.n} className="flex flex-1 items-center gap-2">
          <div
            className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ' +
              (step >= s.n ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500')}
          >
            {step > s.n ? <Check className="h-3.5 w-3.5" /> : s.n}
          </div>
          <span className={'hidden text-xs font-medium sm:inline ' + (step >= s.n ? 'text-gray-800' : 'text-gray-400')}>
            {s.label}
          </span>
          {idx < STEPS.length - 1 && (
            <div className={'h-0.5 flex-1 rounded ' + (step > s.n ? 'bg-primary' : 'bg-gray-200')} />
          )}
        </div>
      ))}
    </div>
  )
}
