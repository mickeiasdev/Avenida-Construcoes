import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">
      Carregando...
    </div>
  )
}

// Protege rotas de clientes logados (ex.: /perfil, /pedidos, /carrinho)
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

// Protege o dashboard admin (/admin) por role
export function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center text-gray-600">
        <h1 className="text-2xl font-bold text-gray-800">Acesso restrito</h1>
        <p className="text-sm">Sua conta não tem permissão de administrador.</p>
      </div>
    )
  }
  return children
}
