import { lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { StoreProvider } from './context/StoreContext'
import { CartProvider } from './context/CartContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { RequireAdmin, RequireAuth } from './components/ProtectedRoute'
import { OrderAlerts } from './components/OrderAlerts'
import StoreLayout from './layouts/StoreLayout'
import AdminLayout from './layouts/AdminLayout'
import Home from './pages/Home'
import ProductPage from './pages/ProductPage'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Orders from './pages/Orders'
import Cart from './pages/Cart'
import Favorites from './pages/Favorites'
import Lists from './pages/Lists'
import PageTitle from './components/PageTitle'
// SPA mantém o scroll ao trocar de rota — voltamos sempre ao topo
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return null
}

// Páginas admin carregadas sob demanda (code-splitting):
// separa os gráficos (Recharts) do bundle principal da vitrine

// Deploy trocou o hash dos arquivos? Quem estava com a loja aberta teria
// "Failed to fetch dynamically imported module" até dar F5. Com este wrapper
// o app se recarrega SOZINHO uma vez (e se persistir, o erro sobe normal).
const CHUNK_RELOAD_KEY = 'wl_chunk_reload'
function lazyRetry(importFn) {
  return lazy(async () => {
    try {
      const mod = await importFn()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return mod
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return new Promise(() => {}) // aguarda o reload acontecer
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      throw err
    }
  })
}

const Dashboard = lazyRetry(() => import('./pages/admin/Dashboard'))
const ProductsAdmin = lazyRetry(() => import('./pages/admin/Products'))
const CategoriesAdmin = lazyRetry(() => import('./pages/admin/Categories'))
const SettingsAdmin = lazyRetry(() => import('./pages/admin/Settings'))
const OrdersAdmin = lazyRetry(() => import('./pages/admin/Orders'))
const ClientsAdmin = lazyRetry(() => import('./pages/admin/Clients'))
const CouponsAdmin = lazyRetry(() => import('./pages/admin/Coupons'))
const PromotionsAdmin = lazyRetry(() => import('./pages/admin/Promotions'))
const NewOrderAdmin = lazyRetry(() => import('./pages/admin/NewOrder'))
const WhatsAppAdmin = lazyRetry(() => import('./pages/admin/WhatsApp'))
const BannersAdmin = lazyRetry(() => import('./pages/admin/Banners'))
const ReviewsAdmin = lazyRetry(() => import('./pages/admin/Reviews'))
const ReportsAdmin = lazyRetry(() => import('./pages/admin/Reports'))
const AutomationsAdmin = lazyRetry(() => import('./pages/admin/Automations'))

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <FavoritesProvider>
        <CartProvider>
          <BrowserRouter>
            {/* popup de "Novo pedido" para o admin (Realtime) */}
            <OrderAlerts />
            <ScrollToTop />
            <PageTitle />

            <Routes>
              {/* ============ LADO DO CLIENTE (Vitrine) ============ */}
              <Route element={<StoreLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/produto/:id" element={<ProductPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/carrinho" element={<Cart />} />
                <Route path="/favoritos" element={<Favorites />} />
                <Route path="/listas" element={<RequireAuth><Lists /></RequireAuth>} />
                <Route path="/perfil" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="/pedidos" element={<RequireAuth><Orders /></RequireAuth>} />
              </Route>

              {/* ============ LADO DO ADMIN (protegido por role) ============ */}
              <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<Dashboard />} />
                <Route path="pedidos" element={<OrdersAdmin />} />
                <Route path="nova-venda" element={<NewOrderAdmin />} />
                <Route path="produtos" element={<ProductsAdmin />} />
                <Route path="categorias" element={<CategoriesAdmin />} />
                <Route path="clientes" element={<ClientsAdmin />} />
                <Route path="whatsapp" element={<WhatsAppAdmin />} />
                <Route path="cupons" element={<CouponsAdmin />} />
                <Route path="promocoes" element={<PromotionsAdmin />} />
                <Route path="banners" element={<BannersAdmin />} />
                <Route path="avaliacoes" element={<ReviewsAdmin />} />
                <Route path="configuracoes" element={<SettingsAdmin />} />
                <Route path="relatorios" element={<ReportsAdmin />} />
                <Route path="automacoes" element={<AutomationsAdmin />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
        </FavoritesProvider>
      </StoreProvider>
    </AuthProvider>
  )
}
