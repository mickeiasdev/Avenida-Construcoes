import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../context/StoreContext'

export default function PageTitle() {
  const { pathname } = useLocation()
  const { settings } = useStore()
  const storeName = settings?.store_name || 'Avenida Construções'

  useEffect(() => {
    let title = storeName
    if (pathname.startsWith('/produto/')) {
      title = 'Produto - ' + storeName
    } else if (pathname === '/') {
      title = storeName
    } else if (pathname === '/login') {
      title = 'Entrar - ' + storeName
    } else if (pathname === '/carrinho') {
      title = 'Carrinho - ' + storeName
    } else if (pathname === '/favoritos') {
      title = 'Favoritos - ' + storeName
    } else if (pathname === '/perfil') {
      title = 'Perfil - ' + storeName
    } else if (pathname === '/pedidos') {
      title = 'Meus Pedidos - ' + storeName
    } else if (pathname.startsWith('/admin/')) {
      const parts = pathname.split('/')
      const second = parts[2]
      const adminTitles = {
        pedidos: 'Pedidos Admin',
        produtos: 'Produtos Admin',
        categorias: 'Categorias Admin',
        clientes: 'Clientes Admin',
        configuracoes: 'Configurações Admin',
      }
      title = (adminTitles[second] || 'Painel Admin') + ' - ' + storeName
    } else if (pathname === '/admin') {
      title = 'Painel Admin - ' + storeName
    }
    document.title = title
  }, [pathname, storeName])

  return null
}
