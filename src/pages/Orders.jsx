import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, Loader2, Package, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatBRL, formatDateTime, ORDER_CLS, ORDER_LABELS, ORDER_PIPELINE, ORDER_SHORT } from '../lib/utils'

// HISTÓRICO DE PEDIDOS com a etapa atual do processo de entrega
// (atualizada pelo admin em /admin/pedidos)
export default function Orders() {
  const { user } = useAuth()
  const location = useLocation()
  const [orders, setOrders] = useState(null)
  // banner de confirmação quando chegamos de um checkout recém-finalizado
  const [success, setSuccess] = useState(!!location.state?.justOrdered)
  const [tab, setTab] = useState('all')

  useEffect(() => {
    const load = () => {
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setOrders(data ?? []))
    }
    load()
    const channel = supabase
      .channel('client-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user.id])

  if (!orders) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  }

  const openCount = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length
  const visible = orders.filter((o) => {
    if (tab === 'all') return true
    if (tab === 'open') return !['delivered', 'cancelled'].includes(o.status)
    return o.status === tab
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Meus pedidos</h1>

      {success && (
        <div className="flex items-start gap-2.5 rounded-lg bg-green-50 p-3.5 text-sm text-green-700 ring-1 ring-green-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Pedido registrado com sucesso! Enviamos o resumo para o WhatsApp da loja — acompanhe cada etapa abaixo.
          </span>
          <button type="button" onClick={() => setSuccess(false)} aria-label="Fechar aviso" className="shrink-0 hover:text-green-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <OrderChip active={tab === 'all'} onClick={() => setTab('all')} label="Todos" count={orders.length} />
          <OrderChip active={tab === 'open'} onClick={() => setTab('open')} label="Em andamento" count={openCount} />
          <OrderChip active={tab === 'delivered'} onClick={() => setTab('delivered')} label="Entregues" count={orders.filter((o) => o.status === 'delivered').length} />
          <OrderChip active={tab === 'cancelled'} onClick={() => setTab('cancelled')} label="Cancelados" count={orders.filter((o) => o.status === 'cancelled').length} />
        </div>
      )}

      {orders.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <Package className="h-8 w-8 text-gray-300" />
          <p>Você ainda não fez nenhum pedido.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((o) => {
            const cancelled = o.status === 'cancelled'
            return (
              <div key={o.id} className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800">Pedido nº {o.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(o.created_at)}</p>
                  </div>
                  <span className={'rounded-full px-3 py-1 text-xs font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                    {ORDER_LABELS[o.status] ?? o.status}
                  </span>
                </div>

                {/* STEPPER: em que parte do processo está */}
                {!cancelled && <Stepper status={o.status} />}

                <div className="space-y-1 border-t border-gray-100 pt-2 text-sm text-gray-600">
                  {o.order_items.map((it) => (
                    <div key={it.id} className="flex justify-between gap-2">
                      <span>{it.quantity}× {it.product_name}</span>
                      <span className="text-gray-400">{formatBRL(it.quantity * it.unit_price)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <span className="text-xs text-gray-400">{o.delivery_address}</span>
                  <span className="font-bold text-primary">{formatBRL(o.total)}</span>
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

function OrderChip({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'shrink-0 rounded-full px-3.5 py-1.5 text-xs ring-1 transition ' +
        (active ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
    >
      {label} <span className={'ml-0.5 ' + (active ? 'text-white/80' : 'text-gray-400')}>({count})</span>
    </button>
  )
}
