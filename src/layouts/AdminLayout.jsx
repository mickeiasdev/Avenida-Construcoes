import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, Tags, Settings as SettingsIcon, Store, LogOut, ClipboardList, TicketPercent, Percent, Users, Menu, X, PlusCircle, MessageCircle, Home } from 'lucide-react';import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { supabase } from '../lib/supabaseClient'
import { ORDER_PIPELINE } from '../lib/utils'
import { useModalA11y } from '../lib/useModalA11y'

// Pendente = ainda não finalizado (delivered) nem cancelado. Os valores
// reais vêm do pipeline de status do projeto — nada de chutar strings.
const PENDING_STATUSES = ORDER_PIPELINE.filter((s) => s !== 'delivered')

// Selo do menu: some sozinho quando a contagem zera.
function PendingBadge({ count }) {
  if (!count) return null
  return <span className="badge-count ml-auto" aria-hidden="true">{count > 99 ? '99+' : count}</span>
}

const ITEMS = [
  // "Início" abre a VITRINE da loja (mesma página que o cliente vê) —
  // caminho explícito, sem depender de achar o atalho do rodapé.
  { to: '/', label: 'Início', icon: Home, external: true },
  // WhatsApp aqui em cima: é o atendimento do dia a dia, acesso rápido
  // logo abaixo do Dashboard (com o selo de não lidas).
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, group: 'Operação' },
  { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle, waBadge: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/admin/nova-venda', label: 'Nova venda', icon: PlusCircle },
  { to: '/admin/produtos', label: 'Produtos', icon: Package, group: 'Catálogo' },
  { to: '/admin/categorias', label: 'Categorias', icon: Tags },
  { to: '/admin/cupons', label: 'Cupons', icon: TicketPercent },
  { to: '/admin/promocoes', label: 'Promoções', icon: Percent },
  { to: '/admin/clientes', label: 'Clientes', icon: Users, group: 'Loja' },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SettingsIcon },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const { settings } = useStore()
  const [drawer, setDrawer] = useState(false)
  useModalA11y(drawer, () => setDrawer(false))
  const [pendingCount, setPendingCount] = useState(0)
  const location = useLocation()

  // fecha o drawer ao navegar
  useEffect(() => { setDrawer(false) }, [location.pathname])

  // Selo de pedidos pendentes: contagem exata no banco + UMA subscription
  // realtime em orders (INSERT/UPDATE/DELETE) para manter o número vivo.
  const loadPending = useCallback(async () => {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', PENDING_STATUSES)
    setPendingCount(count ?? 0)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-pending-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadPending)
      // primeira contagem quando o canal conecta; depois, a cada mudança em orders
      .subscribe((status) => { if (status === 'SUBSCRIBED') loadPending() })
    return () => { supabase.removeChannel(channel) }
  }, [loadPending])

  // Selo do WhatsApp: soma das não lidas (tabela da migration-19, escrita pelo
  // webhook da Evolution). Sem a migration, o select falha em silêncio e o
  // selo simplesmente não aparece — nada quebra.
  const [waUnread, setWaUnread] = useState(0)
  const loadWaUnread = useCallback(async () => {
    const { data } = await supabase.from('whatsapp_chats').select('unread_count')
    setWaUnread((data ?? []).reduce((acc, r) => acc + (Number(r.unread_count) || 0), 0))
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-wa-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats' }, loadWaUnread)
      .subscribe((status) => { if (status === 'SUBSCRIBED') loadWaUnread() })
    return () => { supabase.removeChannel(channel) }
  }, [loadWaUnread])

  const brand = (
    <div className="flex min-w-0 items-center gap-2">
      {settings.logo_url ? (
        <img src={settings.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold">
          {settings.store_name.charAt(0)}
        </span>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold">{settings.store_name}</p>
        <p className="text-[11px] text-white/50">Painel Admin</p>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-100 md:pl-60">
      {/* ============ SIDEBAR (desktop) ============ */}
      <aside className="hidden w-60 shrink-0 flex-col bg-secondary text-white md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">{brand}</div>

        <nav className="scrollbar-dark flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
            {ITEMS.map(({ to, label, icon: Icon, end, group, waBadge, external }) => (
              <div key={to}>
                {group && (
                  <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
                    {group}
                  </p>
                )}
                {external ? (
                  <Link
                    to={to}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                ) : (
                <NavLink
                  to={to}
                  end={end}
                  aria-label={to === '/admin/pedidos' && pendingCount > 0
                    ? `Pedidos, ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`
                    : undefined}
                  className={({ isActive }) =>
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ' +
                    (isActive ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10 hover:text-white') + ' '
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                  {to === '/admin/pedidos' && <PendingBadge count={pendingCount} />}
                  {waBadge && <PendingBadge count={waUnread} />}
                </NavLink>
                )}
              </div>
            ))}
        </nav>

        <div className="flex flex-col gap-1 border-t border-white/10 px-3 py-3 text-sm">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/10 hover:text-white">
            <Store className="h-4 w-4" /> Ver loja
          </Link>
          <div className="px-3 py-2 text-[11px] text-white/70">{profile?.full_name || 'Admin'}</div>
          <button type="button" onClick={signOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-red-300 transition hover:bg-red-500/10">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ============ TOPBAR MOBILE (hambúrguer) ============ */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-secondary px-3 py-2.5 text-white md:hidden">
          <button
            type="button"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">{brand}</div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Suspense
            fallback={
              <div className="flex justify-center py-24 text-gray-500">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* ============ DRAWER MOBILE ============ */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div
            className="toast-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-secondary text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="truncate text-sm font-bold">Painel Admin</span>
              <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setDrawer(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="scrollbar-dark flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 text-sm">
          {ITEMS.map(({ to, label, icon: Icon, end, group, waBadge, external }) => (
            <div key={to}>
              {group && (
                <p className="mt-4 px-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
                  {group}
                </p>
              )}
              {external ? (
                <Link
                  to={to}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ) : (
              <NavLink
                to={to}
                end={end}
                aria-label={to === '/admin/pedidos' && pendingCount > 0
                  ? `Pedidos, ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`
                  : undefined}
                className={({ isActive }) =>
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 transition ' +
                  (isActive ? 'bg-primary text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')
                }
              >
                <Icon className="h-4 w-4" /> {label}
                {to === '/admin/pedidos' && <PendingBadge count={pendingCount} />}
                {waBadge && <PendingBadge count={waUnread} />}
              </NavLink>
              )}
            </div>
          ))}
            </nav>

            <div className="space-y-1.5 border-t border-white/10 px-2 py-3 text-sm">
              <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/75 transition hover:bg-white/10 hover:text-white">
                <Store className="h-4 w-4" /> Ver loja
              </Link>
              <div className="px-3 py-1.5 text-[11px] text-white/70">{profile?.full_name || 'Admin'}</div>
              <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-red-300 transition hover:bg-red-500/10">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
