import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatBRL, formatDate } from '../../lib/utils'

// Lista de clientes: contato, cidade, nº de pedidos (e quantos em
// aberto) e total gasto em pedidos ENTREGUES
export default function ClientsAdmin() {
  const [clients, setClients] = useState(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function load() {
      const [profilesRes, ordersRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }),
        supabase.from('orders').select('user_id, total, status, created_at'),
      ])

      const stats = {}
      ;(ordersRes.data ?? []).forEach((o) => {
        const s = stats[o.user_id] ?? { count: 0, open: 0, spent: 0, last: null }
        s.count += 1
        if (o.status === 'delivered') s.spent += Number(o.total)
        if (!['delivered', 'cancelled'].includes(o.status)) s.open += 1
        if (!s.last || o.created_at > s.last) s.last = o.created_at
        stats[o.user_id] = s
      })

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <p className="text-sm text-gray-500">{clients?.length ?? '...'} cadastrados na loja</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input className="input pl-10" placeholder="Buscar por nome ou telefone..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {!clients ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
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
                  <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {[c.city, c.state].filter(Boolean).join('/') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{c.count}</span>
                    {c.open > 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {c.open} em aberto
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{formatBRL(c.spent)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.last ? formatDate(c.last) : '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
