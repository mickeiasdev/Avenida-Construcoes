import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClipboardList, Package, TrendingUp, Truck, Users, Loader2, AlertTriangle, Target } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { sweepOrphanImages } from '../../lib/storageCleanup'
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
  const [lowStock, setLowStock] = useState([]) // produtos no mínimo (migration-30)
  const [loadError, setLoadError] = useState(null)

  // --------------------------------------------------------------
  // FAXINA AUTOMÁTICA de imagens órfãs (ex.: foto enviada e o modal foi
  // fechado sem salvar). Roda em segundo plano quando o painel abre, no
  // máximo 2x ao dia por navegador — o delete exige admin (migration-18),
  // por isso mora aqui no Dashboard e não na vitrine.
  useEffect(() => {
    const last = Number(localStorage.getItem('wl_img_sweep_at') ?? 0)
    if (Date.now() - last < 12 * 3600 * 1000) return
    localStorage.setItem('wl_img_sweep_at', String(Date.now()))
    sweepOrphanImages()
      .then((n) => { if (n > 0) console.info('[storage] faxina removeu ' + n + ' imagem(ns) órfã(s)') })
      .catch((e) => console.warn('[storage] faxina pulou:', e?.message ?? e))
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [ordersRes, clientsRes, productsRes, topRes, itemsRes, statsRes, stockRes] = await Promise.all([
        // order() é indispensável aqui: sem ele, "Pedidos recentes" exibia linhas
        // em ordem indefinida (na prática, os pedidos mais antigos)
        supabase.from('orders').select('id, total, status, created_at, customer_name')
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('products').select('name, views').order('views', { ascending: false }).limit(8),
        supabase.from('order_items').select('product_name, quantity, unit_price').limit(1000),
        // agregação no banco (migration-14). Sem ela o cálculo local vale, mas fica
        // sujeito ao teto de 1000 linhas e aos agregados desabilitados do PostgREST.
        supabase.rpc('store_dashboard_stats'),
        // estoque no mínimo (migration-30): comparação entre colunas não existe
        // no PostgREST, então busca e filtra aqui — lojas pequenas cabem fácil
        supabase.from('products')
          .select('id, name, stock, min_stock')
          .eq('active', true)
          .not('stock', 'is', null)
          .not('min_stock', 'is', null)
          .limit(500),
      ])

      // falha de rede não pode virar R$ 0,00 silencioso
      const failed = [ordersRes, clientsRes, productsRes, topRes, itemsRes].find((r) => r.error)
      setLoadError(failed ? (failed.error?.message ?? 'Falha ao carregar os dados do painel.') : null)

      setLowStock((stockRes.data ?? [])
        .filter((p) => Number(p.stock) <= Number(p.min_stock))
        .sort((a, b) => Number(a.stock) - Number(b.stock)))

      const stats = (!statsRes?.error && statsRes?.data) ? statsRes.data : null

      // Ranking de mais vendidos: o banco manda quando a migration-14 está aplicada
      if (stats?.top_sold?.length) {
        setTopSold(stats.top_sold.map((s) => ({ name: s.name, qty: Number(s.qty), revenue: Number(s.revenue) })))
      } else {
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
      }

      const orders = ordersRes.data ?? []
      const delivered = orders.filter((o) => o.status === 'delivered')
      const totalSales = stats?.sales_total != null
        ? Number(stats.sales_total)
        : delivered.reduce((sum, o) => sum + Number(o.total), 0)
      const deliveredCount = stats?.delivered_count != null ? Number(stats.delivered_count) : delivered.length
      const inProgress = stats?.in_progress_count != null
        ? Number(stats.in_progress_count)
        : orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length

      // Série dos últimos 7 dias — apenas vendas finalizadas
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push({ day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), vendas: 0 })
      }
      if (stats?.by_day?.length) {
        stats.by_day.forEach((b) => {
          const slot = days.find((x) => x.day === b.day)
          if (slot) slot.vendas += Number(b.total)
        })
      } else {
        delivered.forEach((o) => {
          const label = new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          const slot = days.find((x) => x.day === label)
          if (slot) slot.vendas += Number(o.total)
        })
      }

      setMetrics({
        totalSales,
        deliveredCount,
        inProgress,
        clientsCount: clientsRes.count ?? 0,
        activeProducts: productsRes.count ?? 0,
      })
      setRecent(orders.slice(0, 8))
      setTopProducts((topRes.data ?? []).map((p) => ({
        name: (p.name || '').length > 18 ? (p.name || '').slice(0, 16) + '...' : (p.name || ''),
        acessos: p.views,
      })))
      setSalesByDay(days)
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !metrics) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
  }

  const accent = settings.primary_color

  // meta do dia (Settings → migration-30): hoje = último ponto da série de vendas
  const dailyGoal = Number(settings.daily_goal ?? 0)
  const todaySales = salesByDay[salesByDay.length - 1]?.vendas ?? 0
  const goalPct = dailyGoal > 0 ? Math.round((todaySales / dailyGoal) * 100) : 0

  const CARDS = [
    { label: 'Vendas (entregues)', value: formatBRL(metrics.totalSales), icon: TrendingUp, hint: `${metrics.deliveredCount} pedidos` },
    { label: 'Pedidos em andamento', value: String(metrics.inProgress), icon: Truck, hint: 'confirmados, separando ou em rota' },
    { label: 'Produtos ativos', value: String(metrics.activeProducts), icon: Package, hint: 'publicados na vitrine' },
    { label: 'Clientes cadastrados', value: String(metrics.clientsCount), icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500">Visão geral da {settings.store_name} · vendas contabilizam só pedidos entregues</p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          Não foi possível carregar todos os números: {loadError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="card flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="truncate text-xl font-bold text-gray-800">{value}</p>
              <p className="text-[11px] text-gray-500">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ===== META DO DIA (migration-30) ===== */}
      {dailyGoal > 0 && (
        <div className="card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <Target className="h-5 w-5 text-primary" /> Meta de hoje
            </h2>
            <span className="text-sm text-gray-500">
              <b className="text-gray-800">{formatBRL(todaySales)}</b> de {formatBRL(dailyGoal)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.min(100, goalPct)} aria-valuemin={0} aria-valuemax={100} aria-label={'Progresso da meta diária: ' + goalPct + '%'}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: Math.min(100, goalPct) + '%',
                backgroundImage: 'linear-gradient(90deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 65%, #ffffff))',
              }}
            />
          </div>
          <p className="text-xs font-medium text-gray-500">
            {goalPct >= 100
              ? '🎉 Meta batida! ' + formatBRL(todaySales - dailyGoal) + ' acima do previsto.'
              : 'Faltam ' + formatBRL(dailyGoal - todaySales) + ' — ' + goalPct + '% da meta. Vendas contabilizam pedidos entregues.'}
          </p>
        </div>
      )}

      {/* ===== ESTOQUE NO MÍNIMO (migration-30) ===== */}
      {lowStock.length > 0 && (
        <div className="card space-y-3 ring-1 ring-red-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <AlertTriangle className="h-5 w-5 text-red-500" /> Estoque no mínimo
              <span className="badge-count bg-red-500">{lowStock.length}</span>
            </h2>
            <Link to="/admin/produtos" className="text-sm font-medium text-primary hover:underline">
              Repor agora →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {lowStock.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{p.name}</span>
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                  {p.stock} un. · mín. {p.min_stock}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <p className="py-8 text-center text-sm text-gray-500">Nenhum pedido ainda. Assim que um cliente finalizar uma compra ele aparece aqui (e um popup avisa na hora).</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-semibold text-gray-800">#{o.id.slice(0, 8)}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600">{o.customer_name || 'Cliente'}</span>
                <span className={'rounded-lg px-2.5 py-0.5 text-[11px] font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                  {ORDER_LABELS[o.status] ?? o.status}
                </span>
                <span className="text-xs text-gray-500">{formatDateTime(o.created_at)}</span>
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
          <p className="py-6 text-center text-sm text-gray-500">
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
                <span className="shrink-0 text-xs text-gray-500">{p.qty} un</span>
                <span className="shrink-0 font-bold text-primary">{formatBRL(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
