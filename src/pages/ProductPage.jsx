import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, MessageCircle, Minus, Plus, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/utils'
import { CheckoutForm, profileToForm, missingFields, fieldLabel } from '../components/CheckoutForm'

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem, checkout } = useCart()
  const { user, profile } = useAuth()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [offers, setOffers] = useState([])
  const offersRef = useRef(null)

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

  // carrega os dados direto do usuário; se não houver, o form fica vazio
  useEffect(() => { setBuyForm(profileToForm(profile)) }, [profile])

  function setBuyField(key, value) {
    setBuyForm((f) => ({ ...f, [key]: value }))
    setBuyMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  function openBuyNow() {
    if (!user) {
      navigate('/login', { state: { from: '/produto/' + id } })
      return
    }
    setBuyOpen(true)
  }

  function focusFirstMissing(miss) {
    const first = miss?.[0]
    if (!first) return
    const el = document.getElementById('f_' + first)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => el?.focus(), 350)
  }

  async function confirmBuyNow() {
    // tentou finalizar sem preencher → NÃO permite; pergunta se quer atualizar
    const miss = missingFields(buyForm)
    if (miss.length > 0) {
      setBuyMissing(miss)
      return
    }
    setBuyBusy(true)
    setBuyError(null)
    try {
      await checkout(buyForm, [{
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: qty,
      }])
      setBuyOpen(false)
      setBuyMissing(null)
      navigate('/pedidos')
    } catch (e) {
      setBuyError(e.message)
    } finally {
      setBuyBusy(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
        .eq('id', id)
        .maybeSingle()
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
          .select('*, categories(name)')
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
          .select('*, categories(name)')
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

  // Galeria = imagem principal + fotos extras (dedupe)
  const images = useMemo(() => {
    const list = [product?.image_url, ...(product?.images ?? [])].filter(Boolean)
    const unique = [...new Set(list)]
    return unique.length > 0 ? unique : [FALLBACK_IMG]
  }, [product])

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

  const out = !product.active || product.stock === 0
  const stockLabel = product.stock == null
    ? 'Em estoque'
    : product.stock === 0 ? 'Fora de estoque' : 'Em estoque: ' + product.stock + ' unidade(s)'
  const maxQty = product.stock == null ? 99 : Math.max(1, product.stock)

  return (
    <div className="space-y-8">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

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
          <p className="text-3xl font-extrabold text-primary">{formatBRL(product.price)}</p>
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
        </div>
      </div>

      {/* ============ FINALIZAÇÃO DIRETA (comprar agora) ============ */}
      {buyOpen && product && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => { setBuyOpen(false); setBuyMissing(null) }}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
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
              <img src={images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                <p className="text-xs text-gray-500">{qty}× {formatBRL(product.price)}</p>
              </div>
              <span className="font-bold text-primary">{formatBRL(qty * Number(product.price))}</span>
            </div>

            {/* dados carregados direto do usuário (se não houver, abre vazio) */}
            {buyForm && <CheckoutForm form={buyForm} set={setBuyField} missing={buyMissing} />}

            {buyError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{buyError}</div>
            )}

            <button type="button" className="btn-primary w-full" disabled={buyBusy} onClick={confirmBuyNow}>
              {buyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {buyBusy ? 'Processando...' : 'Confirmar pedido via WhatsApp'}
            </button>

            <p className="text-[11px] leading-relaxed text-gray-400">
              Os dados acima vêm do seu perfil e ficam salvos nele depois do pedido.
            </p>

            {/* tentou finalizar sem preencher: bloqueado — pergunta se quer atualizar */}
            {buyMissing && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
                <div className="toast-in w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
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

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      onClick={() => { const miss = buyMissing; setBuyMissing(null); focusFirstMissing(miss) }}
                    >
                      Atualizar dados agora
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-lg bg-white px-4 py-2.5 font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
                      onClick={() => setBuyMissing(null)}
                    >
                      Depois
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
    </div>
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

  if (images.length <= 1) {
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
        <img
          src={product.image_url || FALLBACK_IMG}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
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
