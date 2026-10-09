import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function PageTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    let title = 'ConstruFácil'
    if (pathname.startsWith('/produto/')) {
      title = 'Produto - ConstruFácil'
    } else if (pathname === '/') {
      title = 'Home - ConstruFácil'
    } else if (pathname === '/login') {
      title = 'Login - ConstruFácil'
    } else if (pathname === '/carrinho') {
      title = 'Carrinho - ConstruFácil'
    } else if (pathname === '/favoritos') {
      title = 'Favoritos - ConstruFácil'
    } else if (pathname === '/perfil') {
      title = 'Perfil - ConstruFácil'
    } else if (pathname === '/pedidos') {
      title = 'Meus Pedidos - ConstruFácil'
    } else if (pathname.startsWith('/admin/')) {
      const parts = pathname.split('/')
      // parts: ['', 'admin', 'segundo', ...]
      const second = parts[2]
      const adminTitles = {
        pedidos: 'Pedidos Admin',
        produtos: 'Produtos Admin',
        categorias: 'Categorias Admin',
        clientes: 'Clientes Admin',
        configuracoes: 'Configurações Admin',
      }
      title = `${adminTitles[second] || 'Painel Admin'} - ConstruFácil`
    } else if (pathname === '/admin') {
      title = 'Painel Admin - ConstruFácil'
    }
    document.title = title
  }, [pathname])

  return null
}
