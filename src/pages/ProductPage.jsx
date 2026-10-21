import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Banknote, Calculator, Check, ChevronLeft, ChevronRight, CreditCard, Loader2, MessageCircle, Minus, Package, Plus, QrCode, Share2, ShoppingBag, ShoppingCart, Star, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useStore } from '../context/StoreContext'
import { DeliveryZonePicker, zoneFee } from '../components/DeliveryZonePicker'
import { formatBRL, effectivePrice, hasActivePromo, promoPercent } from '../lib/utils'
import { CheckoutForm, CheckoutRetiradaFields } from '../components/CheckoutForm'
import { profileToForm, missingFields, requiredFieldsFor, fieldLabel, maskCpf } from '../lib/checkout'
import { FavoriteButton } from '../components/FavoriteButton'
import { GuestCheckoutModal } from '../components/GuestCheckoutModal'
import { MpPixDisplay } from '../components/MpPixDisplay'
import { useModalA11y } from '../lib/useModalA11y'
import { readFunctionError } from '../lib/functionError'
import { useCpfAccount } from '../lib/useCpfAccount'
import { CpfAccountModal } from '../components/CpfAccountModal'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem, checkout, getOrderPaymentStatus, checkMpOrderAgain, clearCart } = useCart()
  const { user, profile } = useAuth()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [offers, setOffers] = useState([])
  const offersRef = useRef(null)
  // calculadora de material (migration-30): área do cliente → unidades
  const [calcArea, setCalcArea] = useState('')
  // avaliações aprovadas (migration-33) — prova social do produto
  const [reviews, setReviews] = useState([])

  // rola o carrossel de ofertas (setas no desktop; no mobile é swipe)
  function scrollOffers(dir) {
    const el = offersRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  // ---------- FINALIZAÇÃO DIRETA (comprar agora) ----------
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyForm, setBuyForm] = useState(null)
  const [buyMissing, setBuyMissing] = useState(null)
  const [buyBusy, setBuyBusy] = useState(false)
  const [buyError, setBuyError] = useState(null)
  const [askGuest, setAskGuest] = useState(false)
  const [buyMpPending, setBuyMpPending] = useState(null) // pedido com Pix aguardando pagamento
  const [buyDone, setBuyDone] = useState(null)            // pedido concluído como visitante
  const [buyRetry, setBuyRetry] = useState(null)          // pedido gravado SÓ faltando o Pix
  // ESC/foco nos dois modais (o aviso de dados incompletos é o mais interno,
  // então só um dos dois fica ativo por vez)
  useModalA11y(buyOpen && !buyMissing, () => { setBuyOpen(false); setBuyMissing(null) })
  useModalA11y(!!buyMissing, () => setBuyMissing(null))
  const [buyDelivery, setBuyDelivery] = useState('entrega')
  const [buyZone, setBuyZone] = useState('')   // zona de entrega (migration-31)
  const [buyPayment, setBuyPayment] = useState('mercado_pago')
  const { zones } = useStore()
  // Visitante com CPF já cadastrado: "entrar na sua conta?" — continuar como
  // visitante segue normal e não pergunta de novo neste checkout.
  const cpfAccount = useCpfAccount({ loggedIn: !!user })

  // carrega os dados direto do usuário; se não houver, o form fica vazio
  useEffect(() => { setBuyForm(profileToForm(profile)) }, [profile])

  function setBuyField(key, value) {
    setBuyForm((f) => ({ ...f, [key]: value }))
    setBuyMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  function openBuyNow() {
    // Visitante também pode: o modal de login/convidado aparece na confirmação
    setBuyOpen(true)
  }

  function focusFirstMissing(miss) {
    const first = miss?.[0]
    if (!first) return
    const el = document.getElementById('f_' + first)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => el?.focus(), 350)
  }

  // Compartilhar (Web Share API nativa no celular; fallback WhatsApp)
  async function handleShare() {
    if (!product) return
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: product.name, text: product.description || product.name, url }) } catch { /* cancelado */ }
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(product.name + ' — ' + url), '_blank')
    }
  }

  async function confirmBuyNow() {
    // Dados COMPLETOS do modo escolhido (retirada: nome/telefone/CPF;
    // entrega: também endereço) — não existe mais "preencher depois".
    const miss = missingFields(buyForm, requiredFieldsFor(buyDelivery))
    if (miss.length > 0) {
      setBuyMissing(miss)
      return
    }
    // loja com zonas cadastradas exige a escolha (taxa entra no total)
    if (buyDelivery === 'entrega' && zones.length > 0 && !buyZone) {
      setBuyError('Escolha a sua zona de entrega para calcular a taxa.')
      return
    }
    // Deslogado? CPF já cadastrado sugere entrar a conta; senão pergunta
    // entrar/criar conta ou seguir como visitante
    if (!user) {
      const name = await cpfAccount.check(buyForm.cpf)
      if (name) { cpfAccount.open(); return }
      setAskGuest(true)
      return
    }
    finishBuyNow()
  }

  async function finishBuyNow() {
    setAskGuest(false)
    setBuyBusy(true)
    setBuyError(null)
    try {
      const order = await checkout(buyForm, [{
        product_id: product.id,
        name: product.name,
        price: effectivePrice(product),
        quantity: qty,
      }], { deliveryMethod: buyDelivery, paymentMethod: buyPayment, deliveryZone: buyZone })
      setBuyOpen(false)
      setBuyMissing(null)

      // PIX: mostra o QR aqui (o retorno de checkout() era descartado antes)
      if (order.mpPix) {
        setBuyMpPending(order)
        window.scrollTo({ top: 0 })
        return
      }
      if (order.mpError) {
        // Cai aqui quando o MP recusa a cobrança (ex.: conta sem Pix habilitado).
        // NÃO mostra sucesso: guarda o pedido e oferece retentativa no MESMO pedido,
        // para o clique seguinte não criar outro.
        setBuyRetry(order)
        setBuyError('Não conseguimos gerar o Pix agora. Tente gerar novamente abaixo (é o mesmo pedido, nada duplicou) ou fale com a loja.' + (order.mpErrorDetail ? ' [Motivo: ' + order.mpErrorDetail + ']' : ''))
        return
      }

      // /pedidos é rota protegida: visitante confirma na própria tela
      if (user) {
        navigate('/pedidos', { state: { justOrdered: true } })
      } else {
        setBuyDone(order)
        window.scrollTo({ top: 0 })
      }
    } catch (e) {
      setBuyError(e.message)
    } finally {
      setBuyBusy(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('products')
        .select('*, categories!products_category_id_fkey(name)')
        .eq('id', id)
        .maybeSingle()
      if (error) console.error('[produto] erro ao carregar:', error?.message ?? error)
      setProduct(data)
      setLoading(false)
      // métrica para o dashboard: produtos mais acessados
      if (data) supabase.rpc('increment_product_views', { p_id: data.id })
    }
    load()
  }, [id])

  // Ofertas relacionadas: mesma categoria primeiro, completa com outros
  useEffect(() => {
    async function loadOffers() {
      if (!product) return
      let data = []
      if (product.category_id) {
        const res = await supabase
          .from('products')
          .select('*, categories!products_category_id_fkey(name)')
          .eq('active', true)
          .eq('category_id', product.category_id)
          .neq('id', product.id)
          .limit(6)
        data = res.data ?? []
      }
      if (data.length < 6) {
        const have = new Set(data.map((d) => d.id))
        const res = await supabase
          .from('products')
          .select('*, categories!products_category_id_fkey(name)')
          .eq('active', true)
          .neq('id', product.id)
          .order('views', { ascending: false })
          .limit(6)
        data = [...data, ...(res.data ?? []).filter((r) => !have.has(r.id))]
      }
      setOffers(data.slice(0, 6))
    }
    loadOffers()
  }, [product])

  // Galeria = imagem principal + fotos extras (dedupe). Sem foto -> galeria
  // vazia mesmo (a tela mostra um bloco neutro): foto aleatória nunca mais.
  const images = useMemo(() => {
    const list = [product?.image_url, ...(product?.images ?? [])].filter(Boolean)
    return [...new Set(list)]
  }, [product])

  // avaliações: só aprovadas pela moderação (RLS já filtra, filtro extra por clareza)
  useEffect(() => {
    if (!product) return
    supabase
      .from('product_reviews')
      .select('id, rating, comment, photo_url, created_at, profiles(full_name)')
      .eq('product_id', product.id)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setReviews(data ?? []), () => setReviews([]))
  }, [product?.id])

  if (loading) {
    return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  if (!product) {
    return (
      <div className="card py-16 text-center text-gray-500">
        Produto não encontrado. <Link to="/" className="text-primary underline">Voltar à vitrine</Link>
      </div>
    )
  }

  // ---------- PIX aguardando pagamento ----------
  if (buyMpPending?.mpPix) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="page-title">Finalizar pagamento</h1>
        <MpPixDisplay
          mpPix={buyMpPending.mpPix}
          orderId={buyMpPending.id}
          total={buyMpPending.total}
          getOrderPaymentStatus={getOrderPaymentStatus}
          onRefresh={checkMpOrderAgain}
          onApproved={() => {
            clearCart()
            if (user) navigate('/pedidos', { state: { justOrdered: true } })
            else { setBuyDone(buyMpPending); setBuyMpPending(null) }
          }}
        />
        <Link to="/" className="block rounded-lg bg-white py-2.5 text-center text-sm font-bold text-primary ring-1 ring-primary/40">
          Continuar comprando
        </Link>
      </div>
    )
  }

  // ---------- Pedido de visitante concluído ----------
  if (buyDone) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <Check className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-800">Pedido enviado!</h1>
        <p className="text-sm text-gray-500">
          Pedido nº <b className="text-gray-800">{String(buyDone.id).slice(0, 8)}</b> recebido.
          {buyDone.paymentMethod === 'mercado_pago'
            ? ' O Pix não pôde ser gerado agora — a loja vai falar com você para combinar o pagamento.'
            : ' A loja já foi avisada e vai falar com você pelo WhatsApp para combinar o pagamento e a entrega.'}
        </p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
          <Link to="/" className="btn-primary flex-1 text-center">Continuar comprando</Link>
          <Link to="/login" state={{ from: '/' }} className="flex-1 rounded-lg bg-white py-2.5 text-center text-sm font-bold text-primary ring-1 ring-primary/40">
            Criar uma conta
          </Link>
        </div>
      </div>
    )
  }

  const out = !product.active || product.stock === 0
  // promoção ATIVA tem prioridade sobre o desconto percentual — mesmas regras
  // do card da vitrine, senão a página mostrava preço menor sem explicação
  const promo = hasActivePromo(product)
  const promoOff = promo ? promoPercent(product) : 0
  const hasDeal = promo || Number(product.discount_percent) > 0
  // calculadora: área (aceita vírgula decimal) / rendimento, arredondado p/ CIMA
  const coverageQty = (() => {
    const area = Number(String(calcArea).replace(',', '.'))
    const per = Number(product.coverage_value)
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(per) || per <= 0) return 0
    return Math.ceil(area / per)
  })()
  const stockLabel = product.stock == null
    ? 'Em estoque'
    : product.stock === 0 ? 'Fora de estoque' : 'Em estoque: ' + product.stock + ' unidade(s)'
  const maxQty = product.stock == null ? 99 : Math.max(1, product.stock)

  return (
    <div className="space-y-8">
      {buyError && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          <div className="flex items-start gap-2">
            <span className="flex-1">{buyError}</span>
            <button type="button" onClick={() => { setBuyError(null); setBuyRetry(null) }} aria-label="Fechar aviso" className="shrink-0 hover:text-red-900">
              <X className="h-4 w-4" />
            </button>
          </div>
          {buyRetry && (
            <button
              type="button"
              disabled={buyBusy}
              onClick={async () => {
                setBuyBusy(true)
                setBuyError(null)
                try {
                  const data = await checkMpOrderAgain(buyRetry.id)
                  if (data?.qr_code) {
                    setBuyMpPending({
                      ...buyRetry,
                      mpPix: {
                        qr_code: data.qr_code,
                        qr_code_base64: data.qr_code_base64 ?? null,
                        ticket_url: data.ticket_url ?? null,
                        status: data.status ?? 'pending',
                      },
                    })
                    setBuyRetry(null)
                    window.scrollTo({ top: 0 })
                  } else {
                    setBuyError('Ainda não conseguimos gerar o Pix (status: ' + (data?.status ?? '?') + '). Fale com a loja ou tente mais tarde.')
                  }
                } catch (er) {
                  const detalhe = await readFunctionError(er)
                  setBuyError('Erro ao gerar o Pix. ' + (detalhe ? 'Motivo: ' + detalhe : 'Tente mais tarde.'))
                } finally {
                  setBuyBusy(false)
                }
              }}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-300 transition hover:bg-red-100 disabled:opacity-50"
            >
              {buyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Tentar gerar o Pix novamente (o mesmo pedido nº {String(buyRetry.id).slice(0, 8)})
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-1">
          <FavoriteButton
            productId={id}
            className="rounded-lg p-2 hover:bg-gray-100"
            iconClass="h-4 w-4"
            inactiveIcon="text-gray-400"
          />
          <button
            type="button"
            onClick={handleShare}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-primary"
            aria-label="Compartilhar produto"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="card grid gap-6 md:grid-cols-2">
        <Gallery images={images} alt={product.name} />

        <div className="flex flex-col gap-3">
          {product.categories?.name && (
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {product.categories.name}
            </span>
          )}
          <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
          <p className="text-sm leading-relaxed text-gray-600">{product.description}</p>
          <div className="flex flex-wrap items-baseline gap-2">
            {hasDeal && (
              <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-extrabold text-white shadow-sm">
                {promo ? 'OFERTA' + (promoOff > 0 ? ' -' + promoOff + '%' : '') : '-' + product.discount_percent + '% OFF'}
              </span>
            )}
            {hasDeal && (
              <span className="text-sm font-medium text-gray-400 line-through">{formatBRL(product.price)}</span>
            )}
            <p className="text-3xl font-extrabold tracking-tight text-primary">{formatBRL(effectivePrice(product))}</p>
          </div>
          <p className={'text-sm font-medium ' + (out ? 'text-red-500' : 'text-green-600')}>{stockLabel}</p>

          <div className="mt-auto space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg ring-1 ring-gray-200">
                <button type="button" className="p-2 hover:bg-gray-50" aria-label="Diminuir quantidade" onClick={() => setQty((v) => Math.max(1, v - 1))}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-medium">{qty}</span>
                <button type="button" className="p-2 hover:bg-gray-50" aria-label="Aumentar quantidade" onClick={() => setQty((v) => Math.min(maxQty, v + 1))}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button type="button" className="btn-primary flex-1" disabled={out} onClick={() => addItem(product, qty)}>
                <ShoppingCart className="h-4 w-4" /> Adicionar ao carrinho
              </button>
            </div>

            {/* finalização direta da tela do produto (comprar agora) */}
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-primary ring-1 ring-primary/40 transition hover:bg-primary/5 disabled:opacity-50"
              disabled={out}
              onClick={openBuyNow}
            >
              <MessageCircle className="h-4 w-4" /> Finalizar pedido agora
            </button>
          </div>

          {/* ===== CALCULADORA DE MATERIAL (rendimento da migration-30) ===== */}
          {Number(product.coverage_value) > 0 && (
            <div className="rounded-xl bg-primary/5 p-4 ring-1 ring-primary/20">
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <Calculator className="h-4 w-4 text-primary" /> Calculadora de material
              </p>
              <p className="mb-3 mt-0.5 text-xs text-gray-500">
                Cada unidade cobre <b>{product.coverage_value} {product.coverage_unit || 'm²'}</b>. Informe o tamanho da sua área e calculamos a quantidade:
              </p>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input pr-14"
                    value={calcArea}
                    onChange={(e) => setCalcArea(e.target.value)}
                    placeholder={'Tamanho em ' + (product.coverage_unit || 'm²')}
                    aria-label="Tamanho da área da obra"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {product.coverage_unit || 'm²'}
                  </span>
                </div>
                <div className="shrink-0 rounded-lg bg-white px-3 py-2.5 text-center ring-1 ring-gray-200">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">precisa de</p>
                  <p className="text-base font-extrabold leading-tight text-primary">{coverageQty} un.</p>
                </div>
              </div>
              {coverageQty > 0 && (
                <button
                  type="button"
                  className="btn-primary mt-3 w-full"
                  disabled={out || coverageQty > maxQty}
                  onClick={() => addItem(product, coverageQty)}
                >
                  <ShoppingCart className="h-4 w-4" /> Adicionar {coverageQty} à sacola
                </button>
              )}
              {coverageQty > maxQty && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Só temos {maxQty} un. em estoque — adicione o que couber e combine o resto com a loja.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============ FINALIZAÇÃO DIRETA (comprar agora) ============ */}
      {buyOpen && product && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => { setBuyOpen(false); setBuyMissing(null) }}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-7 shadow-2xl safe-bottom sm:rounded-2xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar pedido"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Finalizar pedido</h2>
              <button
                type="button"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                onClick={() => { setBuyOpen(false); setBuyMissing(null) }}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* resumo do item */}
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              {images[0] ? (
                <img src={images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                  <Package className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                <p className="text-xs text-gray-500">{qty}× {formatBRL(effectivePrice(product))}</p>
              </div>
              <span className="font-bold text-primary">{formatBRL(qty * effectivePrice(product))}</span>
            </div>

            {/* recebimento: entrega x retirada */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'entrega', label: 'Entrega', icon: Package },
                { id: 'retirada', label: 'Retirada no balcão', icon: ShoppingBag },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setBuyDelivery(o.id); setBuyMissing(null); setBuyError(null) }}
                  className={'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ring-1 transition ' +
                    (buyDelivery === o.id
                      ? 'bg-primary/5 text-primary ring-2 ring-primary'
                      : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>

            {/* zona de entrega (taxa/prazo) — só quando a loja cadastrou zonas */}
            {buyDelivery === 'entrega' && (
              <DeliveryZonePicker value={buyZone} onChange={(v) => { setBuyZone(v); setBuyError(null) }} />
            )}
            {buyDelivery === 'entrega' && buyZone && (
              <p className="text-xs font-medium text-gray-500">
                Entrega em <b className="text-gray-800">{buyZone}</b>: taxa de <b className="text-gray-800">{formatBRL(zoneFee(zones, buyZone))}</b> no total.
              </p>
            )}

            {/* pagamento */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'mercado_pago', label: 'Pix', icon: QrCode },
                { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                { id: 'cartao', label: 'Cartão', icon: CreditCard },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setBuyPayment(o.id)}
                  className={'flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold ring-1 transition ' +
                    (buyPayment === o.id
                      ? 'bg-secondary text-white ring-secondary'
                      : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>

            {/* dados carregados direto do usuário (se não houver, abre vazio) */}
            {buyForm && (buyDelivery === 'entrega'
              ? <CheckoutForm form={buyForm} set={setBuyField} missing={buyMissing}
                  onCpfComplete={async (v) => { const nm = await cpfAccount.check(v); if (nm) cpfAccount.open() }} />
              : (
                <CheckoutRetiradaFields
                  form={buyForm}
                  set={setBuyField}
                  missing={buyMissing}
                  onCpfComplete={async (v) => { const nm = await cpfAccount.check(v); if (nm) cpfAccount.open() }}
                />
              ))}

            {buyError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{buyError}</div>
            )}

            <button type="button" className="btn-primary w-full" disabled={buyBusy} onClick={confirmBuyNow}>
              {buyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {buyBusy ? 'Processando...' : buyPayment === 'mercado_pago' ? 'Gerar QR Pix (Copia e Cola)' : 'Confirmar pedido via WhatsApp'}
            </button>

            <p className="text-[11px] leading-relaxed text-gray-400">
              Os dados acima vêm do seu perfil e ficam salvos nele depois do pedido.
            </p>

            {/* deslogado: login/criar conta ou seguir como visitante */}
            <GuestCheckoutModal
              open={askGuest}
              onClose={() => setAskGuest(false)}
              onContinueGuest={finishBuyNow}
              from={'/produto/' + id}
            />

            {/* CPF digitado já tem conta: entrar ou seguir como visitante */}
            <CpfAccountModal
              open={cpfAccount.askOpen}
              name={cpfAccount.account?.name}
              onClose={cpfAccount.close}
              onLogin={() => { cpfAccount.close(); navigate('/login', { state: { from: '/produto/' + id } }) }}
              onContinue={() => { cpfAccount.decline(); finishBuyNow() }}
            />

            {/* tentou finalizar sem preencher: bloqueado — pergunta se quer atualizar */}
            {buyMissing && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
                <div
                  className="toast-in w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
                  role="alertdialog"
                  aria-modal="true"
                  aria-label="Dados de entrega incompletos"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-gray-800">Não é possível finalizar sem os dados de entrega</p>
                      <p className="text-sm text-gray-500">Deseja atualizar seus dados agora?</p>
                    </div>
                  </div>

                  <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    {buyMissing.map((k) => (
                      <li key={k} className="flex items-center gap-2">• {fieldLabel(k)}</li>
                    ))}
                  </ul>

                  {/* Dados completos são obrigatórios: não existe "preencher depois" */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => { const miss = buyMissing; setBuyMissing(null); focusFirstMissing(miss) }}
                    >
                      Atualizar dados agora
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ OFERTAS RELACIONADAS (carrossel) ============ */}
      {offers.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-800">🎉 Ofertas para você</h2>
              <p className="hidden text-sm text-gray-500 sm:block">Complete sua compra e aproveite estes produtos</p>
              <p className="text-xs text-gray-500 sm:hidden">Deslize para ver mais →</p>
            </div>
            <div className="hidden shrink-0 gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => scrollOffers(-1)}
                className="rounded-full bg-white p-2 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50"
                aria-label="Rolar ofertas para a esquerda"
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => scrollOffers(1)}
                className="rounded-full bg-white p-2 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50"
                aria-label="Rolar ofertas para a direita"
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div
            ref={offersRef}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {offers.map((p) => (
              <div key={p.id} className="w-36 shrink-0 snap-start sm:w-44">
                <OfferCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ AVALIAÇÕES (migration-33) ============ */}
      {reviews.length > 0 && <ReviewsSection reviews={reviews} />}
    </div>
  )
}

// Avaliações aprovadas do produto: média + lista com foto opcional.
// Quem avaliou é quem comprou (policy anti-fake da migration-33).
function ReviewsSection({ reviews }) {
  const avg = reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviews.length
  return (
    <section className="space-y-4" aria-label="Avaliações de clientes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-800">Avaliações de quem comprou</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700 ring-1 ring-amber-200">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          {avg.toFixed(1).replace('.', ',')}
          <span className="text-xs font-normal text-amber-600">({reviews.length})</span>
        </span>
      </div>
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="card list-row flex-col items-start gap-3 !p-4 sm:flex-row">
            {r.photo_url && (
              <img src={r.photo_url} alt="Foto do cliente" className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" loading="lazy" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex gap-0.5" aria-label={'Nota ' + r.rating + ' de 5'}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={'h-3.5 w-3.5 ' + (i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
                  ))}
                </span>
                <span className="text-sm font-semibold text-gray-700">{String(r.profiles?.full_name ?? 'Cliente').split(' ')[0]}</span>
                <span className="text-xs text-gray-400">· {new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              {r.comment && <p className="text-sm leading-relaxed text-gray-600">{r.comment}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// Galeria com swipe (scroll-snap), setas no desktop e indicadores
function Gallery({ images, alt }) {
  const trackRef = useRef(null)
  const [active, setActive] = useState(0)

  function goTo(i) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  function handleScroll() {
    const el = trackRef.current
    if (!el) return
    setActive(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (images.length === 0) {
    // produto sem foto: área neutra — nunca uma imagem aleatória de banco externo
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-gray-100 text-gray-300">
        <Package className="h-16 w-16" />
      </div>
    )
  }
  if (images.length === 1) {
    return <img src={images[0]} alt={alt} className="aspect-[4/3] w-full rounded-xl object-cover" />
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={alt + ' — foto ' + (i + 1)}
            draggable={false}
            className="aspect-[4/3] w-full shrink-0 snap-center rounded-xl object-cover"
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Foto anterior"
        onClick={() => goTo(Math.max(0, active - 1))}
        className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow transition hover:bg-white sm:block"
      >
        <ChevronLeft className="h-4 w-4 text-gray-700" />
      </button>
      <button
        type="button"
        aria-label="Próxima foto"
        onClick={() => goTo(Math.min(images.length - 1, active + 1))}
        className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow transition hover:bg-white sm:block"
      >
        <ChevronRight className="h-4 w-4 text-gray-700" />
      </button>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={'Ver foto ' + (i + 1)}
            onClick={() => goTo(i)}
            className={'h-1.5 rounded-full transition-all ' + (i === active ? 'w-5 bg-primary' : 'w-1.5 bg-white/80')}
          />
        ))}
      </div>
    </div>
  )
}

// Card compacto das ofertas do carrossel: imagem quadrada, nome,
// preço e botão "Adicionar" em largura total — sem sair do card
function OfferCard({ product }) {
  const { addItem } = useCart()
  const out = !product.active || product.stock === 0

  return (
    <Link to={'/produto/' + product.id} className="card group block h-full overflow-hidden p-0 transition hover:ring-primary/30">
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-300">
            <Package className="h-12 w-12" />
          </span>
        )}
        {product.categories?.name && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
            {product.categories.name}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-2.5">
        <p className="line-clamp-2 min-h-8 text-xs font-medium text-gray-800 sm:text-sm">{product.name}</p>
        <p className="text-sm font-bold text-primary sm:text-base">{formatBRL(product.price)}</p>
        <button
          type="button"
          className="btn-primary w-full px-2 py-1.5 text-xs"
          disabled={out}
          onClick={(e) => {
            e.preventDefault()
            addItem(product)
          }}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {out ? 'Sem estoque' : 'Adicionar'}
        </button>
      </div>
    </Link>
  )
}
