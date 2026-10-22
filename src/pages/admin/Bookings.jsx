import { useEffect, useState } from 'react'
import { CalendarDays, Loader2, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatBRL, ORDER_CLS, ORDER_LABELS } from '../../lib/utils'

// AGENDAMENTOS (migration-36): serviços marcados e retiradas com hora.
export default function Bookings() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, customer_name, customer_phone, scheduled_at, order_items(product_name, quantity)')
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true })
        .limit(200)
      if (error) {
        setRows([])
        setMsg({ type: 'err', text: 'Agendamentos indisponíveis — rode a migration-36 no Supabase.' })
        return
      }
      setRows(data ?? [])
    }
    load()
    const channel = supabase
      .channel('admin-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const now = Date.now()
  const upcoming = (rows ?? []).filter((o) => new Date(o.scheduled_at).getTime() >= now)
  const past = (rows ?? []).filter((o) => new Date(o.scheduled_at).getTime() < now)

  function Card({ o }) {
    const d = new Date(o.scheduled_at)
    return (
      <div className="card list-row flex-col items-start gap-2 !p-4 sm:flex-row sm:items-center">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-1 sm:w-auto">
          <p className="flex items-center gap-1.5 font-bold text-gray-800">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            {d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="truncate text-sm text-gray-600">
            {o.customer_name ?? 'Cliente'} · {(o.order_items ?? []).map((it) => it.quantity + '× ' + it.product_name).join(', ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {o.customer_phone && (
            <a href={'https://wa.me/55' + o.customer_phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" className="btn-soft btn-sm">
              <Phone className="h-3.5 w-3.5" /> {o.customer_phone}
            </a>
          )}
          <span className={'rounded-lg px-2.5 py-0.5 text-[11px] font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
            {ORDER_LABELS[o.status] ?? o.status}
          </span>
          <span className="font-bold text-primary">{formatBRL(o.total)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Agendamentos</h1>
        <p className="text-sm text-gray-500">Serviços marcados e retiradas com hora — a agenda da loja (tempo real).</p>
      </div>

      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</p>}

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Próximos <span className="badge-count">{upcoming.length}</span></h2>
            {upcoming.length === 0 ? (
              <p className="card py-8 text-center text-sm text-gray-400">Nenhum horário marcado — serviços e retiradas agendadas aparecem aqui.</p>
            ) : upcoming.map((o) => <Card key={o.id} o={o} />)}
          </section>
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-800">Passados</h2>
              {past.slice(0, 10).map((o) => <Card key={o.id} o={o} />)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
