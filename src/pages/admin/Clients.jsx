import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Loader2, MessageCircle, Search, Users } from 'lucide-react'
import { downloadCsv } from '../../lib/csv'
import { supabase } from '../../lib/supabaseClient'
import { formatBRL, formatDate, onlyDigits } from '../../lib/utils'

// Lista de clientes: contato, cidade, nº de pedidos (e quantos em
// aberto) e total gasto em pedidos ENTREGUES
export default function ClientsAdmin() {
  const navigate = useNavigate()
  const [clients, setClients] = useState(null)
  const [filter, setFilter] = useState('')
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function load() {
      const [profilesRes, ordersRes, statsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }),
        supabase.from('orders').select('user_id, total, status, created_at').limit(1000),
        // agregação por cliente no banco (migration-14); se faltar, calcula aqui
        supabase.rpc('store_client_stats'),
      ])

      if (profilesRes.error) setLoadError(profilesRes.error.message)

      const stats = {}
      if (!statsRes.error && statsRes.data) {
        statsRes.data.forEach((s) => {
          stats[s.user_id] = {
            count: Number(s.orders_count ?? 0),
            open: Number(s.open_count ?? 0),
            spent: Number(s.spent ?? 0),
            last: s.last_order ?? null,
          }
        })
      } else {
        ;(ordersRes.data ?? []).forEach((o) => {
          const s = stats[o.user_id] ?? { count: 0, open: 0, spent: 0, last: null }
          s.count += 1
          if (o.status === 'delivered') s.spent += Number(o.total)
          if (!['delivered', 'cancelled'].includes(o.status)) s.open += 1
          if (!s.last || o.created_at > s.last) s.last = o.created_at
          stats[o.user_id] = s
        })
      }

      setClients((profilesRes.data ?? []).map((c) => ({
        ...c,
        ...(stats[c.id] ?? { count: 0, open: 0, spent: 0, last: null }),
      })))
    }
    load()
  }, [])

  const visible = useMemo(() => {
    const f = filter.toLowerCase()
    return (clients ?? []).filter((c) =>
      (c.full_name || '').toLowerCase().includes(f) || (c.phone || '').includes(f)
    )
  }, [clients, filter])

  function exportCsv() {
    downloadCsv('clientes.csv', (clients ?? []).map((c) => ({
      nome: c.full_name ?? '',
      telefone: c.phone ?? '',
      cidade: [c.city, c.state].filter(Boolean).join('/'),
      pedidos: c.count,
      em_aberto: c.open,
      total_gasto: c.spent,
      ultimo_pedido: c.last ? new Date(c.last).toLocaleDateString('pt-BR') : '',
      cadastrado_em: c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '',
    })))
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          Não foi possível carregar os clientes: {loadError}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <p className="text-sm text-gray-500">{clients?.length ?? '...'} cadastrados na loja</p>
      </div>

      {/* Busca + exportação na mesma linha (CSV secundário, mesma altura) */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input className="input pl-10" placeholder="Buscar por nome ou telefone..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <button type="button" className="btn-soft shrink-0" onClick={exportCsv} disabled={!clients || clients.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {!clients ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <Users className="h-8 w-8 text-gray-300" />
          <p>Nenhum cliente encontrado.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Pedidos</th>
                <th className="px-4 py-3">Total gasto (entregues)</th>
                <th className="px-4 py-3">Último pedido</th>
                <th className="px-4 py-3">Desde</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{c.full_name || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="align-middle">{c.phone || '—'}</span>
                    {c.phone && (
                      <button
                        type="button"
                        className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 align-middle text-green-600 ring-1 ring-green-200 transition hover:bg-green-100"
                        onClick={() => navigate('/admin/whatsapp?to=' + onlyDigits(c.phone))}
                        aria-label={'Conversar com ' + (c.full_name || 'cliente') + ' pelo WhatsApp'}
                        title="Abrir conversa no WhatsApp do painel"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {[c.city, c.state].filter(Boolean).join('/') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{c.count}</span>
                    {c.open > 0 && (
                      <span className="ml-2 rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {c.open} em aberto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{formatBRL(c.spent)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.last ? formatDate(c.last) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
