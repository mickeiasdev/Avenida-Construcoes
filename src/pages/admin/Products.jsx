import { useCallback, useEffect, useState } from 'react'
import { ImagePlus, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase, uploadImage, deleteImagesByUrls } from '../../lib/supabaseClient'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useStore } from '../../context/StoreContext'
import { formatBRL } from '../../lib/utils'
import { useModalA11y } from '../../lib/useModalA11y'

const EMPTY = {
  id: null, name: '', description: '', price: '', discount_percent: 0,
  category_id: '', stock: '', image_url: '', images: [], active: true,
  min_stock: '',                       // alerta de reposição (migration-30)
  coverage_value: '', coverage_unit: 'm²', // calculadora de material (migration-30)
}

// CRUD de produtos: categoria opcional, estoque opcional (vazio = sem
// controle) e galeria de fotos extras (o cliente passa o dedo na vitrine)
export default function Products() {
  const { categories } = useStore()
  const confirm = useConfirmDialog()
  const [products, setProducts] = useState(null)
  const [filter, setFilter] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  useModalA11y(!!modal, () => setModal(null))
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories!products_category_id_fkey(name)')
      .order('created_at', { ascending: false })
    if (error) console.error('[admin/produtos] erro ao carregar:', error?.message ?? error)
    setProducts(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, 'products')
      setModal((m) => ({ ...m, image_url: url }))
    } catch (err) {
      setMsg({ type: 'err', text: 'Upload: ' + err.message })
    } finally { setUploading(false) }
  }

  // várias fotos de uma vez (galeria)
  async function handleGalleryUpload(e) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) {
        urls.push(await uploadImage(file, 'products'))
      }
      setModal((m) => ({ ...m, images: [...(m.images ?? []), ...urls] }))
    } catch (err) {
      setMsg({ type: 'err', text: 'Upload: ' + err.message })
    } finally { setUploading(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    const payload = {
      name: modal.name.trim(),
      description: modal.description.trim(),
      price: Number(modal.price),
      discount_percent: Math.min(95, Math.max(0, Number(modal.discount_percent) || 0)), // 0-95%
      category_id: modal.category_id || null,       // categoria opcional
      stock: modal.stock === '' ? null : Number(modal.stock), // estoque opcional
      min_stock: modal.min_stock === '' ? null : Math.max(0, Number(modal.min_stock) || 0),
      coverage_value: modal.coverage_value === '' ? null : Math.max(0.01, Number(String(modal.coverage_value).replace(',', '.')) || 0.01),
      coverage_unit: modal.coverage_unit || 'm²',
      image_url: modal.image_url || null,
      images: modal.images ?? [],
      active: modal.active,
    }
    const original = modal.id ? (products ?? []).find((x) => x.id === modal.id) : null

    // Ações sensíveis pedem confirmação em popup: produto novo e
    // desativação. Edições comuns seguem direto (sem fricção).
    if (!modal.id) {
      const ok = await confirm.ask({
        title: 'Adicionar este produto à loja?',
        message: '"' + payload.name + '" ' + (payload.active
          ? 'vai ao ar na vitrine na hora.'
          : 'fica salvo como INATIVO — só aparece depois de ativar.'),
        confirmLabel: 'Adicionar produto',
      })
      if (!ok) return
    } else if (original?.active && !payload.active) {
      const ok = await confirm.ask({
        title: 'Desativar "' + payload.name + '"?',
        message: 'O produto sai da vitrine e das buscas. Nada é apagado — dá para reativar depois.',
        confirmLabel: 'Desativar produto',
      })
      if (!ok) return
    }

    setBusy(true)
    const res = modal.id
      ? await supabase.from('products').update(payload).eq('id', modal.id)
      : await supabase.from('products').insert(payload)
    if (res.error) setMsg({ type: 'err', text: 'Erro ao salvar: ' + res.error.message })
    else {
      // Na edição: imagens trocadas/removidas saem do Storage também —
      // se não apagasse, o arquivo ficaria órfão ocupando o plano gratuito
      if (original) {
        const antes = [original.image_url, ...(original.images ?? [])]
        const agora = new Set([payload.image_url, ...payload.images])
        await deleteImagesByUrls(antes.filter((u) => u && !agora.has(u)))
      }
      setModal(null)
      await load()
    }
    setBusy(false)
  }

  async function handleDelete(id) {
    // coleta as URLs ANTES de excluir (a lista some junto)
    const p = (products ?? []).find((x) => x.id === id)
    const ok = await confirm.ask({
      title: 'Excluir o produto "' + (p?.name ?? 'produto') + '"?',
      message: 'Sai da vitrine e das buscas; as imagens são apagadas do Storage. Não tem como desfazer.',
      confirmLabel: 'Excluir produto',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else {
      // produto excluído -> imagens dele saem do Storage também
      await deleteImagesByUrls([p?.image_url, ...(p?.images ?? [])])
      await load()
    }
  }

  function openEdit(p) {
    setModal({
      ...p,
      price: String(p.price),
      discount_percent: p.discount_percent ?? 0,
      stock: p.stock == null ? '' : String(p.stock),
      min_stock: p.min_stock == null ? '' : String(p.min_stock),
      coverage_value: p.coverage_value == null ? '' : String(p.coverage_value),
      coverage_unit: p.coverage_unit || 'm²',
      images: p.images ?? [],
    })
  }

  const f = filter.toLowerCase()
  const visible = (products ?? []).filter((p) =>
    p.name.toLowerCase().includes(f) &&
    (catFilter === 'all' || (catFilter === 'none' ? !p.category_id : p.category_id === catFilter))
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Produtos</h1>
          <p className="text-sm text-gray-500">{products?.length ?? 0} cadastrados</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Novo produto
        </button>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' +
          (msg.type === 'err' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
          {msg.text}
        </div>
      )}

      {/* Filtros: nome + categoria */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className="input pl-10" placeholder="Filtrar por nome..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <select className="input sm:max-w-52" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!products ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-gray-100 object-cover" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">{p.name}</p>
                        <p className="max-w-56 truncate text-xs text-gray-400">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.categories?.name ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{formatBRL(p.price)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.stock == null ? <span className="text-gray-400" title="Sem controle de estoque">—</span> : (
                      <span className={'font-semibold ' + (p.min_stock != null && Number(p.stock) <= Number(p.min_stock) ? 'text-red-600' : '')}>
                        {p.stock}
                        {p.min_stock != null && Number(p.stock) <= Number(p.min_stock) && (
                          <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600" title={'Estoque no mínimo (' + p.min_stock + ') — repor'}>
                            repor
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' +
                      (p.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500')}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="p-2 text-gray-400 transition hover:text-primary" onClick={() => openEdit(p)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="p-2 text-gray-400 transition hover:text-red-500" onClick={() => handleDelete(p.id)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ============ MODAL CRIAR/EDITAR ============ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setModal(null)}>
          <form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-7 shadow-xl safe-bottom sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={modal?.id ? 'Editar produto' : 'Novo produto'}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{modal.id ? 'Editar produto' : 'Novo produto'}</h2>
              <button type="button" className="p-1 text-gray-400 hover:text-gray-600" onClick={() => setModal(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_nome">Nome</label>
              <input id="f_nome" className="input" required value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_descricao">Descrição</label>
              <textarea id="f_descricao" className="input min-h-20" value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_preco_r">Preço (R$)</label>
                <input id="f_preco_r" className="input" type="number" step="0.01" min="0" required value={modal.price} onChange={(e) => setModal({ ...modal, price: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Desconto % (opcional)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="95"
                  value={modal.discount_percent}
                  onChange={(e) => setModal({ ...modal, discount_percent: e.target.value })}
                  placeholder="0 = preço cheio"
                />
                {Number(modal.discount_percent) > 0 && Number(modal.price) > 0 && (
                  <p className="mt-1 text-xs text-green-600">
                    De {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(modal.price))} por{' '}
                    <b>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(modal.price) * (1 - Number(modal.discount_percent) / 100))}</b>
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Estoque (opcional)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={modal.stock}
                  onChange={(e) => setModal({ ...modal, stock: e.target.value })}
                  placeholder="Deixe vazio p/ apenas 'Em estoque'"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Estoque mínimo (alerta)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={modal.min_stock}
                  onChange={(e) => setModal({ ...modal, min_stock: e.target.value })}
                  placeholder="Vazio = sem alerta de reposição"
                />
              </div>
            </div>

            {/* CALCULADORA DE MATERIAL — rendimento por unidade (migration-30) */}
            <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
              <p className="text-sm font-medium text-gray-700">Calculadora de material (opcional)</p>
              <p className="mb-2 text-xs text-gray-500">
                Com o rendimento por unidade, a página do produto calcula "quantos eu preciso?" para o cliente.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">1 unidade cobre</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={modal.coverage_value}
                    onChange={(e) => setModal({ ...modal, coverage_value: e.target.value })}
                    placeholder="Ex.: 5"
                  />
                </div>
                <div>
                  <label className="field-label">Unidade de medida</label>
                  <select className="input" value={modal.coverage_unit} onChange={(e) => setModal({ ...modal, coverage_unit: e.target.value })}>
                    <option value="m²">m² (área)</option>
                    <option value="m">m (linear)</option>
                    <option value="m³">m³ (volume)</option>
                  </select>
                </div>
              </div>
              {String(modal.coverage_value) !== '' && Number(String(modal.coverage_value).replace(',', '.')) > 0 && (
                <p className="mt-2 text-xs text-green-600">
                  Cliente informa 30 {modal.coverage_unit || 'm²'} → site sugere{' '}
                  <b>{Math.ceil(30 / Number(String(modal.coverage_value).replace(',', '.')))} un.</b> deste produto
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_categoria_opcional">Categoria (opcional)</label>
              <select id="f_categoria_opcional" className="input" value={modal.category_id} onChange={(e) => setModal({ ...modal, category_id: e.target.value })}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Foto principal */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Foto principal</label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                  {modal.image_url ? (
                    <img src={modal.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300"><ImagePlus className="h-5 w-5" /></div>
                  )}
                </div>
                <label className="btn-primary cursor-pointer px-3 py-1.5 text-xs">
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {uploading ? 'Enviando...' : 'Enviar imagem'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                </label>
              </div>
            </div>

            {/* Galeria (várias fotos) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fotos extras (o cliente desliza na página do produto)</label>
              {(modal.images ?? []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {modal.images.map((url, idx) => (
                    <div key={url + idx} className="relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-gray-200">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        aria-label="Remover foto"
                        onClick={() => setModal((m) => ({ ...m, images: m.images.filter((_, i) => i !== idx) }))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50">
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? 'Enviando...' : 'Adicionar fotos'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={modal.active}
                onChange={(e) => setModal({ ...modal, active: e.target.checked })}
              />
              Produto ativo (visível na vitrine)
            </label>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mb-4">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {modal.id ? 'Salvar alterações' : 'Criar produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* confirmações em popup (adicionar/desativar/excluir produto) */}
      {confirm.dialog}
    </div>
  )
}
