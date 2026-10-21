import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Banknote, Check, CreditCard, Loader2, MapPin, MessageCircle, Minus, Package, Pencil, Plus, QrCode, ShoppingBag, Trash2, User } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useStore } from '../context/StoreContext'
import { formatBRL, onlyDigits } from '../lib/utils'
import { DeliveryZonePicker, zoneFee } from '../components/DeliveryZonePicker'
import { CheckoutForm, CheckoutRetiradaFields } from '../components/CheckoutForm'
import { profileToForm, missingFields, requiredFieldsFor, fieldLabel, formatAddress, maskCpf } from '../lib/checkout'
import { readFunctionError } from '../lib/functionError'
import { GuestCheckoutModal } from '../components/GuestCheckoutModal'
import { MpPixDisplay } from '../components/MpPixDisplay'
import { useModalA11y } from '../lib/useModalA11y'
import { useCpfAccount } from '../lib/useCpfAccount'
import { CpfAccountModal } from '../components/CpfAccountModal'

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
  const { items, count, total, updateQuantity, removeItem, checkout, coupon, applyCoupon, removeCoupon, discountValue, getOrderPaymentStatus, checkMpOrderAgain, clearCart, refreshPrices, showNotice, patchSnapshotPhone } = useCart()
  const { zones } = useStore()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [missing, setMissing] = useState(null)
  const [askGuest, setAskGuest] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState('entrega') // 'entrega' | 'retirada'
  const [deliveryZone, setDeliveryZone] = useState('')  // zona escolhida (migration-31)
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')       // 'mercado_pago' | 'cartao' | 'dinheiro'

  // taxa relida da lista pública (o servidor confirma no place_order)
  const fee = deliveryMethod === 'entrega' ? zoneFee(zones, deliveryZone) : 0
  const grandTotal = Math.max(0, total - discountValue + fee)
  const [couponInput, setCouponInput] = useState('')
  const [couponMsg, setCouponMsg] = useState(null)
  const [listName, setListName] = useState('')     // salvar sacola como lista (migration-32)
  const [savingList, setSavingList] = useState(false)
  const [doneOrder, setDoneOrder] = useState(null) // pedido concluído como visitante
  const [mpPendingOrder, setMpPendingOrder] = useState(null) // { id, mpPix, total } do Pix MP
  const [mpRetry, setMpRetry] = useState(null)               // pedido já gravado SÓ faltando o Pix
  // Visitante digitou CPF que já tem conta? Sugere entrar — "continuar assim
  // mesmo" segue como visitante e não pergunta de novo neste checkout.
  const cpfAccount = useCpfAccount({ loggedIn: !!user })

  useEffect(() => { setForm(profileToForm(profile)) }, [profile])

  // telefone digitado no checkout liga o carrinho ao painel de abandonados
  // (migration-35): a loja pode chamar o cliente de volta pelo WhatsApp.
  useEffect(() => {
    if (form?.phone && onlyDigits(form.phone).length >= 10) patchSnapshotPhone(form.phone)
  }, [form?.phone, patchSnapshotPhone])

  // Preço/estoque do localStorage podem estar velhos (o admin muda no painel):
  // revalida no banco uma vez, na entrada do carrinho.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wl_cart_v1') ?? '[]')
      const ids = [...new Set((saved ?? []).map((i) => i.product_id).filter(Boolean))]
      if (ids.length) refreshPrices(ids)
    } catch { /* carrinho corrompido: o CartContext já cai no array vazio */ }
  }, [refreshPrices])

  useModalA11y(!!missing, () => setMissing(null))

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  // SALVAR SACOLA COMO LISTA DA OBRA (migration-32): repete o pedido
  // inteiro com 1 toque depois — itens com preço/estoque de hoje.
  async function saveAsList() {
    const name = listName.trim()
    if (!name) { setMsg({ type: 'err', text: 'Dê um nome para a lista (ex.: Obra da rua 10).' }); return }
    setSavingList(true)
    try {
      const { data: list, error: errList } = await supabase
        .from('shopping_lists')
        .insert({ user_id: user.id, name })
        .select('id')
        .single()
      if (errList) throw errList
      const { error: errItems } = await supabase
        .from('shopping_list_items')
        .insert(items.map((i) => ({ list_id: list.id, product_id: i.product_id, quantity: i.quantity })))
      if (errItems) throw errItems
      setListName('')
      showNotice('Lista "' + name + '" salva! Repita o pedido a qualquer momento em Minhas listas.')
    } catch (e) {
      setMsg({ type: 'err', text: 'Não foi possível salvar a lista: ' + (e?.message ?? e) })
    } finally {
      setSavingList(false)
    }
  }

  function go(nextStep) {
    // só avança para a revisão com os dados do MODO escolhido completos
    // (retirada: nome/telefone/CPF; entrega: também endereço)
    if (nextStep === 3) {
      const miss = missingFields(form, requiredFieldsFor(deliveryMethod))
      if (miss.length > 0) {
        setMissing(miss)
        return
      }
      // loja com zonas cadastradas exige a escolha (a taxa entra no total)
      if (deliveryMethod === 'entrega' && zones.length > 0 && !deliveryZone) {
        setMsg({ type: 'err', text: 'Escolha a sua zona de entrega para calcular a taxa.' })
        return
      }
    }
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleCheckout() {
    // Dados COMPLETOS do modo escolhido (retirada: nome/telefone/CPF;
    // entrega: também endereço) — sem isso o pedido não sai.
    const miss = missingFields(form, requiredFieldsFor(deliveryMethod))
    if (miss.length > 0) {
      setStep(2)
      setMissing(miss)
      return
    }
    if (deliveryMethod === 'entrega' && zones.length > 0 && !deliveryZone) {
      setStep(2)
      setMsg({ type: 'err', text: 'Escolha a sua zona de entrega para calcular a taxa.' })
      return
    }
    // Deslogado? Se o CPF digitado já tem conta, sugere ENTRAR — quem escolhe
    // "continuar assim mesmo" segue direto como visitante.
    if (!user) {
      const name = await cpfAccount.check(form.cpf)
      if (name) { cpfAccount.open(); return }
      setAskGuest(true)
      return
    }
    finishCheckout()
  }

  async function finishCheckout() {
    setAskGuest(false)
    setBusy(true)
    setMsg(null)
    try {
      const order = await checkout(form, null, { deliveryMethod, paymentMethod, deliveryZone })

      // PIX: mostra o QR aqui mesmo. Antes o retorno era descartado, a tela de
      // Pix abaixo nunca era alcançada e o cliente ficava sem o código.
      if (order.mpPix) {
        setMpPendingOrder(order)
        window.scrollTo({ top: 0 })
        return
      }

      // Escolheu Pix mas o MP não devolveu o QR: fica na revisão com o erro e
      // o botão de RETENTATIVA — sem aparentar sucesso e, principalmente, sem
      // criar OUTRO pedido quando o cliente clicar de novo.
      if (order.mpError) {
        setMpRetry(order)
        setMsg({ type: 'err', text: 'Não conseguimos gerar o Pix agora. Use "Tentar gerar novamente" abaixo (é o mesmo pedido, nada duplicou) ou fale com a loja pelo WhatsApp.' + (order.mpErrorDetail ? ' [Motivo: ' + order.mpErrorDetail + ']' : '') })
        return
      }

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

  // Retenta o Pix no MESMO pedido já gravado (o gateway é idempotente por
  // pedido: reutiliza a cobrança se existir — não duplica nada, nem no banco nem no gateway)
  async function retryPix(order) {
    if (!order || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const data = await checkMpOrderAgain(order.id)
      if (data?.qr_code) {
        setMpPendingOrder({
          ...order,
          mpPix: {
            qr_code: data.qr_code,
            qr_code_base64: data.qr_code_base64 ?? null,
            ticket_url: data.ticket_url ?? null,
            status: data.status ?? 'pending',
          },
        })
        setMpRetry(null)
        window.scrollTo({ top: 0 })
      } else {
        setMsg({ type: 'err', text: 'Ainda não conseguimos gerar o Pix (status: ' + (data?.status ?? '?') + '). Fale com a loja pelo WhatsApp ou tente mais tarde.' })
      }
    } catch (e) {
      // o corpo do erro da function traz o motivo real devolvido pelo MP
      const detalhe = await readFunctionError(e)
      setMsg({ type: 'err', text: 'Erro ao gerar o Pix. ' + (detalhe ? 'Motivo: ' + detalhe : 'Tente mais tarde.') })
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

  if (mpPendingOrder && mpPendingOrder.mpPix) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="page-title">Pague com Pix</h1>
        <MpPixDisplay
          mpPix={mpPendingOrder.mpPix}
          orderId={mpPendingOrder.id}
          total={mpPendingOrder.total}
          getOrderPaymentStatus={getOrderPaymentStatus}
          onRefresh={checkMpOrderAgain}
          onApproved={() => {
            clearCart()
            if (user) navigate('/pedidos', { state: { justOrdered: true } })
            else { setDoneOrder(mpPendingOrder); setMpPendingOrder(null) }
          }}
        />
        <div className="card space-y-2 text-sm text-gray-600">
          <p className="font-medium text-gray-800">Pedido nº {String(mpPendingOrder.id).slice(0,8)}</p>
          <p>Total: <b className="text-gray-800">{formatBRL(mpPendingOrder.total)}</b></p>
          <p className="text-xs text-gray-500">Após o pagamento o status muda automaticamente para confirmado.</p>
        </div>
        <div className="flex gap-2">
          {user ? (
            <Link to="/pedidos" className="btn-primary flex-1 text-center">Ver meus pedidos</Link>
          ) : (
            <Link to="/login" state={{ from: '/carrinho' }} className="btn-primary flex-1 text-center">Criar conta para acompanhar</Link>
          )}
          <Link to="/" className="flex-1 rounded-lg bg-white py-2.5 text-center text-sm font-bold text-primary ring-1 ring-primary/40">Continuar comprando</Link>
        </div>
      </div>
    )
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
          {doneOrder.mpPix
            ? ' Pagamento confirmado. Vamos preparar seu pedido.'
            : doneOrder.paymentMethod === 'mercado_pago'
              ? ' O Pix não pôde ser gerado agora — a loja vai falar com você para combinar o pagamento.'
              : ' A loja já foi avisada e vai falar com você pelo WhatsApp para combinar o pagamento e a entrega.'}
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
                  {i.image_url ? (
                    <img src={i.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                      <Package className="h-6 w-6" />
                    </span>
                  )}
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

      {/* CUPOM (visível na sacola) */}
      {step === 1 && (
        <div className="card space-y-2 !p-3.5">
          <label htmlFor="f_cupom" className="text-xs font-bold uppercase tracking-wider text-gray-400">Cupom de desconto</label>
          {coupon ? (
            <div className="flex items-center justify-between rounded-xl bg-green-50 px-3 py-2.5 ring-1 ring-green-200">
              <p className="text-sm font-bold text-green-700">
                🎟️ {coupon.code} — {coupon.kind === 'percent' ? Number(coupon.value) + '% off' : formatBRL(coupon.value) + ' off'}
              </p>
              <button type="button" onClick={removeCoupon} className="text-xs font-semibold text-red-500 hover:underline">
                remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                id="f_cupom"
                className="input flex-1 uppercase"
                placeholder="Ex.: VEM10"
                value={couponInput}
                onChange={(e) => { setCouponInput(e.target.value); setCouponMsg(null) }}
              />
              <button
                type="button"
                className="btn-primary px-4 text-xs"
                onClick={async () => {
                  const r = await applyCoupon(couponInput)
                  setCouponMsg(r.error ? { type: 'err', text: r.error } : { type: 'ok', text: 'Cupom aplicado! 🎉' })
                }}
              >
                Aplicar
              </button>
            </div>
          )}
          {couponMsg && (
            <p className={'text-xs font-medium ' + (couponMsg.type === 'ok' ? 'text-green-600' : 'text-red-500')}>{couponMsg.text}</p>
          )}
        </div>
      )}

      {/* SALVAR COMO LISTA DA OBRA (migration-32) — só logado */}
      {step === 1 && user && items.length > 0 && (
        <div className="card space-y-2 !p-3.5">
          <label htmlFor="f_lista_da_obra" className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Salvar sacola como lista da obra
          </label>
          <div className="flex gap-2">
            <input
              id="f_lista_da_obra"
              className="input flex-1"
              placeholder="Nome (ex.: Obra da rua 10)"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
            <button type="button" className="btn-soft px-4 text-xs" disabled={savingList || !listName.trim()} onClick={saveAsList}>
              {savingList && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Depois repita o pedido inteiro com 1 toque em <Link to="/listas" className="font-semibold text-primary hover:underline">Minhas listas</Link> — itens voltam com preço de hoje.
          </p>
        </div>
      )}

      {/* ============ PASSO 2 · ENTREGA E PAGAMENTO ============ */}
      {step === 2 && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-bold text-gray-800">Recebimento e pagamento</h2>
              <p className="text-xs text-gray-400">Escolha como quer receber e a forma de pagar</p>
            </div>
          </div>

          {/* entrega x retirada */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'entrega', label: 'Entrega', desc: 'Recebemos no seu endereço', icon: Package },
              { id: 'retirada', label: 'Retirada', desc: 'Buscar no balcão da loja', icon: ShoppingBag },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setDeliveryMethod(o.id); setMissing(null) }}
                className={'flex flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-left ring-1 transition ' +
                  (deliveryMethod === o.id
                    ? 'bg-primary/5 ring-2 ring-primary shadow-sm'
                    : 'bg-white ring-gray-200 hover:ring-primary/40')}
              >
                <o.icon className={'h-4 w-4 ' + (deliveryMethod === o.id ? 'text-primary' : 'text-gray-400')} />
                <span className={'text-sm font-bold ' + (deliveryMethod === o.id ? 'text-primary' : 'text-gray-700')}>{o.label}</span>
                <span className="text-[11px] leading-tight text-gray-400">{o.desc}</span>
              </button>
            ))}
          </div>

          {/* forma de pagamento */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'mercado_pago', label: 'Pix', icon: QrCode },
                { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                { id: 'cartao', label: 'Cartão', icon: CreditCard },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPaymentMethod(o.id)}
                  className={'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold ring-1 transition ' +
                    (paymentMethod === o.id
                      ? 'bg-secondary text-white ring-secondary'
                      : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {paymentMethod === 'mercado_pago' ? 'Pix instantâneo: QR Code + Copia e Cola na hora.' : paymentMethod === 'cartao' ? 'Cartão: pague na entrega ou na retirada (maquininha da loja).' : 'Dinheiro: informe se precisa de troco.'}
            </p>
          </div>

          {/* zonas de entrega (migration-31): taxa e prazo antes de fechar */}
          {deliveryMethod === 'entrega' && (
            <DeliveryZonePicker value={deliveryZone} onChange={(v) => { setDeliveryZone(v); setMsg(null) }} />
          )}

          {deliveryMethod === 'entrega'
            ? (form && <CheckoutForm form={form} set={set} missing={missing}
                onCpfComplete={async (v) => { const nm = await cpfAccount.check(v); if (nm) cpfAccount.open() }} />)
            : (
              // retirada: identificação completa (nome + telefone + CPF)
              // com máscaras e erro por campo — mesmo cuidado da entrega
              form && (
                <CheckoutRetiradaFields
                  form={form}
                  set={set}
                  missing={missing}
                  onCpfComplete={async (v) => { const nm = await cpfAccount.check(v); if (nm) cpfAccount.open() }}
                />
              )
            )}

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
            <div className="space-y-1 border-t border-gray-100 pt-2 text-sm font-bold text-gray-800">
              {discountValue > 0 && (
                <>
                  <div className="flex justify-between font-normal text-gray-500">
                    <span>Subtotal ({count} itens)</span><span>{formatBRL(total)}</span>
                  </div>
                  <div className="flex justify-between font-normal text-green-600">
                    <span>Cupom {coupon.code}</span><span>-{formatBRL(discountValue)}</span>
                  </div>
                </>
              )}
              {fee > 0 && (
                <div className="flex justify-between font-normal text-gray-500">
                  <span>Entrega · {deliveryZone}</span>
                  <span>{formatBRL(fee)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Total{fee > 0 ? ' com entrega' : ''}</span>
                <span className="text-primary">{formatBRL(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="card space-y-2.5">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              {deliveryMethod === 'entrega'
                ? <><MapPin className="h-5 w-5 text-primary" /> Entrega</>
                : <><ShoppingBag className="h-5 w-5 text-primary" /> Retirada no balcão</>}
            </h2>
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-800">{form.full_name}</p>
              <p>{form.phone}</p>
              {deliveryMethod === 'entrega' && <p className="leading-relaxed">{formatAddress(form)}</p>}
              <p className="pt-1 font-semibold text-gray-800">
                Pagamento: {paymentMethod === 'mercado_pago' ? 'Pix online (QR)' : paymentMethod === 'cartao' ? 'Cartão na entrega/retirada' : 'Dinheiro'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => go(2)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar recebimento
            </button>
          </div>
        </div>
      )}

      {msg && step === 3 && (
        <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          <p>{msg.text}</p>
          {mpRetry && (
            <button
              type="button"
              onClick={() => retryPix(mpRetry)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-300 transition hover:bg-red-100 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Tentar gerar o Pix novamente (o mesmo pedido nº {String(mpRetry.id).slice(0, 8)})
            </button>
          )}
        </div>
      )}

      {/* ============ CTA FIXO (acima da bottom nav no mobile) ============ */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-3 mt-6 border-t border-gray-200 bg-white/95 px-3 py-3 backdrop-blur md:bottom-4 md:mx-0 md:rounded-xl md:border md:px-4 md:shadow-sm ring-1 ring-transparent md:ring-gray-100">
        {step < 3 ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{fee > 0 ? 'Total + frete' : 'Total'}</p>
              <p className="text-sm font-bold text-gray-800">{formatBRL(grandTotal)}</p>
            </div>
            <button type="button" className="btn-primary flex-1" onClick={() => go(step + 1)}>
              {step === 1 ? 'Continuar para entrega' : 'Continuar para revisão'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={handleCheckout}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {busy ? 'Processando...' : paymentMethod === 'mercado_pago' ? 'Gerar QR Pix (Copia e Cola)' : 'Confirmar pedido via WhatsApp'}
          </button>
        )}
      </div>

      {/* ============ POPUP: DADOS INCOMPLETOS ============ */}
      {missing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setMissing(null)}>
          <div
            className="toast-in w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Dados de entrega incompletos"
          >
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

            {/* Dados completos são obrigatórios: não existe "preencher depois" */}
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-primary w-full" onClick={preencherAgora}>
                Atualizar dados agora
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

      {/* CPF digitado já tem conta: entrar ou seguir como visitante */}
      <CpfAccountModal
        open={cpfAccount.askOpen}
        name={cpfAccount.account?.name}
        onClose={cpfAccount.close}
        onLogin={() => { cpfAccount.close(); navigate('/login', { state: { from: '/carrinho' } }) }}
        onContinue={() => { cpfAccount.decline(); finishCheckout() }}
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
