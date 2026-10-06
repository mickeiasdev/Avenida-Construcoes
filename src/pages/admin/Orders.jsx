import { useCallback, useEffect, useState } from 'react'
import { Ban, ChevronRight, ClipboardList, Loader2, MapPin, Phone, User } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatBRL, formatDateTime, ORDER_CLS, ORDER_LABELS, ORDER_NEXT_ACTION, ORDER_PIPELINE, ORDER_SHORT } from '../../lib/utils'

const TABS = [
  { k: 'all', l: 'Todos' },
  { k: 'pending', l: 'Aguardando' },
  { k: 'confirmed', l: 'Confirmados' },
  { k: 'preparing', l: 'Separando' },
  { k: 'shipping', l: 'Em rota' },
  { k: 'delivered', l: 'Entregues' },
  { k: 'cancelled', l: 'Cancelados' },
]

// Lista de pedidos com as ETAPAS DE ENTREGA que o admin avança;
// o cliente acompanha tudo em /pedidos (Realtime em ambos os lados)
export default function OrdersAdmin() {
  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('admin-orders-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function advance(o) {
    const idx = ORDER_PIPELINE.indexOf(o.status)
    const next = ORDER_PIPELINE[Math.min(idx + 1, ORDER_PIPELINE.length - 1)]
    setBusyId(o.id)
    await supabase.from('orders').update({ status: next }).eq('id', o.id)
    setBusyId(null)
  }

  async function cancelOrder(o) {
    if (!window.confirm('Cancelar o pedido nº ' + o.id.slice(0, 8) + '?')) return
    setBusyId(o.id)
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', o.id)
    setBusyId(null)
  }

  const visible = (orders ?? []).filter((o) => tab === 'all' || o.status === tab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pedidos</h1>
        <p className="text-sm text-gray-500">
          Avance as etapas conforme o processo de entrega — o cliente vê cada mudança em tempo real.
        </p>
      </div>

      {/* Filtros por etapa */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map(({ k, l }) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={'shrink-0 rounded-full px-3.5 py-1.5 text-xs ring-1 transition ' +
              (tab === k ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
          >
            {l}
          </button>
        ))}
      </div>

      {!orders ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <ClipboardList className="h-8 w-8 text-gray-300" />
          <p>Nenhum pedido nesta etapa.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((o) => {
            const cancelled = o.status === 'cancelled'
            const done = o.status === 'delivered'
            const activeStep = !cancelled && !done
            return (
              <div key={o.id} className="card space-y-4">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800">Pedido nº {o.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(o.created_at)}</p>
                  </div>
                  <span className={'rounded-full px-3 py-1 text-xs font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                    {ORDER_LABELS[o.status] ?? o.status}
                  </span>
                </div>

                {/* Steper do processo */}
                {!cancelled && <Stepper status={o.status} />}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Cliente */}
                  <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-gray-800">
                      <User className="h-4 w-4 text-gray-400" /> {o.customer_name || 'Cliente'}
                    </p>
                    <p className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4 text-gray-400" /> {o.customer_phone || '—'}
                    </p>
                    <p className="flex items-start gap-2 text-gray-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> {o.delivery_address || '—'}
                    </p>
                  </div>

                  {/* Itens + total */}
                  <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
                    {o.order_items.map((it) => (
                      <div key={it.id} className="flex justify-between gap-2 text-gray-600">
                        <span>{it.quantity}× {it.product_name}</span>
                        <span className="text-gray-400">{formatBRL(it.quantity * it.unit_price)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-800">
                      <span>Total</span>
                      <span className="text-primary">{formatBRL(o.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Ações do processo */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  {done ? (
                    <span className="text-sm font-medium text-green-600">✓ Entrega concluída</span>
                  ) : cancelled ? (
                    <span className="text-sm font-medium text-red-500">Pedido cancelado</span>
                  ) : (
                    <>
                      <button type="button" className="btn-primary" disabled={busyId === o.id} onClick={() => advance(o)}>
                        {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        {ORDER_NEXT_ACTION[o.status]}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-500 ring-1 ring-red-200 transition hover:bg-red-50"
                        disabled={busyId === o.id}
                        onClick={() => cancelOrder(o)}
                      >
                        <Ban className="h-4 w-4" /> Cancelar pedido
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stepper({ status }) {
  const idx = ORDER_PIPELINE.indexOf(status)
  return (
    <div className="flex items-start gap-1 rounded-lg bg-gray-50 px-2 py-2.5">
      {ORDER_PIPELINE.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div className={'h-0.5 flex-1 rounded ' + (i === 0 ? 'bg-transparent' : i <= idx ? 'bg-primary' : 'bg-gray-200')} />
            <div className={'h-2.5 w-2.5 shrink-0 rounded-full ' + (i <= idx ? 'bg-primary' : 'bg-gray-300')} />
            <div className={'h-0.5 flex-1 rounded ' + (i === ORDER_PIPELINE.length - 1 ? 'bg-transparent' : i < idx ? 'bg-primary' : 'bg-gray-200')} />
          </div>
          <span className={'text-center text-[9px] leading-tight sm:text-[10px] ' + (i <= idx ? 'font-semibold text-primary' : 'text-gray-400')}>
            {ORDER_SHORT[s]}
          </span>
        </div>
      ))}
    </div>
  )
}
