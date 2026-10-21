import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HardHat, Loader2, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'

// LISTAS DE COMPRA RECORRENTE ("lista da obra" — migration-32):
// o pedreiro salva a sacola com um nome e repete tudo com 1 toque.
// "Pedir tudo" recoloca os itens com o preço/estoque DE HOJE — produto
// sumido avisa e não trava o resto.
export default function Lists() {
  const { user } = useAuth()
  const { addItem, showNotice } = useCart()
  const [lists, setLists] = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, created_at, updated_at, shopping_list_items(count)')
      .order('updated_at', { ascending: false })
    if (error) {
      setLists([])
      setMsg({ type: 'err', text: 'Listas indisponíveis — rode a migration-32 no Supabase.' })
      return
    }
    setLists((data ?? []).map((l) => ({ ...l, count: Number(l.shopping_list_items?.[0]?.count ?? 0) })))
  }, [user])

  useEffect(() => { load() }, [load])

  async function createList(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    const { error } = await supabase.from('shopping_lists').insert({ user_id: user.id, name })
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else { setNewName(''); setMsg(null); await load() }
  }

  async function removeList(id) {
    if (!window.confirm('Excluir esta lista? Os itens saem junto (a sacola não é afetada).')) return
    setBusy(true)
    const { error } = await supabase.from('shopping_lists').delete().eq('id', id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else { await load() }
  }

  // PEDIR TUDO: itens com preço/estoque ATUAIS; indisponíveis avisam sem travar
  async function orderAll(list) {
    setBusy(true)
    try {
      const { data: items, error } = await supabase
        .from('shopping_list_items')
        .select('quantity, products(id, name, price, discount_percent, promo_price, promo_until, image_url, stock, active, categories!products_category_id_fkey(name))')
        .eq('list_id', list.id)
      if (error) throw error
      const missing = []
      let added = 0
      for (const it of items ?? []) {
        const p = it.products
        if (!p || !p.active || (p.stock != null && Number(p.stock) <= 0)) {
          if (p?.name) missing.push(p.name)
          continue
        }
        const ok = addItem(p, it.quantity)
        if (ok !== false) added++
        else if (p?.name) missing.push(p.name)
      }
      if (added > 0) {
        showNotice(added + ' produto(s) da lista "' + list.name + '" foram para a sacola' +
          (missing.length ? '. Indisponível(is): ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : '') : ''))
        window.location.assign('/carrinho')
      } else {
        showNotice('Nenhum item desta lista está disponível na loja agora.')
      }
    } catch (e) {
      setMsg({ type: 'err', text: 'Não foi possível carregar os itens: ' + (e?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <HardHat className="h-6 w-6 text-primary" /> Minhas listas
        </h1>
        <p className="text-sm text-gray-500">
          Salve a sacola como "lista da obra" e repita o pedido com 1 toque — sempre com o preço de hoje.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</p>}

      {/* nova lista vazia */}
      <form onSubmit={createList} className="card flex flex-col gap-2 !p-3.5 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Nome da lista (ex.: Obra da rua 10)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Nome da nova lista"
        />
        <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4" /> Criar lista
        </button>
      </form>

      {lists === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
      ) : lists.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <HardHat className="h-10 w-10 text-gray-300" />
          <p className="font-medium">Nenhuma lista ainda</p>
          <p className="text-sm">
            Monte a sacola e use <b>Salvar como lista da obra</b> no carrinho — ou crie uma vazia acima.
          </p>
          <Link to="/" className="btn-primary mt-1">Ver produtos</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => (
            <div key={l.id} className="card space-y-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate font-bold text-gray-800">{l.name}</p>
                  <p className="text-xs text-gray-400">{l.count} item(ns)</p>
                </div>
                <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => orderAll(l)}>
                  <ShoppingCart className="h-3.5 w-3.5" /> Pedir tudo
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-400 transition hover:text-red-500"
                  onClick={() => removeList(l.id)}
                  aria-label={'Excluir lista ' + l.name}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        Dica: a lista guarda os PRODUTOS, não os preços — ao pedir, tudo volta com o valor e o estoque de hoje.
      </p>
    </div>
  )
}
