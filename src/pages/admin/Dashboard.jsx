import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClipboardList, Package, TrendingUp, Truck, Users, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { formatBRL, formatDateTime, ORDER_CLS, ORDER_LABELS } from '../../lib/utils'

// Dashboard: as VENDAS contabilizam somente pedidos FINALIZADOS
// (entregues). Mostra também pedidos em andamento e a lista recente.
export default function Dashboard() {
  const { settings } = useStore()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState(null)
  const [recent, setRecent] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [salesByDay, setSalesByDay] = useState([])
  const [topSold, setTopSold] = useState([])

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [ordersRes, clientsRes, productsRes, topRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('id, total, status, created_at, customer_name'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('products').select('name, views').order('views', { ascending: false }).limit(8),
        supabase.from('order_items').select('product_name, quantity, unit_price'),
      ])

      // Ranking de mais vendidos: agregação por nome do produto
      const soldMap = {}
      ;(itemsRes.data ?? []).forEach((it) => {
        const s = soldMap[it.product_name] ?? { qty: 0, revenue: 0 }
        s.qty += it.quantity
        s.revenue += Number(it.unit_price) * it.quantity
        soldMap[it.product_name] = s
      })
      setTopSold(
        Object.entries(soldMap)
          .map(([name, s]) => ({ name, ...s }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5)
      )

      const orders = ordersRes.data ?? []
      const delivered = orders.filter((o) => o.status === 'delivered')
      const inProgress = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length
      const totalSales = delivered.reduce((sum, o) => sum + Number(o.total), 0)

      // Série dos últimos 7 dias — apenas vendas finalizadas
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push({ day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), vendas: 0 })
      }
      delivered.forEach((o) => {
        const label = new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        const slot = days.find((x) => x.day === label)
        if (slot) slot.vendas += Number(o.total)
      })

      setMetrics({
        totalSales,
        deliveredCount: delivered.length,
        inProgress,
        clientsCount: clientsRes.count ?? 0,
        activeProducts: productsRes.count ?? 0,
      })
      setRecent(orders.slice(0, 8))
      setTopProducts((topRes.data ?? []).map((p) => ({
        name: p.name.length > 18 ? p.name.slice(0, 16) + '...' : p.name,
        acessos: p.views,
      })))
      setSalesByDay(days)
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !metrics) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  }

  const accent = settings.primary_color

  const CARDS = [
    { label: 'Vendas (entregues)', value: formatBRL(metrics.totalSales), icon: TrendingUp, hint: metrics.deliveredCount + ' pedido(s) finalizado(s)' },
    { label: 'Pedidos em andamento', value: String(metrics.inProgress), icon: Truck, hint: 'confirmados, separando ou em rota' },
    { label: 'Clientes cadastrados', value: String(metrics.clientsCount), icon: Users, hint: "role = 'client'" },
    { label: 'Produtos ativos', value: String(metrics.activeProducts), icon: Package, hint: 'publicados na vitrine' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500">Visão geral da {settings.store_name} · vendas contabilizam só pedidos entregues</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="card flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="truncate text-xl font-bold text-gray-800">{value}</p>
              <p className="text-[11px] text-gray-400">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-bold text-gray-800">Vendas finalizadas — últimos 7 dias</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Area type="monotone" dataKey="vendas" stroke={accent} strokeWidth={2} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-bold text-gray-800">Produtos mais acessados</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#9ca3af" interval={0} angle={-20} height={60} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="acessos" fill={accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ============ LISTA DE PEDIDOS RECENTES ============ */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold text-gray-800">
            <ClipboardList className="h-5 w-5 text-primary" /> Pedidos recentes
          </h2>
          <Link to="/admin/pedidos" className="text-sm font-medium text-primary hover:underline">
            Gerenciar pedidos →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nenhum pedido ainda. Assim que um cliente finalizar uma compra ele aparece aqui (e um popup avisa na hora).</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-semibold text-gray-800">#{o.id.slice(0, 8)}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600">{o.customer_name || 'Cliente'}</span>
                <span className={'rounded-full px-2.5 py-0.5 text-[11px] font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                  {ORDER_LABELS[o.status] ?? o.status}
                </span>
                <span className="text-xs text-gray-400">{formatDateTime(o.created_at)}</span>
                <span className="font-bold text-primary">{formatBRL(o.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ MAIS VENDIDOS ============ */}
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 font-bold text-gray-800">
          <Package className="h-5 w-5 text-primary" /> Produtos mais vendidos
        </h2>
        {topSold.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            Nenhuma venda registrada ainda — o ranking aparece aqui conforme os pedidos forem feitos.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {topSold.map((p, idx) => (
              <div key={p.name} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{p.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{p.qty} un</span>
                <span className="shrink-0 font-bold text-primary">{formatBRL(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
