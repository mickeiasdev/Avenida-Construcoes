import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { formatDate } from '../../lib/utils'
import { useConfirmDialog } from '../../components/ConfirmDialog'

const PAGE = 20

// CRUD de categorias no MESMO layout dos Pedidos: busca, abas, cards com
// ações no rodapé e scroll infinito (a lista lê por páginas de 20 conforme
// o fim aparece na tela — lojas com muitas categorias não travam o carregue).
// A contagem de produtos chega junto de cada página (leve, head-only).
// A exclusão é bloqueada quando há produtos na categoria (validação aqui +
// ON DELETE RESTRICT no banco) e pede confirmação em popup, como o resto.
const TABS = [
  { k: 'all', l: 'Todas' },
  { k: 'with', l: 'Com produtos' },
  { k: 'empty', l: 'Sem produtos' },
]

export default function Categories() {
  const { createCategory, updateCategory, deleteCategory } = useStore()
  const confirm = useConfirmDialog()

  const [rows, setRows] = useState(null)      // null = primeira carga
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [loadingMore, setLoadingMore] = useState(false)
  const [counts, setCounts] = useState({})    // id -> nº de produtos (lazy)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const sentinelRef = useRef(null)
  const visibleIdsRef = useRef([])

  // contagem de produtos por categoria (só das categorias na tela — head only,
  // nada de carregar a tabela inteira de produtos)
  const loadCounts = useCallback(async (ids) => {
    const pending = (ids ?? []).filter((id) => counts[id] === undefined)
    if (!pending.length) return
    const entries = await Promise.all(pending.map(async (id) => {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id)
      return [id, count ?? 0]
    }))
    setCounts((prev) => {
      const next = { ...prev }
      for (const [id, n] of entries) next[id] = n
      return next
    })
  }, [counts])

  const load = useCallback(async ({ from = 0, append = false } = {}) => {
    if (append) setLoadingMore(true)
    let query = supabase.from('categories').select('*', { count: 'exact' })
    const term = search.trim()
    if (term) query = query.ilike('name', '%' + term + '%')
    const { data, count, error } = await query.order('name').range(from, from + PAGE - 1)
    if (error) {
      setMsg({ type: 'err', text: 'Erro ao carregar: ' + error.message })
      if (!append) setRows([])
      setLoadingMore(false)
      return
    }
    const list = data ?? []
    setRows((prev) => (append ? [...(prev ?? []), ...list] : list))
    if (typeof count === 'number') setTotal(count)
    loadCounts(list.map((c) => c.id))
    setLoadingMore(false)
  }, [search, loadCounts])

  // primeira carga + recarrega quando a busca muda (debounce de 300ms)
  useEffect(() => {
    setRows(null)
    setTotal(0)
    const t = setTimeout(() => { load() }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  // Realtime: categoria criada/excluída em outro lugar reflete aqui;
  // produto mudou de categoria -> a contagem da página se atualiza
  useEffect(() => {
    const channel = supabase
      .channel('admin-categories-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { loadCounts(visibleIdsRef.current) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load, loadCounts])

  // o que já está na tela (para o listener de contagem)
  useEffect(() => { visibleIdsRef.current = (rows ?? []).map((c) => c.id) }, [rows])

  // ---------- scroll infinito: ao ver o fim, busca a próxima página ----------
  const canLoadMore = (rows?.length ?? 0) < total
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore && canLoadMore) {
        load({ from: rows.length, append: true })
      }
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
    // re-observar a cada página: o sentinela só existe na tela enquanto
    // ainda há o que carregar
  }, [canLoadMore, loadingMore, load, rows])

  // ---------- ações ----------
  async function handleCreate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const ok = await confirm.ask({
      title: 'Criar categoria?',
      message: '"' + name + '" entra na lista e no menu da vitrine.',
      confirmLabel: 'Criar categoria',
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    const { error } = await createCategory(name)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else { setNewName(''); setNewOpen(false) }
    setBusy(false)
  }

  async function handleUpdate(id) {
    if (!editing.name.trim()) return
    setBusy(true); setMsg(null)
    const { error } = await updateCategory(id, editing.name.trim())
    if (error) setMsg({ type: 'err', text: 'Erro ao renomear: ' + error.message })
    else setEditing(null)
    setBusy(false)
  }

  async function handleDelete(c) {
    const ok = await confirm.ask({
      title: 'Excluir a categoria "' + c.name + '"?',
      message: 'Não tem como desfazer. Categorias com produtos vinculados são bloqueadas.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    const { error } = await deleteCategory(c.id)
    setMsg(error
      ? { type: 'err', text: error.message }
      : { type: 'ok', text: 'Categoria "' + c.name + '" excluída.' })
    setBusy(false)
  }

  // ---------- filtro local por aba (contagem de produtos) ----------
  const visible = (rows ?? []).filter((c) => {
    const n = counts[c.id] ?? 0
    if (tab === 'with') return n > 0
    if (tab === 'empty') return n === 0
    return true
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Categorias</h1>
          <p className="text-sm text-gray-500">
            {rows === null ? 'Carregando…' : total + ' no total' + (search ? ' · busca "' + search + '"' : '')}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setNewOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Nova categoria
        </button>
      </div>

      {/* form de criação (mesma linha de busca dos Pedidos) */}
      {newOpen && (
        <form onSubmit={handleCreate} className="card flex flex-col gap-2 !p-3.5 sm:flex-row">
          <div className="relative flex-1">
            <Tags className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-10"
              placeholder="Nome da categoria (ex.: Tintas)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary shrink-0" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" /> Criar
          </button>
          <button type="button" className="btn-soft shrink-0" onClick={() => setNewOpen(false)} aria-label="Fechar formulário">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' +
          (msg.type === 'err' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
          {msg.text}
        </div>
      )}

      {/* abas (mesmo desenho dos Pedidos) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={'rounded-full px-3.5 py-1.5 text-xs font-bold transition ' +
              (tab === t.k
                ? 'bg-secondary text-white'
                : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-700')}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* lista */}
      {rows === null ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <Tags className="h-8 w-8 text-gray-300" />
          <p className="font-medium">{search ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}</p>
          <p className="text-sm">Crie a primeira com o botão "Nova categoria".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const n = counts[c.id] ?? 0
            const isEditing = editing?.id === c.id
            return (
              <div key={c.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {isEditing ? (
                    <input
                      className="input flex-1"
                      value={editing.name}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(c.id) }}
                      autoFocus
                      aria-label="Novo nome da categoria"
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-gray-800">
                        <Tags className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate" title={c.name}>{c.name}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">criada em {formatDate(c.created_at)}</p>
                    </div>
                  )}
                  <span className={'shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ' +
                    (n > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500')}>
                    {n > 0 ? n + ' produto' + (n > 1 ? 's' : '') : 'sem produtos'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-2.5">
                  {isEditing ? (
                    <>
                      <button type="button" className="btn-primary px-4 py-1.5 text-xs" onClick={() => handleUpdate(c.id)} disabled={busy}>
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                        onClick={() => setEditing(null)}
                      >
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                        onClick={() => setEditing({ id: c.id, name: c.name })}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        onClick={() => handleDelete(c)}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* sentinela do scroll infinito + spinner da próxima página */}
          {canLoadMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
          {loadingMore && (
            <div className="flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
            </div>
          )}
        </div>
      )}

      {confirm.dialog}
    </div>
  )
}
