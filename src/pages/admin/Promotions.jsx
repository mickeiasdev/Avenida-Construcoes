import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, CalendarClock, Loader2, Plus, Search, TicketPercent, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { formatBRL, formatDateTime } from '../../lib/utils'
import { useModalA11y } from '../../lib/useModalA11y'

const DAY_MS = 24 * 60 * 60 * 1000

const EMPTY = {
  product_id: '',
  mode: 'price', // 'price' = novo valor final | 'percent' = % de desconto
  value: '',
  days: '7',
}

const round2 = (n) => Math.round(Number(n) * 100) / 100

// Data de expiração: agora + N dias
const untilFromDays = (days) => new Date(Date.now() + Number(days) * DAY_MS).toISOString()

// Dias restantes (arredonda para cima); <= 0 = promoção vencida
function daysLeft(iso) {
  if (!iso) return 0
  const diff = new Date(iso).getTime() - Date.now()
  return Number.isFinite(diff) ? Math.ceil(diff / DAY_MS) : 0
}

// ÁREA DE PROMOÇÕES: o lojista escolhe o produto, define um novo valor OU uma
// porcentagem e por quantos dias a oferta fica no ar. A tela calcula o preço
// FINAL e grava em products.promo_price + promo_until. Quando o prazo vence o
// preço volta ao original sozinho (hasActivePromo ignora data no passado).
export default function Promotions() {
  const { categories } = useStore()
  const [products, setProducts] = useState(null) // catálogo para o select
  const [promos, setPromos] = useState(null)     // produtos com promoção
  const [form, setForm] = useState(null)         // null = formulário fechado
  useModalA11y(!!form, () => setForm(null))
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [query, setQuery] = useState('')
  const [msg, setMsg] = useState(null)
  const [migrationMissing, setMigrationMissing] = useState(false)

  const offersCat = categories.find((c) => c.slug === 'ofertas' || c.name.toLowerCase() === 'ofertas')

  const load = useCallback(async () => {
    const [listRes, promoRes] = await Promise.all([
      supabase.from('products').select('id, name, price, active').order('name'),
      supabase
        .from('products')
        .select('id, name, price, promo_price, promo_until')
        .not('promo_price', 'is', null)
        .order('promo_until', { ascending: true }),
    ])
    setProducts(listRes.data ?? [])
    if (promoRes.error) {
      // coluna promo_price inexistente = migration-11 ainda não rodou
      setMigrationMissing(true)
      setPromos([])
    } else {
      setMigrationMissing(false)
      setPromos(promoRes.data ?? [])
    }
  }, [])

  useEffect(() => { load() }, [load])

  // busca por nome no select de produto
  const filtered = useMemo(() => {
    const f = query.trim().toLowerCase()
    const list = products ?? []
    return f ? list.filter((p) => p.name.toLowerCase().includes(f)) : list
  }, [products, query])

  const selectedProduct = (products ?? []).find((p) => p.id === form?.product_id)

  // prévia do preço final e do % de desconto
  const preview = useMemo(() => {
    if (!selectedProduct) return null
    const base = Number(selectedProduct.price) || 0
    const raw = Number(form?.value)
    if (!raw || raw <= 0) return null
    const final = form.mode === 'percent' ? round2(base * (1 - raw / 100)) : round2(raw)
    if (base <= 0 || final <= 0 || final >= base) return null
    return { final, off: Math.round((1 - final / base) * 100) }
  }, [form, selectedProduct])

  function openForm() {
    setMsg(null)
    setQuery('')
    setForm({ ...EMPTY })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedProduct) { setMsg({ type: 'err', text: 'Escolha o produto da promoção.' }); return }
    const days = Math.round(Number(form.days))
    if (!(days >= 1 && days <= 365)) { setMsg({ type: 'err', text: 'O prazo precisa ser de 1 a 365 dias.' }); return }
    if (!preview) { setMsg({ type: 'err', text: 'Informe um valor promocional menor que o preço original.' }); return }

    setBusy(true)
    setMsg(null)
    // promo_price é o preço FINAL já resolvido; promo_until é a data de expiração
    const { error } = await supabase
      .from('products')
      .update({ promo_price: preview.final, promo_until: untilFromDays(days) })
      .eq('id', selectedProduct.id)
    if (error) {
      setMsg({ type: 'err', text: 'Erro ao salvar a promoção: ' + error.message })
      setBusy(false)
      return
    }
    // vincula o produto à categoria Ofertas (o item só aparece lá enquanto a
    // promoção estiver ativa — ver hasActivePromo na vitrine)
    if (offersCat) {
      const { error: linkError } = await supabase
        .from('product_categories')
        .upsert(
          { product_id: selectedProduct.id, category_id: offersCat.id },
          { onConflict: 'product_id,category_id', ignoreDuplicates: true }
        )
      if (linkError) {
        setMsg({ type: 'err', text: 'Promoção salva, mas o produto não foi vinculado a Ofertas: ' + linkError.message })
      }
    } else {
      setMsg({
        type: 'err',
        text: 'Promoção salva. Para o item aparecer em Ofertas, rode o supabase/migration-11.sql no Supabase — a categoria "Ofertas" ainda não existe.',
      })
    }
    setForm(null)
    await load()
    setBusy(false)
  }

  // Encerrar = limpar promo_price/promo_until E o vínculo com Ofertas
  // (a vitrine mostra Ofertas a partir de product_categories — ver Home.jsx,
  // então deixar o vínculo sujo faria o item continuar anunciado lá).
  async function endPromo(product) {
    setBusyId(product.id)
    setMsg(null)
    const { error } = await supabase
      .from('products')
      .update({ promo_price: null, promo_until: null })
      .eq('id', product.id)
    if (error) {
      setMsg({ type: 'err', text: 'Erro ao encerrar a promoção: ' + error.message })
    } else if (offersCat) {
      const { error: unlinkError } = await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', product.id)
        .eq('category_id', offersCat.id)
      if (unlinkError) {
        setMsg({ type: 'err', text: 'Promoção encerrada, mas o item continua em Ofertas: ' + unlinkError.message })
      }
    }
    await load()
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Promoções</h1>
          <p className="page-sub">
            Escolha o produto, defina um novo valor ou uma porcentagem e por quantos dias a oferta fica no ar.
            Depois do prazo o preço volta ao original sozinho.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openForm}>
          <Plus className="h-4 w-4" /> Nova promoção
        </button>
      </div>

      {migrationMissing && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-200">
          A área de promoções ainda não está ativa no banco. Rode o arquivo <b>supabase/migration-11.sql</b> no
          SQL Editor do Supabase e recarregue esta página.
        </p>
      )}
      {msg && (
        <p className={'rounded-lg p-3 text-sm ' +
          (msg.type === 'err' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
          {msg.text}
        </p>
      )}

      {promos === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
      ) : promos.length === 0 ? (
        <div className="card empty-state">
          <TicketPercent className="empty-icon" />
          <p className="font-medium text-gray-700">Nenhuma promoção ativa</p>
          <p className="text-sm text-gray-500">Crie uma promoção para o produto aparecer na categoria Ofertas.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Preço original</th>
                <th className="px-4 py-3">Preço promocional</th>
                <th className="px-4 py-3">Desconto</th>
                <th className="px-4 py-3">Término</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const base = Number(p.price) || 0
                const promo = Number(p.promo_price) || 0
                const left = daysLeft(p.promo_until)
                const off = base > 0 && promo < base ? Math.round((1 - promo / base) * 100) : 0
                return (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500 line-through">{formatBRL(base)}</td>
                    <td className="px-4 py-3 font-semibold text-primary">{formatBRL(promo)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">-{off}%</span>
                    </td>
                    <td className="px-4 py-3">
                      {left > 0 ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-gray-600">
                          <CalendarClock className="h-4 w-4 text-gray-500" />
                          {left === 1 ? 'último dia' : left + ' dias'} · {formatDateTime(p.promo_until)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Expirada em {formatDateTime(p.promo_until)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn-soft btn-sm min-h-11"
                          disabled={busyId === p.id}
                          onClick={() => endPromo(p)}
                        >
                          {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                          Encerrar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ============ MODAL NOVA PROMOÇÃO ============ */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setForm(null)}>
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 pb-6 shadow-xl safe-bottom sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Nova promoção"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Nova promoção</h2>
              <button type="button" className="p-1 text-gray-500 hover:text-gray-600" onClick={() => setForm(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="field-label" htmlFor="promo-produto">Produto</label>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  className="input pl-10"
                  placeholder="Buscar produto pelo nome..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                id="promo-produto"
                className="input"
                required
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              >
                <option value="">Selecione o produto</option>
                {filtered.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label">Como definir o desconto</label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-50 p-1 ring-1 ring-gray-100">
                  {[{ id: 'price', l: 'Novo valor (R$)' }, { id: 'percent', l: 'Porcentagem (%)' }].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setForm({ ...form, mode: o.id })}
                      className={'min-h-11 rounded-lg px-3 text-xs font-bold transition ' +
                        (form.mode === o.id ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="promo-valor">
                  {form.mode === 'percent' ? 'Desconto (%)' : 'Novo valor (R$)'}
                </label>
                <input
                  id="promo-valor"
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.mode === 'percent' ? 'Ex.: 10' : 'Ex.: 89.90'}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="promo-dias">Dias no ar (1 a 365)</label>
                <input
                  id="promo-dias"
                  className="input"
                  type="number"
                  min="1"
                  max="365"
                  required
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                />
              </div>
            </div>

            {selectedProduct && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm ring-1 ring-gray-100">
                {preview ? (
                  <p className="text-gray-600">
                    De <span className="text-gray-500 line-through">{formatBRL(selectedProduct.price)}</span> por{' '}
                    <b className="text-primary">{formatBRL(preview.final)}</b>{' '}
                    <span className="rounded-lg bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-600">-{preview.off}%</span>
                  </p>
                ) : (
                  <p className="text-gray-500">
                    Informe um valor promocional menor que {formatBRL(selectedProduct.price)} para ver a prévia.
                  </p>
                )}
                {Number(form.days) > 0 && (
                  <p className="mt-1 text-xs text-gray-500">Termina em {formatDateTime(untilFromDays(form.days))}.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" className="btn-soft" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={busy || !preview}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar promoção
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
