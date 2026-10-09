import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, Tags, Settings as SettingsIcon, Store, LogOut, ClipboardList, TicketPercent, Users, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

const ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/admin/produtos', label: 'Produtos', icon: Package },
  { to: '/admin/categorias', label: 'Categorias', icon: Tags },
  { to: '/admin/cupons', label: 'Cupons', icon: TicketPercent },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SettingsIcon },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const { settings } = useStore()
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()

  // fecha o drawer ao navegar
  useEffect(() => { setDrawer(false) }, [location.pathname])

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
    <div className="flex min-h-screen bg-gray-100">
      {/* ============ SIDEBAR (desktop) ============ */}
      <aside className="hidden w-60 shrink-0 flex-col bg-secondary text-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">{brand}</div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ' +
                (isActive ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-1 border-t border-white/10 px-3 py-3 text-sm">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-white/70 transition hover:bg-white/10 hover:text-white">
            <Store className="h-4 w-4" /> Ver loja
          </Link>
          <div className="px-3 py-2 text-[11px] text-white/40">{profile?.full_name || 'Admin'}</div>
          <button type="button" onClick={signOut} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-red-300 transition hover:bg-red-500/10">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ============ TOPBAR MOBILE (hambúrguer) ============ */}
        <header className="flex items-center gap-2 border-b bg-secondary px-3 py-2.5 text-white md:hidden">
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 transition hover:bg-white/10"
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
              <div className="flex justify-center py-24 text-gray-400">
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
          <div className="toast-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-secondary text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="truncate text-sm font-bold">Painel Admin</span>
              <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setDrawer(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 text-sm">
              {ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 transition ' +
                    (isActive ? 'bg-primary text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </nav>

            <div className="space-y-1.5 border-t border-white/10 px-2 py-3 text-sm">
              <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/75 transition hover:bg-white/10 hover:text-white">
                <Store className="h-4 w-4" /> Ver loja
              </Link>
              <div className="px-3 py-1.5 text-[11px] text-white/40">{profile?.full_name || 'Admin'}</div>
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
