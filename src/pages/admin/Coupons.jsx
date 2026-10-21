import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, TicketPercent, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useStore } from '../../context/StoreContext'
import { formatBRL, formatDate } from '../../lib/utils'
import { useModalA11y } from '../../lib/useModalA11y'

const EMPTY = {
  id: null, code: '', kind: 'percent', value: '', min_total: 0, active: true,
  // regras avançadas (migration-31)
  valid_from: '', valid_until: '', first_purchase_only: false, category_id: '',
}

// ISO → valor de input datetime-local (fuso do navegador)
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Área de cupons: o admin cria códigos (% ou R$ fixo, com valor mínimo);
// o cliente digita o código no checkout e o desconto caí no total.
export default function Coupons() {
  const confirm = useConfirmDialog()
  const { categories } = useStore()
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  useModalA11y(!!modal, () => setModal(null))
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    const code = modal.code.trim().toUpperCase().replace(/\s+/g, '-')
    if (!code) { setMsg({ type: 'err', text: 'Digite o código do cupom.' }); return }
    if (!(Number(modal.value) > 0)) { setMsg({ type: 'err', text: 'Valor do desconto precisa ser maior que zero.' }); return }
    if (modal.kind === 'percent' && Number(modal.value) > 95) {
      setMsg({ type: 'err', text: 'Percentual máximo: 95%.' }); return
    }
    // cupom novo pede confirmação (o código entra no ar para os clientes)
    if (!modal.id) {
      const ok = await confirm.ask({
        title: 'Criar o cupom ' + code + '?',
        message: 'Com ele ativo, qualquer cliente pode usar no checkout.',
        confirmLabel: 'Criar cupom',
      })
      if (!ok) return
    }
    setBusy(true); setMsg(null)
    const payload = {
      code,
      kind: modal.kind,
      value: Number(modal.value),
      min_total: Math.max(0, Number(modal.min_total) || 0),
      active: modal.active,
      // regras avançadas (migration-31): vazio = sem restrição
      valid_from: modal.valid_from ? new Date(modal.valid_from).toISOString() : null,
      valid_until: modal.valid_until ? new Date(modal.valid_until).toISOString() : null,
      first_purchase_only: Boolean(modal.first_purchase_only),
      category_id: modal.category_id || null,
    }
    const res = modal.id
      ? await supabase.from('coupons').update(payload).eq('id', modal.id)
      : await supabase.from('coupons').insert(payload)
    if (res.error) setMsg({ type: 'err', text: 'Erro ao salvar: ' + res.error.message })
    else { setModal(null); await load() }
    setBusy(false)
  }

  // guarda contra dois cliques rápidos invertendo a ordem dos updates
  const inFlight = useRef(false)

  async function toggleActive(c) {
    if (inFlight.current) return
    // desativar muda o jogo na loja: cliente para de conseguir usá-lo
    if (c.active) {
      const ok = await confirm.ask({
        title: 'Desativar o cupom ' + c.code + '?',
        message: 'Deixa de valer no checkout (dá para reativar depois).',
        confirmLabel: 'Desativar cupom',
      })
      if (!ok) return
    }
    inFlight.current = true
    setMsg(null)
    const { error } = await supabase.from('coupons').update({ active: !c.active }).eq('id', c.id)
    if (error) setMsg({ type: 'err', text: 'Não foi possível alterar o cupom: ' + error.message })
    else await load()
    inFlight.current = false
  }

  async function handleDelete(id) {
    const c = (rows ?? []).find((r) => r.id === id)
    const ok = await confirm.ask({
      title: 'Excluir o cupom ' + (c?.code ?? '') + '?',
      message: 'Sai da lista e para de valer no checkout. Não tem como desfazer.',
      confirmLabel: 'Excluir cupom',
      danger: true,
    })
    if (!ok) return
    if (inFlight.current) return
    inFlight.current = true
    setMsg(null)
    const { error } = await supabase.from('coupons').delete().eq('id', id)
    if (error) setMsg({ type: 'err', text: 'Não foi possível excluir: ' + error.message })
    else await load()
    inFlight.current = false
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cupons de desconto</h1>
          <p className="text-sm text-gray-500">Códigos que o cliente digita no checkout (percentual ou valor fixo).</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Novo cupom
        </button>
      </div>

      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</p>}

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <TicketPercent className="h-8 w-8 text-gray-300" />
          <p className="font-medium">Nenhum cupom criado ainda</p>
          <p className="text-sm">Crie um cupom tipo <b>VEM10</b> (10% off) ou <b>FRETE20</b> (R$ 20 de desconto).</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Desconto</th>
                <th className="px-4 py-3">Mínimo</th>
                <th className="px-4 py-3">Regras</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{c.code}</td>
                  <td className="px-4 py-3 font-semibold text-primary">
                    {c.kind === 'percent' ? Number(c.value) + '%' : formatBRL(c.value)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {Number(c.min_total) > 0 ? 'mín. ' + formatBRL(c.min_total) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-40 flex-wrap gap-1">
                      {c.first_purchase_only && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">1ª compra</span>
                      )}
                      {c.category_id && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">categoria</span>
                      )}
                      {c.valid_until && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">até {formatDate(c.valid_until)}</span>
                      )}
                      {!c.first_purchase_only && !c.category_id && !c.valid_from && !c.valid_until && (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={'flex items-center gap-1 text-xs font-bold ' + (c.active ? 'text-green-600' : 'text-gray-400')}
                    >
                      {c.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      {c.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        onClick={() => setModal({ ...c,
  value: String(c.value),
  min_total: Number(c.min_total),
  valid_from: toLocalInput(c.valid_from),
  valid_until: toLocalInput(c.valid_until),
  first_purchase_only: Boolean(c.first_purchase_only),
  category_id: c.category_id ?? '',
})}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => handleDelete(c.id)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setModal(null)}>
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="mx-2 toast-in flex w-full max-w-md flex-col space-y-4 rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={modal?.id ? 'Editar cupom' : 'Novo cupom'}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{modal.id ? 'Editar cupom' : 'Novo cupom'}</h2>
              <button type="button" className="p-1 text-gray-400 hover:text-gray-600" onClick={() => setModal(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Código</label>
              <input
                className="input font-mono uppercase"
                required
                placeholder="VEM10"
                value={modal.code}
                onChange={(e) => setModal({ ...modal, code: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
              <div className="col-span-3 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-50 p-1 ring-1 ring-gray-100">
                  {[{ id: 'percent', l: '% off' }, { id: 'fixed', l: 'R$ fixo' }].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setModal({ ...modal, kind: o.id })}
                      className={'rounded-lg py-1.5 text-xs font-bold transition ' +
                        (modal.kind === o.id ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{modal.kind === 'percent' ? '% desconto' : 'R$ desconto'}</label>
                <input className="input" type="number" min="0.01" step="0.01" required value={modal.value}
                  onChange={(e) => setModal({ ...modal, value: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_compra_minima_r">Compra mínima (R$)</label>
                <input id="f_compra_minima_r" className="input" type="number" min="0" step="0.01" value={modal.min_total}
                  onChange={(e) => setModal({ ...modal, min_total: e.target.value })} placeholder="0" />
              </div>
            </div>

            {/* REGRAS AVANÇADAS (migration-31) */}
            <div className="space-y-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Regras (opcional)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label" htmlFor="f_valido_de">Válido a partir de</label>
                  <input id="f_valido_de" type="datetime-local" className="input" value={modal.valid_from} onChange={(e) => setModal({ ...modal, valid_from: e.target.value })} />
                </div>
                <div>
                  <label className="field-label" htmlFor="f_valido_ate">Válido até</label>
                  <input id="f_valido_ate" type="datetime-local" className="input" value={modal.valid_until} onChange={(e) => setModal({ ...modal, valid_until: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="f_categoria_do_cupom">Só para a categoria</label>
                <select id="f_categoria_do_cupom" className="input" value={modal.category_id} onChange={(e) => setModal({ ...modal, category_id: e.target.value })}>
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                  checked={Boolean(modal.first_purchase_only)}
                  onChange={(e) => setModal({ ...modal, first_purchase_only: e.target.checked })}
                />
                Vale só para a PRIMEIRA compra do cliente
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={modal.active}
                onChange={(e) => setModal({ ...modal, active: e.target.checked })}
              />
              Cupom ativo (visível para uso imediato)
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full bg-white py-2.5 text-sm font-bold text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {modal.id ? 'Salvar' : 'Criar cupom'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* confirmações em popup (criar/desativar/excluir cupom) */}
      {confirm.dialog}
    </div>
  )
}
