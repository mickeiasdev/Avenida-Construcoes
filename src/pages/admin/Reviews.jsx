import { useEffect, useState } from 'react'
import { Check, Loader2, Star, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { formatDateTime } from '../../lib/utils'

// Moderação de avaliações (migration-33): review só nasce de pedido ENTREGUE
// (policy anti-fake), entra PENDENTE e o painel decide — aprovada vai para a
// página do produto com foto, nota e comentário.
export default function Reviews() {
  const confirm = useConfirmDialog()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('product_reviews')
      .select('id, product_id, order_id, rating, comment, photo_url, approved, created_at, products(name), profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) {
      setRows([])
      // mostra o MOTIVO real (antes o texto genérico escondia o problema)
      setMsg({ type: 'err', text: 'Avaliações indisponíveis: ' + (error?.message ?? 'erro desconhecido') +
        ' — rode a migration-33 no Supabase se ainda não rodou (ela é re-executável).' })
      return
    }
    setRows(data ?? [])
  }

  async function approve(r) {
    setBusy(true)
    const { error } = await supabase.from('product_reviews').update({ approved: true }).eq('id', r.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao aprovar: ' + error.message })
    else { setMsg({ type: 'ok', text: 'Avaliação publicada na página do produto!' }); await load() }
  }

  async function remove(r) {
    const ok = await confirm.ask({
      title: 'Excluir esta avaliação?',
      message: 'Sai da moderação para sempre (junto com a foto, se houver).',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('product_reviews').delete().eq('id', r.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else await load()
  }

  function Stars({ n }) {
    return (
      <span className="flex shrink-0 gap-0.5" aria-label={n + ' de 5 estrelas'}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={'h-4 w-4 ' + (i <= n ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
        ))}
      </span>
    )
  }

  function ReviewCard({ r, actions }) {
    return (
      <div className="card list-row flex-col items-start gap-3 !p-4 sm:flex-row">
        {r.photo_url && (
          <img src={r.photo_url} alt="Foto da avaliação" className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stars n={r.rating} />
            <span className="text-sm font-bold text-gray-800">{r.products?.name ?? 'Produto'}</span>
            <span className="text-xs text-gray-400">· {r.profiles?.full_name || 'Cliente'}</span>
            <span className="text-xs text-gray-400">· {formatDateTime(r.created_at)}</span>
          </div>
          {r.comment && <p className="text-sm leading-relaxed text-gray-600">{r.comment}</p>}
          {r.order_id && <p className="text-[11px] text-gray-400">pedido #{String(r.order_id).slice(0, 8)}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 gap-1.5">
            {!r.approved && (
              <button type="button" className="btn-primary btn-sm" onClick={() => approve(r)} disabled={busy}>
                <Check className="h-3.5 w-3.5" /> Aprovar
              </button>
            )}
            <button type="button" className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500" onClick={() => remove(r)} aria-label="Excluir avaliação">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    )
  }

  const pending = (rows ?? []).filter((r) => !r.approved)
  const approved = (rows ?? []).filter((r) => r.approved)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Avaliações de produtos</h1>
        <p className="text-sm text-gray-500">
          Só clientes com pedido ENTREGUE avaliam (anti-fake). Aprovadas aparecem na página do produto.
        </p>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' + (msg.type === 'ok'
          ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
          {msg.text}
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
              Aguardando moderação
              {pending.length > 0 && <span className="badge-count bg-amber-500">{pending.length}</span>}
            </h2>
            {pending.length === 0 ? (
              <p className="card py-8 text-center text-sm text-gray-400">Nada pendente — produzindo prova social limpa. 🎉</p>
            ) : (
              pending.map((r) => <ReviewCard key={r.id} r={r} actions />)
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
              Publicadas
              <span className="badge-count">{approved.length}</span>
            </h2>
            {approved.length === 0 ? (
              <p className="card py-8 text-center text-sm text-gray-400">Nenhuma avaliação publicada ainda.</p>
            ) : (
              approved.map((r) => <ReviewCard key={r.id} r={r} actions />)
            )}
          </section>
        </>
      )}

      {confirm.dialog}
    </div>
  )
}
