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
import PageTitle from './components/PageTitle'
// SPA mantém o scroll ao trocar de rota — voltamos sempre ao topo
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return null
}

// Páginas admin carregadas sob demanda (code-splitting):
// separa os gráficos (Recharts) do bundle principal da vitrine
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const ProductsAdmin = lazy(() => import('./pages/admin/Products'))
const CategoriesAdmin = lazy(() => import('./pages/admin/Categories'))
const SettingsAdmin = lazy(() => import('./pages/admin/Settings'))
const OrdersAdmin = lazy(() => import('./pages/admin/Orders'))
const ClientsAdmin = lazy(() => import('./pages/admin/Clients'))
const CouponsAdmin = lazy(() => import('./pages/admin/Coupons'))

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
                <Route path="/perfil" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="/pedidos" element={<RequireAuth><Orders /></RequireAuth>} />
              </Route>

              {/* ============ LADO DO ADMIN (protegido por role) ============ */}
              <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<Dashboard />} />
                <Route path="pedidos" element={<OrdersAdmin />} />
                <Route path="produtos" element={<ProductsAdmin />} />
                <Route path="categorias" element={<CategoriesAdmin />} />
                <Route path="clientes" element={<ClientsAdmin />} />
                <Route path="cupons" element={<CouponsAdmin />} />
                <Route path="configuracoes" element={<SettingsAdmin />} />
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
