import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Copy, Loader2, Package, QrCode, Truck, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatBRL, formatDateTime, ORDER_CLS, ORDER_LABELS, ORDER_PIPELINE, ORDER_SHORT } from '../lib/utils'
import { MpPixDisplay } from '../components/MpPixDisplay'
import { useCart } from '../context/CartContext'

// HISTÓRICO DE PEDIDOS com a etapa atual do processo de entrega
// (atualizada pelo admin em /admin/pedidos)
export default function Orders() {
  const { user } = useAuth()
  const location = useLocation()
  const [orders, setOrders] = useState(null)
  // banner de confirmação quando chegamos de um checkout recém-finalizado
  const [success, setSuccess] = useState(!!location.state?.justOrdered)
  const [tab, setTab] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [mpModal, setMpModal] = useState(null) // { order, mpPix }
  const [mpLoading, setMpLoading] = useState(false)
  const { getOrderPaymentStatus } = useCart()

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

  // status exatos de src/lib/utils.js (ORDER_PIPELINE/ORDER_LABELS):
  // shipping = 'Saiu para entrega' · delivered = 'Entregue'
  const STATUS_SHIPPING = 'shipping'
  const STATUS_DELIVERED = 'delivered'

  // o cliente confirma a entrega caso a loja não atualize o pedido.
  // A RLS de orders limita a atualização ao próprio user_id; se a política
  // bloquear, o erro real aparece no aviso e o status volta ao anterior.

  async function openMpQr(o) {
    setMpLoading(true)
    setActionError(null)
    try {
      const { data, error } = await supabase.functions.invoke('create-mp-order', { body: { orderId: o.id } })
      if (error) throw error
      if (!data?.qr_code) throw new Error('QR Code não disponível para este pedido.')
      setMpModal({ order: o, mpPix: { qr_code: data.qr_code, qr_code_base64: data.qr_code_base64, ticket_url: data.ticket_url, status: data.status ?? 'pending' } })
    } catch (e) {
      setActionError(e.message ?? String(e))
    } finally { setMpLoading(false) }
  }

  async function confirmDelivery(o) {
    setActionError(null)
    setBusyId(o.id)
    const previous = orders
    setOrders((list) => (list ?? []).map((x) => (x.id === o.id ? { ...x, status: STATUS_DELIVERED } : x)))
    // .select('id') devolve a linha atualizada; se a RLS não tiver policy de
    // UPDATE para o cliente, o Supabase retorna 0 linhas SEM erro — por isso
    // checamos data, não só error.
    const { data, error } = await supabase
      .from('orders')
      .update({ status: STATUS_DELIVERED })
      .eq('id', o.id)
      .select('id')
    setBusyId(null)
    if (error) {
      setOrders(previous)
      setActionError('Não foi possível confirmar a entrega: ' + error.message)
    } else if (!data || data.length === 0) {
      setOrders(previous)
      setActionError('Não foi possível confirmar a entrega por aqui. Peça para a loja marcar o pedido como entregue.')
    }
  }

  if (!orders) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
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

      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3.5 text-sm text-red-600 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Fechar aviso" className="shrink-0 hover:text-red-800">
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
                    <p className="text-xs text-gray-500">{formatDateTime(o.created_at)}</p>
                  </div>
                  <span className={'rounded-lg px-3 py-1 text-xs font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                    {ORDER_LABELS[o.status] ?? o.status}
                  </span>
                </div>

                {/* STEPPER: em que parte do processo está */}
                {!cancelled && <Stepper status={o.status} />}

                <div className="space-y-1 border-t border-gray-100 pt-2 text-sm text-gray-600">
                  {o.order_items.map((it) => (
                    <div key={it.id} className="flex justify-between gap-2">
                      <span className="min-w-0 flex-1"><TextoExpansivel texto={it.quantity + '× ' + it.product_name} /></span>
                      <span className="shrink-0 text-gray-500">{formatBRL(it.quantity * it.unit_price)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <div className="text-xs text-gray-500">
                      <TextoExpansivel
                        className="font-medium break-words"
                        texto={o.delivery_method === 'retirada' ? 'Retirada no balcão' : o.delivery_address || ''}
                      />
                    {' · Pagamento: '}
                    {(o.payment_method ?? 'pix') === 'pix' ? 'Pix' : o.payment_method === 'dinheiro' ? 'Dinheiro' : 'Cartão'}
                  </div>
                  <span className="font-bold text-primary">{formatBRL(o.total)}</span>
                </div>

                {/* o cliente confirma a entrega se a loja não marcar como entregue */}
                {o.status === STATUS_SHIPPING && (
                  <button
                    type="button"
                    className="btn-primary min-h-11 w-full sm:w-auto"
                    onClick={() => confirmDelivery(o)}
                    disabled={busyId === o.id}
                  >
                    {busyId === o.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Truck className="h-4 w-4" />}
                    Confirmar entrega
                  </button>
                )}
                {o.payment_method === 'mercado_pago' && String(o.payment_status).toLowerCase() !== 'approved' && o.status !== 'cancelled' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/30 hover:bg-primary/5"
                    onClick={() => openMpQr(o)}
                    disabled={mpLoading}
                  >
                    {mpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                    Ver QR Pix (Copia e Cola)
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Modal Pix QR + Copia e Cola (Orders API) */}
      {mpModal && mpModal.mpPix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMpModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Pix — pedido {String(mpModal.order.id).slice(0,8)}</h3>
              <button type="button" onClick={() => setMpModal(null)} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <MpPixDisplay mpPix={mpModal.mpPix} orderId={mpModal.order.id} total={mpModal.order.total} getOrderPaymentStatus={getOrderPaymentStatus} onApproved={() => { setMpModal(null); setActionError(null) }} />
          </div>
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
          <span className={'text-center text-[11px] leading-tight ' + (i <= idx ? 'font-semibold text-primary' : 'text-gray-500')}>
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
      className={'shrink-0 rounded-lg px-3.5 py-1.5 text-xs ring-1 transition ' +
        (active ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
    >
      {label} <span className={'ml-0.5 ' + (active ? 'text-white/80' : 'text-gray-500')}>({count})</span>
    </button>
  )
}

// No mobile nomes/itens/endereços longos não podem estourar a largura: mostra 2
// linhas e um 'Mostrar detalhes' que abre o restante empilhado.
function TextoExpansivel({ texto, className = '' }) {
  const [aberto, setAberto] = useState(false)
  const t = String(texto ?? '').trim() || '—'
  const longo = t.length > 38
  return (
    <span className={'block min-w-0 ' + className}>
      <span className={'break-words ' + (longo && !aberto ? 'line-clamp-2' : '')}>{t}</span>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          className="mt-0.5 block text-[11px] font-semibold text-primary hover:underline"
        >
          {aberto ? 'Mostrar menos' : 'Mostrar detalhes'}
        </button>
      )}
    </span>
  )
}
