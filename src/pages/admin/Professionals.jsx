import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCheck, UserX, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useConfirmDialog } from '../../components/ConfirmDialog'

// PROFISSIONAIS (migration-37): barbeiros, técnicos, profissionais do salão.
// Ativo = aparece no seletor do agendamento; o slot conta por profissional.
export default function Professionals() {
  const confirm = useConfirmDialog()
  const [rows, setRows] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('professionals')
      .select('*')
      .order('name')
    if (error) {
      setRows([])
      setMsg({ type: 'err', text: 'Profissionais indisponíveis — rode a migration-37 no Supabase.' })
      return
    }
    setRows(data ?? [])
  }

  async function add() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    const { error } = await supabase.from('professionals').insert({ name: n, active: true })
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else { setName(''); setMsg(null); await load() }
  }

  async function toggle(p) {
    setBusy(true)
    const { error } = await supabase.from('professionals')
      .update({ active: !p.active }).eq('id', p.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro: ' + error.message })
    else await load()
  }

  async function remove(p) {
    const ok = await confirm.ask({
      title: 'Excluir "' + p.name + '"?',
      message: 'Os agendamentos antigos dele continuam no histórico (sem o nome).',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('professionals').delete().eq('id', p.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Profissionais</h1>
        <p className="text-sm text-gray-500">Dois profissionais = dois horários livres no mesmo slot. Ativo = o cliente pode escolher no agendamento.</p>
      </div>

      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</p>}

      <div className="flex gap-2">
        <input
          className="input flex-1 sm:max-w-xs"
          placeholder="Nome do profissional"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          aria-label="Nome do novo profissional"
        />
        <button type="button" className="btn-primary" onClick={add} disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="card py-10 text-center text-sm text-gray-400">Nenhum profissional — o agendamento segue "qualquer profissional" para todo mundo.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      className={'flex items-center gap-1 text-xs font-bold ' + (p.active ? 'text-green-600' : 'text-gray-400')}
                    >
                      {p.active ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                      {p.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="p-2 text-gray-400 transition hover:text-red-500" onClick={() => remove(p)} aria-label={'Excluir ' + p.name}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm.dialog}
    </div>
  )
}
