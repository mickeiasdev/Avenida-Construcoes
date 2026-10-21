import { useState } from 'react'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { downloadCsv } from '../../lib/csv'

// Relatórios em CSV (Excel BR: ';' + BOM). Três cortes do MESMO período:
// pedidos, por produto e por cliente. O lojista leva para o contador
// e para a negociação com fornecedor.
export default function Reports() {
  const hoje = new Date()
  const inicio = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000)
  const [from, setFrom] = useState(inicio.toISOString().slice(0, 10))
  const [to, setTo] = useState(hoje.toISOString().slice(0, 10))
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  async function loadRange() {
    const fromDate = from + 'T00:00:00'
    const toDate = to + 'T23:59:59'
    const [{ data: orders, error }, { data: items }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, created_at, status, payment_method, delivery_method, customer_name, customer_phone, customer_cpf, total, discount, coupon_code, origin')
        .gte('created_at', fromDate)
        .lte('created_at', toDate)
        .order('created_at')
        .limit(5000),
      supabase
        .from('order_items')
        .select('product_name, quantity, unit_price, orders!inner(id, created_at)')
        .gte('orders.created_at', fromDate)
        .lte('orders.created_at', toDate)
        .limit(20000),
    ])
    if (error) throw error
    return { orders: orders ?? [], items: items ?? [] }
  }

  async function exportOrders() {
    setBusy('orders'); setMsg(null)
    try {
      const { orders } = await loadRange()
      if (orders.length === 0) { setMsg({ type: 'err', text: 'Nenhum pedido no período escolhido.' }); return }
      downloadCsv('pedidos-' + from + '_a_' + to + '.csv', orders.map((o) => ({
        pedido: String(o.id).slice(0, 8),
        data: new Date(o.created_at).toLocaleString('pt-BR'),
        cliente: o.customer_name ?? '',
        telefone: o.customer_phone ?? '',
        cpf: o.customer_cpf ?? '',
        status: o.status,
        pagamento: o.payment_method,
        recebimento: o.delivery_method,
        cupom: o.coupon_code ?? '',
        desconto: Number(o.discount ?? 0).toFixed(2).replace('.', ','),
        total: Number(o.total ?? 0).toFixed(2).replace('.', ','),
        origem: o.origin,
      })))
    } catch (e) {
      setMsg({ type: 'err', text: 'Erro ao exportar: ' + (e?.message ?? e) })
    } finally { setBusy(null) }
  }

  async function exportByProduct() {
    setBusy('product'); setMsg(null)
    try {
      const { items } = await loadRange()
      if (items.length === 0) { setMsg({ type: 'err', text: 'Nenhum item vendido no período.' }); return }
      const map = new Map()
      for (const it of items) {
        const s = map.get(it.product_name) ?? { produto: it.product_name, quantidade: 0, faturamento: 0 }
        s.quantidade += Number(it.quantity) || 0
        s.faturamento += Number(it.unit_price) * Number(it.quantity)
        map.set(it.product_name, s)
      }
      const rows = [...map.values()].sort((a, b) => b.faturamento - a.faturamento)
        .map((s) => ({ ...s, faturamento: s.faturamento.toFixed(2).replace('.', ',') }))
      downloadCsv('por-produto-' + from + '_a_' + to + '.csv', rows)
    } catch (e) {
      setMsg({ type: 'err', text: 'Erro ao exportar: ' + (e?.message ?? e) })
    } finally { setBusy(null) }
  }

  async function exportByClient() {
    setBusy('client'); setMsg(null)
    try {
      const { orders } = await loadRange()
      if (orders.length === 0) { setMsg({ type: 'err', text: 'Nenhum pedido no período escolhido.' }); return }
      const map = new Map()
      for (const o of orders ?? []) {
        const key = (o.customer_cpf || o.customer_phone || o.customer_name || '?').toString()
        const s = map.get(key) ?? { cliente: o.customer_name ?? '?', telefone: o.customer_phone ?? '', pedidos: 0, total: 0 }
        s.pedidos += 1
        s.total += Number(o.total ?? 0)
        map.set(key, s)
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total)
        .map((s) => ({ ...s, ticket_medio: (s.total / s.pedidos).toFixed(2).replace('.', ','), total: s.total.toFixed(2).replace('.', ',') }))
      downloadCsv('por-cliente-' + from + '_a_' + to + '.csv', rows)
    } catch (e) {
      setMsg({ type: 'err', text: 'Erro ao exportar: ' + (e?.message ?? e) })
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Relatórios (CSV)</h1>
        <p className="text-sm text-gray-500">Exportações em CSV com acentos corretos para o Excel — pronto para o contador e para negociar com fornecedor.</p>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' + (msg.type === 'err'
          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
          : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
          {msg.text}
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label" htmlFor="f_rel_de">Período — de</label>
            <input id="f_rel_de" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="f_rel_ate">até</label>
            <input id="f_rel_ate" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className="btn-primary" onClick={exportOrders} disabled={busy !== null}>
            {busy === 'orders' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Pedidos do período
          </button>
          <button type="button" className="btn-soft" onClick={exportByProduct} disabled={busy !== null}>
            {busy === 'product' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Vendas por produto
          </button>
          <button type="button" className="btn-soft" onClick={exportByClient} disabled={busy !== null}>
            {busy === 'client' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Vendas por cliente
          </button>
        </div>

        <p className="text-xs text-gray-500">
          O arquivo baixa na hora com todos os pedidos do período — incluindo cancelados, com coluna de status para filtrar no Excel.
          Totais em R$ com vírgula decimal.
        </p>
      </div>
    </div>
  )
}
