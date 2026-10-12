import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, Minus, Package, Plus, Search, ShoppingBag, Store, Trash2, Truck } from 'lucide-react'
import { CheckoutForm } from '../../components/CheckoutForm'
import { ADDRESS_FIELDS, ADDRESS_KEYS, EMPTY_FORM, missingFields } from '../../lib/checkout'
import { supabase } from '../../lib/supabaseClient'
import { createStoreOrder, DELIVERY_LABELS, fulfillmentTotals, PAYMENT_LABELS, groupByFulfillment } from '../../lib/storeOrder'
import { effectivePrice, formatBRL, maskPhone, ORDER_LABELS } from '../../lib/utils'

const PAYMENTS = [
  { k: 'dinheiro', l: 'Dinheiro' },
  { k: 'cartao', l: 'Cartão' },
  { k: 'pix', l: 'Pix' },
]

// ============================================================
// PDV da loja: o admin monta a venda presencial, escolhe o que o
// cliente leva na hora e o que fica para entrega depois. O valor
// continua sendo calculado pela RPC place_order (migration-9).
// ============================================================
export default function NewOrderAdmin() {
  const [products, setProducts] = useState(null)
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [payment, setPayment] = useState('dinheiro')
  const [missing, setMissing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const load = useCallback(async () => {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, price, discount_percent, stock, image_url, category_id, categories!products_category_id_fkey(name)')
        .eq('active', true)
        .order('name'),
      supabase.from('categories').select('id, name').order('name'),
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const hasEntrega = items.some((i) => i.fulfillment === 'entrega')
  const totals = fulfillmentTotals(items)
  const total = Math.round((totals.retirada.total + totals.entrega.total) * 100) / 100

  const f = search.trim().toLowerCase()
  const visible = (products ?? []).filter(
    (p) => (!f || (p.name || '').toLowerCase().includes(f)) && (!catFilter || p.category_id === catFilter)
  )

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: key === 'phone' ? maskPhone(value) : value }))
    setMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  function qtyOf(productId) {
    return items.find((i) => i.product_id === productId)?.quantity ?? 0
  }

  function addItem(p) {
    setError(null)
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === p.id)
      if (found) return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i))
      // venda presencial: o padrão é o cliente levar na hora
      return [...prev, {
        product_id: p.id,
        name: p.name,
        price: effectivePrice(p),
        quantity: 1,
        fulfillment: 'retirada',
        stock: p.stock,
      }]
    })
  }

  function changeQty(productId, delta) {
    setItems((prev) => prev
      .map((i) => (i.product_id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
      .filter((i) => i.quantity > 0))
  }

  function setFulfillment(productId, value) {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, fulfillment: value } : i)))
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  async function finalize() {
    setError(null)
    if (items.length === 0) { setError('Adicione pelo menos um item à venda.'); return }
    // telefone e endereço só são exigidos quando algo fica para entrega
    const miss = missingFields(form, hasEntrega ? ['phone', ...ADDRESS_KEYS] : [])
    if (!String(form.full_name ?? '').trim()) miss.unshift('full_name')
    if (miss.length > 0) {
      setMissing(miss)
      setError('Confira os campos destacados antes de finalizar.')
      return
    }
    setMissing([])
    setBusy(true)
    try {
      const order = await createStoreOrder({ items, customer: form, paymentMethod: payment })
      setDone(order)
      load() // o estoque acabou de mudar
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setDone(null)
    setItems([])
    setForm(EMPTY_FORM)
    setPayment('dinheiro')
    setMissing(null)
    setError(null)
  }

  // ---------------- comprovante da venda ----------------
  if (done) {
    const g = groupByFulfillment(done.items)
    const t = fulfillmentTotals(done.items)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card space-y-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-800">Venda registrada!</h1>
          <p className="text-sm text-gray-500">
            Pedido nº <b className="text-gray-800">{String(done.id).slice(0, 8)}</b> ·{' '}
            {ORDER_LABELS[done.status] ?? done.status} · {DELIVERY_LABELS[done.delivery_method] ?? done.delivery_method}
          </p>
        </div>

        <div className="card space-y-4">
          {g.retirada.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                <Store className="h-4 w-4" /> Retirado agora no balcão
              </p>
              {g.retirada.map((it) => (
                <div key={it.product_id} className="flex justify-between text-sm text-gray-600">
                  <span>{it.qty}× {it.name}</span>
                  <span>{formatBRL(it.qty * it.price)}</span>
                </div>
              ))}
            </div>
          )}
          {g.entrega.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                <Truck className="h-4 w-4" /> Ficou para entrega
              </p>
              {g.entrega.map((it) => (
                <div key={it.product_id} className="flex justify-between text-sm text-gray-600">
                  <span>{it.qty}× {it.name}</span>
                  <span>{formatBRL(it.qty * it.price)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1 border-t border-gray-100 pt-3 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>{formatBRL(done.subtotal)}</span>
            </div>
            {Number(done.discount) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Desconto</span><span>-{formatBRL(done.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-800">
              <span>Total ({PAYMENT_LABELS[payment] ?? payment})</span>
              <span className="text-primary">{formatBRL(done.total)}</span>
            </div>
            {t.entrega.count > 0 && (
              <p className="pt-1 text-xs text-gray-500">
                {formatBRL(t.entrega.total)} ficaram pendentes de entrega — acompanhe em Pedidos.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1" onClick={reset}>Nova venda</button>
          <Link to="/admin/pedidos" className="btn-soft flex-1">Ver pedidos</Link>
        </div>
      </div>
    )
  }

  // ---------------- montagem da venda ----------------
  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <div>
        <h1 className="page-title">Nova venda na loja</h1>
        <p className="page-sub">
          Registre a venda do cliente que está no balcão: escolha os itens e marque o que ele leva
          na hora e o que fica para entrega depois.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* -------- escolha dos itens -------- */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                className="input pl-10"
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input sm:w-48" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {!products ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
          ) : visible.length === 0 ? (
            <div className="card empty-state text-gray-500">
              <Package className="empty-icon" />
              <p>Nenhum produto encontrado.</p>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((p) => {
                const inCart = qtyOf(p.id)
                const semEstoque = Number(p.stock) <= 0
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className="list-row"
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <Package className="h-4 w-4 text-gray-500" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 leading-snug text-sm font-medium text-gray-800">{p.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-gray-500">
                          {formatBRL(effectivePrice(p))}
                          {p.categories?.name ? ' · ' + p.categories.name : ''}
                        </span>
                        {semEstoque && <span className="badge-tag text-[11px]">sem estoque</span>}
                      </span>
                    </span>
                    {inCart > 0 && (
                      <span className="shrink-0 rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        {inCart}
                      </span>
                    )}
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* -------- resumo da venda -------- */}
        <div className="h-fit space-y-4 lg:sticky lg:top-4">
          <div className="card space-y-3">
            <p className="card-title flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-gray-500" /> Itens da venda
            </p>

            {items.length === 0 ? (
              <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
                Toque nos produtos para montar a venda.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.product_id} className="space-y-2 rounded-xl bg-gray-50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 leading-snug text-sm font-medium text-gray-800">{it.name}</p>
                        <p className="text-xs text-gray-500">{it.quantity} × {formatBRL(it.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.product_id)}
                        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-500"
                        title="remover" aria-label={'Remover ' + it.name}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex overflow-hidden rounded-lg ring-1 ring-gray-200">
                        <button
                          type="button"
                          onClick={() => setFulfillment(it.product_id, 'retirada')}
                          className={'min-h-11 px-3 py-2 text-xs font-semibold transition ' +
                            (it.fulfillment === 'retirada' ? 'bg-primary text-white' : 'bg-white text-gray-500')}
                        >
                          Leva agora
                        </button>
                        <button
                          type="button"
                          onClick={() => setFulfillment(it.product_id, 'entrega')}
                          className={'min-h-11 px-3 py-2 text-xs font-semibold transition ' +
                            (it.fulfillment === 'entrega' ? 'bg-primary text-white' : 'bg-white text-gray-500')}
                        >
                          Entregar depois
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQty(it.product_id, -1)}
                          className="stepper"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(it.product_id, 1)}
                          className="stepper"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-1 border-t border-gray-100 pt-3 text-xs">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Store className="h-3.5 w-3.5" /> Leva agora · {totals.retirada.count} un.
                  </span>
                  <span>{formatBRL(totals.retirada.total)}</span>
                </div>
                <div className="flex items-center justify-between text-primary">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Truck className="h-3.5 w-3.5" /> Entrega depois · {totals.entrega.count} un.
                  </span>
                  <span>{formatBRL(totals.entrega.total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <p className="font-semibold text-gray-800">Cliente</p>
            <div>
              <label htmlFor="pdv_nome" className="mb-1 block text-xs font-medium text-gray-600">Nome do cliente *</label>
              <input
                id="pdv_nome"
                className={'input ' + (missing?.includes('full_name') ? 'border-red-400 ring-2 ring-red-100' : '')}
                value={form.full_name}
                onChange={(e) => setField('full_name', e.target.value)}
                autoComplete="off"
              />
              {missing?.includes('full_name') && (
                <p className="mt-1 text-[11px] font-medium text-red-500">Informe o nome do cliente</p>
              )}
            </div>
            <div>
              <label htmlFor="pdv_phone" className="mb-1 block text-xs font-medium text-gray-600">
                Telefone / WhatsApp {hasEntrega ? '*' : '(opcional)'}
              </label>
              <input
                id="pdv_phone"
                type="tel"
                maxLength={15}
                placeholder="(11) 99999-9999"
                className={'input ' + (missing?.includes('phone') ? 'border-red-400 ring-2 ring-red-100' : '')}
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                autoComplete="off"
              />
              {missing?.includes('phone') && (
                <p className="mt-1 text-[11px] font-medium text-red-500">Telefone obrigatório para entrega</p>
              )}
            </div>

            {hasEntrega && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600">Endereço de entrega</p>
                <CheckoutForm form={form} set={setField} missing={missing} fields={ADDRESS_FIELDS} />
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <p className="card-title">Pagamento</p>
            <div className="flex gap-2">
              {PAYMENTS.map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPayment(k)}
                  className={'flex-1 min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ' +
                    (payment === k ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200')}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="text-xl font-extrabold text-primary">{formatBRL(total)}</span>
            </div>

            {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-600">{error}</p>}

            <button type="button" className="btn-primary hidden w-full lg:inline-flex" disabled={busy} onClick={finalize}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Finalizar venda
            </button>
          </div>
        </div>
      </div>

      {/* No celular o resumo cai abaixo da lista: barra fixa com total + finalizar sempre à mão.
          Em md a sidebar fixa (w-60) entra em cena: a barra começa depois dela. */}
      <div className="fixed inset-x-0 bottom-0 z-30 mb-1 flex items-center gap-3 border-t border-gray-200 bg-white/95 px-4 py-2.5  backdrop-blur md:left-60 lg:hidden">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total</p>
          <p className="text-sm font-bold text-gray-800">{formatBRL(total)}</p>
        </div>
        <button
          type="button"
          className="btn-primary btn-sm ml-auto h-11 shrink-0"
          disabled={busy || items.length === 0}
          onClick={finalize}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Finalizar venda
        </button>
      </div>
    </div>
  )
}
