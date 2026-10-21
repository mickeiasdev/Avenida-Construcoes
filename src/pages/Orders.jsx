import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Bell, CheckCircle2, ImagePlus, Loader2, Package, QrCode, RotateCcw, Star, Truck, X } from 'lucide-react'
import { supabase, uploadImage } from '../lib/supabaseClient'
import { pushSupported, pushConfigured, pushEnabled, enableOrderPush, disableOrderPush } from '../lib/push'
import { useAuth } from '../context/AuthContext'
import { formatBRL, formatDateTime, onlyDigits, ORDER_CLS, ORDER_LABELS, ORDER_PIPELINE, ORDER_SHORT } from '../lib/utils'
import { PAYMENT_LABELS } from '../lib/storeOrder'
import { MpPixDisplay } from '../components/MpPixDisplay'
import { useCart } from '../context/CartContext'
import { useModalA11y } from '../lib/useModalA11y'
import { createPixOrder } from '../lib/payments'

// HISTÓRICO DE PEDIDOS com a etapa atual do processo de entrega
// (atualizada pelo admin em /admin/pedidos). Ao abrir, a loja "adota" os
// pedidos feitos como VISITANTE com o mesmo CPF/telefone do perfil —
// histórico completo — e cada pedido tem REFazer COMPRA (itens atuais).
export default function Orders() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState(null)
  // banner de confirmação quando chegamos de um checkout recém-finalizado
  const [success, setSuccess] = useState(!!location.state?.justOrdered)
  const [tab, setTab] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [mpModal, setMpModal] = useState(null) // { order, mpPix }
  const [mpLoading, setMpLoading] = useState(false)
  const [reviewOrder, setReviewOrder] = useState(null) // pedido em avaliação (migration-33)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const { getOrderPaymentStatus, checkMpOrderAgain, clearCart, showNotice } = useCart()
  useModalA11y(!!mpModal, () => setMpModal(null))
  useModalA11y(!!reviewOrder, () => setReviewOrder(null))

  // notificações push: estado real da assinatura (migration-35)
  useEffect(() => {
    if (!user) return
    pushEnabled().then(setPushOn).catch(() => setPushOn(false))
  }, [user])

  async function togglePush() {
    setPushBusy(true)
    try {
      if (pushOn) {
        await disableOrderPush()
        setPushOn(false)
      } else {
        await enableOrderPush(user.id)
        setPushOn(true)
      }
    } catch (e) {
      setActionError(e?.message ?? 'Não foi possível alterar as notificações.')
    } finally {
      setPushBusy(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      // 1) adota pedidos de VISITANTE com mesmo CPF/telefone (uma vez por
      //    sessão — idempotente no banco). Aí a leitura normal cobre tudo.
      try {
        if (profile?.cpf || profile?.phone) {
          await supabase.rpc('claim_guest_orders', {
            p_cpf: onlyDigits(profile?.cpf ?? ''),
            p_phone: onlyDigits(profile?.phone ?? ''),
          })
        }
      } catch { /* sem a migration-27: histórico segue só do login */ }
      // 2) histórico completo (adotados agora têm user_id = dono)
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setOrders(data ?? [])
    }
    load()
    const channel = supabase
      .channel('client-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user.id, profile?.cpf, profile?.phone])

  // status exatos de src/lib/utils.js (ORDER_PIPELINE/ORDER_LABELS):
  // shipping = 'Saiu para entrega' · delivered = 'Entregue'
  const STATUS_SHIPPING = 'shipping'
  const STATUS_DELIVERED = 'delivered'

  // ---------- REFazer COMPRA ----------
  // Recoloca no carrinho os itens do pedido com o preço/estoque ATUAIS:
  // produto excluído/inativo/sem estoque é avisado, não trava o resto.
  async function reorder(o) {
    setBusyId(o.id)
    setActionError(null)
    try {
      const itens = o.order_items ?? []
      const ids = [...new Set(itens.map((i) => i.product_id).filter(Boolean))]
      const { data: prods } = await supabase
        .from('products')
        .select('id, name, price, discount_percent, promo_price, promo_until, image_url, stock, active')
        .in('id', ids)
      const byId = new Map((prods ?? []).map((p) => [p.id, p]))
      let added = 0
      const missing = []
      for (const it of itens) {
        const p = it.product_id ? byId.get(it.product_id) : null
        const quantity = Number(it.quantity) || 1
        if (!p || !p.active || (p.stock != null && Number(p.stock) <= 0)) {
          missing.push(it.product_name)
          continue
        }
        const ok = addItem(p, quantity)
        if (ok !== false) added++
        else missing.push(p.name)
      }
      setBusyId(null)
      if (added > 0) {
        navigate('/carrinho')
        if (missing.length > 0) {
          // toast do layout: sobrevive à navegação (o alert nativo quebrava o padrão visual)
          showNotice(added + ' produto(s) do pedido voltaram para a sacola. Indisponível(is): ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : ''))
        }
      } else {
        showNotice('Nenhum item deste pedido está disponível na loja agora.')
      }
    } catch (e) {
      setBusyId(null)
      setActionError('Não foi possível refazer a compra: ' + (e?.message ?? 'erro'))
    }
  }

  // o cliente confirma a entrega caso a loja não atualize o pedido.
  // A RLS de orders limita a atualização ao próprio user_id; se a política
  // bloquear, o erro real aparece no aviso e o status volta ao anterior.

  async function openMpQr(o) {
    setMpLoading(true)
    setActionError(null)
    try {
      const data = await createPixOrder(o.id)
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
            Pedido registrado com sucesso! Acompanhe cada etapa abaixo.
            {orders?.some((o) => ['mercado_pago', 'pix'].includes(o.payment_method) && String(o.payment_status).toLowerCase() !== 'approved') &&
              ' Há um Pix aguardando pagamento — use o botão "Ver QR Pix".'}
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

      {/* NOTIFICAÇÕES PUSH (PWA — migration-35): "saiu para entrega" no celular */}
      {pushSupported() && pushConfigured() && orders.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-2 !p-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 text-sm font-medium text-gray-700">
              {pushOn
                ? 'Notificações ativas — avisamos quando o pedido sair para entrega. 🔔'
                : 'Quer avisar no celular quando o pedido sair para entrega?'}
            </p>
          </div>
          <button
            type="button"
            className={(pushOn ? 'btn-soft' : 'btn-primary') + ' btn-sm shrink-0'}
            onClick={togglePush}
            disabled={pushBusy}
          >
            {pushBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pushOn ? 'Desativar' : 'Ativar notificações'}
          </button>
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
                    {PAYMENT_LABELS[o.payment_method ?? 'pix'] ?? (o.payment_method || 'Pix')}
                  </div>
                  <span className="font-bold text-primary">{formatBRL(o.total)}</span>
                </div>

                {/* REFazer COMPRA: itens do pedido de volta na sacola */}
                <button
                  type='button'
                  className='btn-soft min-h-11 w-full sm:w-auto'
                  onClick={() => reorder(o)}
                  disabled={busyId === o.id}
                >
                  {busyId === o.id
                    ? <Loader2 className='h-4 w-4 animate-spin' />
                    : <RotateCcw className='h-4 w-4' />}
                  Refazer compra
                </button>

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

                {/* AVALIAR (migration-33): só pedido ENTREGUE — prova social com moderação */}
                {o.status === STATUS_DELIVERED && (
                  <button
                    type="button"
                    className="btn-soft min-h-11 w-full sm:w-auto"
                    onClick={() => setReviewOrder(o)}
                  >
                    <Star className="h-4 w-4" /> Avaliar compra
                  </button>
                )}
                {['mercado_pago', 'pix'].includes(o.payment_method) && String(o.payment_status).toLowerCase() !== 'approved' && o.status !== 'cancelled' && (
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

      {/* MODAL DE AVALIAÇÃO (migration-33) */}
      {reviewOrder && (
        <ReviewModal order={reviewOrder} onClose={() => setReviewOrder(null)} />
      )}

      {/* Modal Pix QR + Copia e Cola (Orders API) */}
      {mpModal && mpModal.mpPix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMpModal(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={'Pix do pedido ' + String(mpModal.order.id).slice(0, 8)}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Pix — pedido {String(mpModal.order.id).slice(0,8)}</h3>
              <button type="button" onClick={() => setMpModal(null)} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <MpPixDisplay
              mpPix={mpModal.mpPix}
              orderId={mpModal.order.id}
              total={mpModal.order.total}
              getOrderPaymentStatus={getOrderPaymentStatus}
              onRefresh={checkMpOrderAgain}
              compact
              onApproved={() => { clearCart(); setMpModal(null); setActionError(null) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// MODAL DE AVALIAÇÃO (migration-33): nota + comentário + foto opcional.
// A RLS só aceita review de pedido ENTREGUE do próprio cliente que
// contenha o produto — a interface só desenha o caminho válido.
function ReviewModal({ order, onClose }) {
  const { user } = useAuth()
  const items = (order.order_items ?? []).filter((it) => it.product_id)
  const [productId, setProductId] = useState(items[0]?.product_id ?? '')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      setPhotoUrl(await uploadImage(file, 'reviews'))
    } catch (e2) {
      setErr('Falha no upload: ' + e2.message)
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    if (!productId) { setErr('Escolha o produto que quer avaliar.'); return }
    setBusy(true)
    setErr(null)
    try {
      const { error } = await supabase.from('product_reviews').insert({
        product_id: productId,
        user_id: user.id,
        order_id: order.id,
        rating,
        comment: comment.trim() || null,
        photo_url: photoUrl || null,
      })
      if (error) throw error
      setDone(true)
    } catch (e) {
      setErr(e?.message ?? 'Não foi possível enviar a avaliação.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setDone(false)
    setRating(5)
    setComment('')
    setPhotoUrl('')
    setErr(null)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-7 shadow-2xl safe-bottom sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={'Avaliar pedido ' + String(order.id).slice(0, 8)}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">Avaliar sua compra</h3>
          <button type="button" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="font-bold text-gray-800">Obrigado pela avaliação! 🎉</p>
            <p className="text-sm text-gray-500">A loja revisa e publica na página do produto — ajuda outros clientes a decidirem.</p>
            <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
              {items.length > 1 && (
                <button type="button" className="btn-soft flex-1" onClick={reset}>Avaliar outro produto</button>
              )}
              <button type="button" className="btn-primary flex-1" onClick={onClose}>Concluir</button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="f_rev_produto" className="field-label">Produto</label>
              <select
                id="f_rev_produto"
                className="input"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {items.map((it) => (
                  <option key={it.product_id} value={it.product_id}>{it.product_name}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="field-label">Sua nota</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={n + ' estrela' + (n > 1 ? 's' : '')}
                    className="rounded-lg p-1 transition hover:scale-110"
                  >
                    <Star className={'h-7 w-7 ' + (n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="f_rev_comentario" className="field-label">Comentário (opcional)</label>
              <textarea
                id="f_rev_comentario"
                className="input min-h-20"
                placeholder="Ex.: chegou rapidinho e a qualidade é ótima"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <p className="field-label">Foto do produto na obra (opcional)</p>
              <div className="flex items-center gap-3">
                {photoUrl ? (
                  <span className="relative">
                    <img src={photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-gray-200" />
                    <button
                      type="button"
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                      onClick={() => setPhotoUrl('')}
                      aria-label="Remover foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {uploading ? 'Enviando...' : 'Adicionar foto'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                  </label>
                )}
              </div>
            </div>

            {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}

            <button type="button" className="btn-primary w-full" onClick={submit} disabled={busy || uploading}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar avaliação
            </button>
            <p className="text-[11px] leading-relaxed text-gray-400">
              Sua nota aparece na loja depois da moderação da loja. Nada além de nota, comentário e foto é compartilhado.
            </p>
          </>
        )}
      </div>
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
