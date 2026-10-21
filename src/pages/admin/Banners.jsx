import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase, uploadImage, deleteImagesByUrls } from '../../lib/supabaseClient'
import { useConfirmDialog } from '../../components/ConfirmDialog'

// Banners promocionais da vitrine (migration-34): a Home mostra um
// carrossel com os banners ATIVOS (foto + título + subtítulo + botão).
// Sem banners, o hero atual com o banner fixo continua valendo.
export default function Banners() {
  const confirm = useConfirmDialog()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [novo, setNovo] = useState({ image_url: '', title: '', subtitle: '', cta_text: '', cta_url: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('home_banners').select('*').order('sort').order('created_at')
    if (error) {
      setRows([])
      setMsg({ type: 'err', text: 'Banners indisponíveis — rode a migration-34 no Supabase.' })
      return
    }
    setRows(data ?? [])
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, 'branding')
      setNovo((n) => ({ ...n, image_url: url }))
    } catch (err) {
      setMsg({ type: 'err', text: 'Upload: ' + err.message })
    } finally { setUploading(false) }
  }

  async function addBanner() {
    if (!novo.image_url) { setMsg({ type: 'err', text: 'Envie a imagem do banner primeiro.' }); return }
    setBusy(true)
    const { error } = await supabase.from('home_banners').insert({
      image_url: novo.image_url,
      title: novo.title.trim() || null,
      subtitle: novo.subtitle.trim() || null,
      cta_text: novo.cta_text.trim() || null,
      cta_url: novo.cta_url.trim() || null,
      active: true,
    })
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else {
      setNovo({ image_url: '', title: '', subtitle: '', cta_text: '', cta_url: '' })
      setMsg(null)
      await load()
    }
  }

  function setLocal(id, key, value) {
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }

  async function saveBanner(b) {
    setBusy(true)
    const { error } = await supabase.from('home_banners').update({
      title: b.title ?? null,
      subtitle: b.subtitle ?? null,
      cta_text: b.cta_text ?? null,
      cta_url: b.cta_url ?? null,
      active: b.active,
      sort: Math.max(0, Number(b.sort) || 0),
    }).eq('id', b.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao salvar: ' + error.message })
    else setMsg({ type: 'ok', text: 'Banner salvo! A vitrine vê na hora (Realtime).' })
  }

  async function removeBanner(b) {
    const ok = await confirm.ask({
      title: 'Excluir este banner?',
      message: 'Sai do carrossel da vitrine e a imagem é apagada do Storage.',
      confirmLabel: 'Excluir banner',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('home_banners').delete().eq('id', b.id)
    if (!error) await deleteImagesByUrls([b.image_url])
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Banners da vitrine</h1>
        <p className="text-sm text-gray-500">
          Campanhas no carrossel da Home ("semana do acabamento", promoções). Sem banners ativos, o hero padrão continua.
        </p>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' + (msg.type === 'ok'
          ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
          {msg.text}
        </div>
      )}

      {/* NOVO BANNER */}
      <div className="card space-y-3">
        <h2 className="font-bold text-gray-800">Novo banner</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                {novo.image_url ? (
                  <img src={novo.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300"><ImagePlus className="h-6 w-6" /></div>
                )}
              </div>
              <label className="btn-primary cursor-pointer px-3 py-1.5 text-xs">
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? 'Enviando...' : 'Enviar imagem'}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            </div>
            <input className="input" placeholder="Título (ex.: Semana do acabamento)" value={novo.title} onChange={(e) => setNovo({ ...novo, title: e.target.value })} aria-label="Título do banner" />
            <input className="input" placeholder="Subtítulo (opcional)" value={novo.subtitle} onChange={(e) => setNovo({ ...novo, subtitle: e.target.value })} aria-label="Subtítulo do banner" />
          </div>
          <div className="space-y-2">
            <input className="input" placeholder="Texto do botão (ex.: Ver ofertas)" value={novo.cta_text} onChange={(e) => setNovo({ ...novo, cta_text: e.target.value })} aria-label="Texto do botão" />
            <input className="input" placeholder="Link do botão (ex.: /?cat=ofertas)" value={novo.cta_url} onChange={(e) => setNovo({ ...novo, cta_url: e.target.value })} aria-label="Link do botão" />
            <p className="text-xs text-gray-400">Links internos começam com / (ex.: /?cat=ofertas); externos com https://</p>
            <button type="button" className="btn-primary w-full" onClick={addBanner} disabled={busy || uploading}>
              <Plus className="h-4 w-4" /> Adicionar ao carrossel
            </button>
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="card py-10 text-center text-sm text-gray-400">Nenhum banner cadastrado ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((b) => (
            <div key={b.id} className="card space-y-2.5">
              <div className="relative h-28 overflow-hidden rounded-xl bg-gray-100">
                <img src={b.image_url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="truncate text-sm font-bold text-white">{b.title || '(sem título)'}</p>
                </div>
              </div>
              <input className="input" value={b.title ?? ''} onChange={(e) => setLocal(b.id, 'title', e.target.value)} aria-label="Título" placeholder="Título" />
              <input className="input" value={b.subtitle ?? ''} onChange={(e) => setLocal(b.id, 'subtitle', e.target.value)} aria-label="Subtítulo" placeholder="Subtítulo" />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" value={b.cta_text ?? ''} onChange={(e) => setLocal(b.id, 'cta_text', e.target.value)} aria-label="Texto do botão" placeholder="Botão" />
                <input className="input" value={b.cta_url ?? ''} onChange={(e) => setLocal(b.id, 'cta_url', e.target.value)} aria-label="Link do botão" placeholder="/?cat=ofertas" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(b.active)} onChange={(e) => setLocal(b.id, 'active', e.target.checked)} />
                  ativo
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    ordem
                    <input className="input w-16 px-2 py-1 text-center" type="number" value={b.sort} onChange={(e) => setLocal(b.id, 'sort', e.target.value)} aria-label="Ordem do banner" />
                  </label>
                  <button type="button" className="btn-soft btn-sm" onClick={() => saveBanner(b)} disabled={busy}>Salvar</button>
                  <button type="button" className="rounded-lg p-2 text-gray-400 transition hover:text-red-500" onClick={() => removeBanner(b)} aria-label="Excluir banner">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm.dialog}
    </div>
  )
}
