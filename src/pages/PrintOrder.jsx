import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../context/StoreContext'
import { formatBRL, formatDateTime, formatCnpj, onlyDigits, ORDER_LABELS } from '../lib/utils'
import { PAYMENT_LABELS, DELIVERY_LABELS } from '../lib/storeOrder'
import { maskCpf } from '../lib/checkout'

// ============================================================
// IMPRESSÃO DE PEDIDO — abre em aba própria (window.print):
//   • Cupom (padrão): térmico 80mm, monospace, cupom NÃO fiscal
//   • Nota de venda: A4 com quadros loja/cliente, tabela e assinatura
// A aba imprime sozinha ao carregar; a barra superior (sumiu na
// impressão) deixa alternar o formato e reimprimir.
// Rota protegida: /imprimir/pedido/:id — só o admin imprime.
// ============================================================

function Dash() {
  return <div className="my-1 border-t border-dashed border-black" role="presentation" />
}

export default function PrintOrder() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { settings } = useStore()
  const modo = params.get('modo') === 'nota' ? 'nota' : 'cupom'

  const [order, setOrder] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const autoRef = useRef(false)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) setLoadError(error?.message ?? 'Pedido não encontrado')
      else setOrder(data)
    })()
  }, [id])

  // título da aba = nome do arquivo ao salvar em PDF
  useEffect(() => {
    if (order) {
      document.title = (modo === 'cupom' ? 'Cupom' : 'Nota de venda') + ' nº ' + String(order.id).slice(0, 8)
    }
  }, [order, modo])

  // imprime sozinho quando o pedido chega (uma vez)
  useEffect(() => {
    if (!order || autoRef.current) return
    autoRef.current = true
    const t = setTimeout(() => { try { window.print() } catch { /* usuário imprime pelo botão */ } }, 800)
    return () => clearTimeout(t)
  }, [order])

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-200 p-4 print:bg-white">
        <div className="card max-w-sm text-center">
          <p className="font-bold text-gray-800">Não foi possível abrir a impressão</p>
          <p className="mt-1 text-sm text-gray-500">{loadError}</p>
          <button type="button" className="btn-primary mt-3" onClick={() => navigate('/admin/pedidos')}>
            <ArrowLeft className="h-4 w-4" /> Voltar aos pedidos
          </button>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-200 print:hidden">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    )
  }

  const short = String(order.id).slice(0, 8).toUpperCase()
  const items = order.order_items ?? []
  const subtotal = items.reduce((acc, it) => acc + Number(it.unit_price) * Number(it.quantity), 0)
  const total = Number(order.total ?? 0)
  const discount = Number(order.discount ?? 0)
  const cpf = onlyDigits(order.customer_cpf)
  const cnpj = formatCnpj(settings.cnpj)
  const isRetirada = order.delivery_method === 'retirada'
  const entregaLabel = DELIVERY_LABELS[order.delivery_method] ?? order.delivery_method

  return (
    <div className="min-h-screen bg-gray-200 pb-8 print:bg-white print:pb-0">
      {/* ============ barra de controle (não sai no papel) ============ */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-3 py-3 print:hidden">
        <button type="button" className="btn-soft" onClick={() => navigate('/admin/pedidos')}>
          <ArrowLeft className="h-4 w-4" /> Pedidos
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setParams({ modo: 'cupom' }, { replace: true })}
            className={'rounded-full px-3.5 py-1.5 text-xs font-bold transition ' +
              (modo === 'cupom' ? 'bg-secondary text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200')}
          >
            Cupom 80mm
          </button>
          <button
            type="button"
            onClick={() => setParams({ modo: 'nota' }, { replace: true })}
            className={'rounded-full px-3.5 py-1.5 text-xs font-bold transition ' +
              (modo === 'nota' ? 'bg-secondary text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200')}
          >
            Nota A4
          </button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* ============ CUPOM TÉRMICO 80mm ============ */}
      {modo === 'cupom' && (
        <div className="mx-auto w-[80mm] max-w-full bg-white p-3 font-mono text-[11px] leading-snug text-black shadow-lg print:w-[80mm] print:shadow-none">
          <div className="text-center">
            <p className="text-[13px] font-bold uppercase">{settings.store_name}</p>
            {settings.address && <p className="mt-0.5">{settings.address}</p>}
            <p className="mt-0.5">
              {[
                settings.whatsapp ? 'Tel: ' + settings.whatsapp : null,
                cnpj !== '—' ? 'CNPJ: ' + cnpj : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Dash />
          <p className="text-center font-bold">CUPOM NÃO FISCAL</p>
          <Dash />
          <p>Pedido: {short}</p>
          <p>Data: {formatDateTime(order.created_at)}</p>
          {order.customer_name && <p>Cliente: {order.customer_name}</p>}
          {cpf && <p>CPF: {maskCpf(cpf)}</p>}
          {order.customer_phone && <p>Tel: {order.customer_phone}</p>}
          <p>{isRetirada ? 'RETIRADA NO BALCÃO' : 'ENTREGA'}</p>
          {!isRetirada && order.delivery_address && <p>{order.delivery_address}</p>}
          <Dash />
          {items.map((it) => (
            <div key={it.id} className="flex justify-between gap-2">
              <span className="min-w-0 break-words">
                {it.quantity}x {it.product_name}
                {it.fulfillment === 'retirada' ? ' [retirada]' : ''}
              </span>
              <span className="shrink-0">
                {formatBRL(Number(it.unit_price) * Number(it.quantity))}
              </span>
            </div>
          ))}
          <Dash />
          <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between"><span>Desconto</span><span>-{formatBRL(discount)}</span></div>
          )}
          <div className="flex justify-between text-[13px] font-bold"><span>TOTAL</span><span>{formatBRL(total)}</span></div>
          <div className="flex justify-between"><span>Pagamento</span><span>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</span></div>
          <Dash />
          <p className="text-center">* NÃO É DOCUMENTO FISCAL *</p>
          <p className="text-center">Obrigado pela preferência!</p>
          <p className="mt-1 break-all text-center text-[9px]">{order.id}</p>
        </div>
      )}

      {/* ============ NOTA DE VENDA A4 ============ */}
      {modo === 'nota' && (
        <div className="mx-auto w-[210mm] max-w-full bg-white p-10 text-[12px] text-black shadow-lg print:shadow-none">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-lg font-bold uppercase">{settings.store_name}</p>
              {settings.address && <p className="mt-0.5">{settings.address}</p>}
              <p className="mt-0.5">
                {[
                  settings.whatsapp ? 'Tel: ' + settings.whatsapp : null,
                  cnpj !== '—' ? 'CNPJ: ' + cnpj : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold">NOTA DE VENDA</p>
              <p className="mt-0.5">Nº {short}</p>
              <p className="mt-0.5">{formatDateTime(order.created_at)}</p>
            </div>
          </div>
          <div className="mt-3 border-t-2 border-black" role="presentation" />

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="border border-black p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide">Cliente</p>
              <p className="font-semibold">{order.customer_name || '—'}</p>
              {cpf && <p>CPF: {maskCpf(cpf)}</p>}
              {order.customer_phone && <p>Tel: {order.customer_phone}</p>}
              <p>{isRetirada ? 'Retirada no balcão' : (order.delivery_address || 'Entrega')}</p>
            </div>
            <div className="border border-black p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide">Recebimento</p>
              <p>{entregaLabel}</p>
              <p>Pagamento: {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
              <p>Status: {ORDER_LABELS[order.status] ?? order.status}</p>
              {order.coupon_code && <p>Cupom: {order.coupon_code}</p>}
            </div>
          </div>

          <table className="mt-4 w-full border border-black text-[12px]">
            <thead>
              <tr className="border border-black bg-gray-100 text-left print:bg-white">
                <th className="border border-black px-2 py-1.5 w-8">#</th>
                <th className="border border-black px-2 py-1.5">Descrição</th>
                <th className="border border-black px-2 py-1.5 text-right">Qtd</th>
                <th className="border border-black px-2 py-1.5 text-right">Valor un.</th>
                <th className="border border-black px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-black px-2 py-1.5">{i + 1}</td>
                  <td className="border border-black px-2 py-1.5">
                    {it.product_name}
                    {it.fulfillment === 'retirada' ? ' (retirada)' : ''}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right">{it.quantity}</td>
                  <td className="border border-black px-2 py-1.5 text-right">{formatBRL(Number(it.unit_price))}</td>
                  <td className="border border-black px-2 py-1.5 text-right">
                    {formatBRL(Number(it.unit_price) * Number(it.quantity))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex justify-end">
            <div className="w-64 text-[12px]">
              <div className="flex justify-between py-0.5"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between py-0.5"><span>Desconto</span><span>-{formatBRL(discount)}</span></div>
              )}
              <div className="mt-1 flex justify-between border-t border-black pt-1 text-[14px] font-bold">
                <span>TOTAL</span><span>{formatBRL(total)}</span>
              </div>
            </div>
          </div>

          <div className="mt-14 w-64 border-t border-black pt-1 text-center text-[11px]">
            Assinatura do cliente
          </div>

          <p className="mt-6 text-[10px] leading-snug text-gray-700">
            Documento sem valor fiscal — serve como comprovante de venda e controle interno.
            Para nota fiscal eletrônica (NF-e/NFS-e), solicite ao atendimento da loja.
          </p>
          <p className="mt-1 text-[9px] break-all text-gray-500">{order.id}</p>
        </div>
      )}
    </div>
  )
}
