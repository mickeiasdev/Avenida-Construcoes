import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Search, Tags, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { formatDate } from '../../lib/utils'
import { useConfirmDialog } from '../../components/ConfirmDialog'

const PAGE = 20

// CRUD de categorias no MESMO layout de Clientes/Cupons/Produtos:
// header com contagem, busca + ação na mesma linha e TABELA em card
// (linhas com ações à direita). Scroll infinito por baixo da tabela —
// lojas com muitas categorias paginam de 20 em 20 conforme rola.
// A contagem de produtos chega junto de cada página (head-only, leve).
// Exclusão bloqueada com produtos na categoria (aqui + ON DELETE RESTRICT
// no banco) e pede confirmação em popup, como todo o painel.
export default function Categories() {
  const { createCategory, updateCategory, deleteCategory } = useStore()
  const confirm = useConfirmDialog()

  const [rows, setRows] = useState(null)      // null = primeira carga
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState({})    // id -> nº de produtos (lazy)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [msg, setMsg] = useState(null)

  const sentinelRef = useRef(null)
  const visibleIdsRef = useRef([])

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

  // primeira carga + busca com debounce
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

  useEffect(() => { visibleIdsRef.current = (rows ?? []).map((c) => c.id) }, [rows])

  // scroll infinito: a sentinela logo abaixo da tabela puxa a próxima página
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

  return (
    <div className="space-y-6">
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

      {/* form de criação (abre na mesma linha de estilo dos outros cadastros) */}
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

      {/* busca — mesmo desenho de Clientes/Cupons/Produtos */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-10"
          placeholder="Buscar categoria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar categoria"
        />
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <Tags className="h-8 w-8 text-gray-300" />
          <p className="font-medium">{search ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}</p>
          <p className="text-sm">Crie a primeira com o botão "Nova categoria".</p>
        </div>
      ) : (
        <>
          {/* tabela no mesmo padrão de Clientes/Cupons */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Produtos</th>
                  <th className="px-4 py-3">Criada em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const n = counts[c.id] ?? 0
                  const isEditing = editing?.id === c.id
                  return (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      {isEditing ? (
                        <td className="px-4 py-3" colSpan={4}>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              className="input flex-1 sm:max-w-xs"
                              value={editing.name}
                              onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(c.id) }}
                              autoFocus
                              aria-label="Novo nome da categoria"
                            />
                            <button type="button" className="btn-primary px-4 py-1.5 text-xs" onClick={() => handleUpdate(c.id)} disabled={busy}>
                              Salvar
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                              onClick={() => setEditing(null)}
                            >
                              <X className="h-3.5 w-3.5" /> Cancelar
                            </button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">{c.name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={'rounded-lg px-2.5 py-0.5 text-[11px] font-bold ' +
                              (n > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500')}>
                              {n}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-primary"
                                onClick={() => setEditing({ id: c.id, name: c.name })}
                                aria-label={'Editar categoria ' + c.name}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                                onClick={() => handleDelete(c)}
                                disabled={busy}
                                aria-label={'Excluir categoria ' + c.name}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* scroll infinito: sentinela + spinner da próxima página */}
          {canLoadMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
          {loadingMore && (
            <div className="flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
            </div>
          )}
        </>
      )}

      {confirm.dialog}
    </div>
  )
}
