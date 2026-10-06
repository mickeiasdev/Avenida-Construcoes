import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, User, LogOut, Package, Settings as SettingsIcon, Home as HomeIcon, Phone, MessageCircle, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useStore } from '../context/StoreContext'
import { SearchBar } from '../components/SearchBar'
import { AddToCartModal } from '../components/AddToCartModal'

const NAV_THRESHOLD = 240

export default function StoreLayout() {
  const { settings, categories } = useStore()
  const { user, profile, isAdmin, signOut } = useAuth()
  const { count } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [showNav, setShowNav] = useState(false)
  const [drawer, setDrawer] = useState(false)

  // A navegação de categorias do header só aparece quando o usuário
  // rola a página (quando a navegação de chips da Home já passou),
  // evitando a redundância de duas barras no topo.
  useEffect(() => {
    const onScroll = () => setShowNav(window.scrollY > NAV_THRESHOLD)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // fecha o drawer ao navegar
  useEffect(() => { setDrawer(false) }, [location.pathname, location.search])

  function handleSearch(qv) {
    const params = new URLSearchParams(searchParams)
    if (qv) params.set('q', qv); else params.delete('q')
    navigate('/?' + params.toString())
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* ================= HEADER (sticky) ================= */}
      <header className="sticky top-0 z-40 bg-secondary text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">
          {/* Menu hambúrguer sutil (só no mobile) */}
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 transition hover:bg-white/10 md:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.store_name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold">
                {settings.store_name.charAt(0)}
              </span>
            )}
            <span className="hidden max-w-40 truncate text-base font-bold tracking-tight sm:inline md:max-w-none md:text-lg">
              {settings.store_name}
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            <SearchBar value={searchParams.get('q') ?? ''} onChange={handleSearch} placeholder="Buscar produtos..." />
          </div>

          <Link to="/carrinho" className="relative shrink-0 rounded-lg p-2 transition hover:bg-white/10" aria-label="Carrinho">
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>

          <details className="relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/10" aria-label="Conta">
              <User className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl bg-white p-2 text-sm text-gray-700 shadow-lg ring-1 ring-black/5">
              {user ? (
                <>
                  <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{user.email}</div>
                  <Link to="/perfil" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100"><User className="h-4 w-4" /> Meu perfil</Link>
                  <Link to="/pedidos" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100"><Package className="h-4 w-4" /> Meus pedidos</Link>
                  {isAdmin && (
                    <Link to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100"><SettingsIcon className="h-4 w-4" /> Dashboard admin</Link>
                  )}
                  <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sair</button>
                </>
              ) : (
                <Link to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium hover:bg-gray-100"><User className="h-4 w-4" /> Entrar / Criar conta</Link>
              )}
            </div>
          </details>
        </div>

        {/* NAV DE CATEGORIAS — aparece só quando o usuário rola */}
        <nav
          className={'hidden overflow-hidden border-t border-white/10 bg-white/5 transition-all duration-300 md:block ' +
            (showNav ? 'max-h-14 opacity-100' : 'max-h-0 opacity-0')}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm">
            <NavLink to="/" end className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-white/90 transition hover:bg-white/10">
              <HomeIcon className="h-4 w-4" /> Início
            </NavLink>
            {categories.map((c) => (
              <NavLink key={c.id} to={'/?cat=' + c.slug} className="shrink-0 rounded-full px-3 py-1.5 text-white/90 transition hover:bg-white/10">
                {c.name}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-4">
        <Outlet />
      </main>

      {/* ================= DRAWER MOBILE ================= */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="toast-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-secondary text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="truncate font-bold">{settings.store_name}</span>
              <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setDrawer(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 text-sm">
              <DrawerLink to="/" end icon={HomeIcon} label="Início" />
              <p className="mt-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Categorias</p>
              {categories.map((c) => (
                <DrawerLink key={c.id} to={'/?cat=' + c.slug} label={c.name} />
              ))}
            </nav>

            <div className="space-y-1.5 border-t border-white/10 px-2 py-3 text-sm">
              {user ? (
                <>
                  <DrawerLink to="/perfil" icon={User} label="Meu perfil" />
                  <DrawerLink to="/pedidos" icon={Package} label="Meus pedidos" />
                  {isAdmin && <DrawerLink to="/admin" icon={SettingsIcon} label="Dashboard admin" />}
                  <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10">
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </>
              ) : (
                <DrawerLink to="/login" icon={User} label="Entrar / Criar conta" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="bg-secondary text-white/80">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm md:grid-cols-3">
          <div>
            <p className="mb-2 font-bold text-white">{settings.store_name}</p>
            <p className="text-white/60">{settings.about}</p>
          </div>
          <div>
            <p className="mb-2 font-bold text-white">Endereço</p>
            <p className="text-white/60">{settings.address}</p>
          </div>
          <div>
            <p className="mb-2 font-bold text-white">Funcionamento</p>
            <p className="text-white/60">{settings.business_hours}</p>
            <a href={'https://wa.me/' + settings.whatsapp} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-white transition hover:text-primary">
              <Phone className="h-4 w-4" /> {settings.whatsapp}
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
          © {new Date().getFullYear()} {settings.store_name} · Template white-label React + Supabase
        </div>
      </footer>

      {/* WHATSAPP FLUTUANTE */}
      <a
        href={'https://wa.me/' + settings.whatsapp + '?text=' + encodeURIComponent('Olá! Vim pela loja e tenho uma dúvida.')}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:scale-105"
        aria-label="Falar no WhatsApp"
      >
        <MessageCircle className="h-6 w-6" />
      </a>

      {/* MODAL "ADICIONADO AO CARRINHO" */}
      <AddToCartModal />
    </div>
  )
}

function DrawerLink({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        'flex items-center gap-3 rounded-lg px-3 py-2.5 transition ' +
        (isActive ? 'bg-primary text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')
      }
    >
      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/40" />}
      {label}
    </NavLink>
  )
}
