import { useEffect, useState } from 'react'
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'

// CRUD de categorias — a exclusão é bloqueada quando há produtos na
// categoria (validação aqui + ON DELETE RESTRICT no banco)
export default function Categories() {
  const { categories, createCategory, updateCategory, deleteCategory } = useStore()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    supabase.from('products').select('category_id').then(({ data }) => {
      const map = {}
      ;(data ?? []).forEach((p) => { map[p.category_id] = (map[p.category_id] ?? 0) + 1 })
      setCounts(map)
    })
  }, [categories.length])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setMsg(null)
    const { error } = await createCategory(newName.trim())
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else setNewName('')
    setBusy(false)
  }

  async function handleUpdate(id) {
    if (!editing.name.trim()) return
    setBusy(true)
    setMsg(null)
    const { error } = await updateCategory(id, editing.name.trim())
    if (error) setMsg({ type: 'err', text: 'Erro ao renomear: ' + error.message })
    else setEditing(null)
    setBusy(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir esta categoria?')) return
    setBusy(true)
    setMsg(null)
    const { error } = await deleteCategory(id)
    if (error) setMsg({ type: 'err', text: error.message })
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Categorias</h1>
        <p className="text-sm text-gray-500">Organizam o menu da vitrine e os filtros de produtos.</p>
      </div>

      <form onSubmit={handleCreate} className="card flex gap-2">
        <input
          className="input"
          placeholder="Nova categoria (ex.: Tintas)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4" /> Criar
        </button>
      </form>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' +
          (msg.type === 'err' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="card flex items-center gap-3 py-3">
            <Tags className="h-4 w-4 shrink-0 text-primary" />
            {editing?.id === c.id ? (
              <>
                <input
                  className="input"
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  autoFocus
                />
                <button type="button" className="btn-primary shrink-0 px-3 py-1.5 text-xs" onClick={() => handleUpdate(c.id)} disabled={busy}>
                  Salvar
                </button>
                <button type="button" className="p-2 text-gray-400 hover:text-gray-600" onClick={() => setEditing(null)} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium text-gray-800">{c.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{counts[c.id] ?? 0} produto(s)</span>
                <button type="button" className="p-2 text-gray-400 transition hover:text-primary" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" className="p-2 text-gray-400 transition hover:text-red-500" onClick={() => handleDelete(c.id)} disabled={busy} aria-label="Excluir">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <div className="card py-12 text-center text-gray-400">Nenhuma categoria cadastrada.</div>
        )}
      </div>
    </div>
  )
}
