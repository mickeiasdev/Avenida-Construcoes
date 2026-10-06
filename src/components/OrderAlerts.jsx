import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, ClipboardList, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatBRL } from '../lib/utils'

// Se o ADMIN estiver logado, qualquer pedido novo (INSERT em orders)
// dispara um popup na hora — via Supabase Realtime.
export function OrderAlerts() {
  const { isAdmin } = useAuth()
  const [alerts, setAlerts] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel('admin-order-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const o = payload.new
        setAlerts((prev) => [
          ...prev,
          { key: o.id + '-' + Date.now(), id: o.id, name: o.customer_name, total: o.total },
        ])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAdmin])

  if (!isAdmin || alerts.length === 0) return null

  function dismiss(key) {
    setAlerts((prev) => prev.filter((a) => a.key !== key))
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-72 flex-col gap-2">
      {alerts.slice(-3).map((a) => (
        <div key={a.key} className="toast-in pointer-events-auto rounded-xl bg-white p-4 shadow-2xl ring-1 ring-gray-100">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BellRing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-800">Novo pedido recebido!</p>
              <p className="truncate text-sm text-gray-500">{a.name || 'Cliente'}</p>
              <p className="text-sm font-semibold text-primary">{formatBRL(a.total)}</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              onClick={() => dismiss(a.key)}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="btn-primary mt-3 w-full px-3 py-1.5 text-sm"
            onClick={() => { dismiss(a.key); navigate('/admin/pedidos') }}
          >
            <ClipboardList className="h-4 w-4" /> Ver pedidos
          </button>
        </div>
      ))}
    </div>
  )
}
