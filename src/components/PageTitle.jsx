import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../context/StoreContext'
import { applyTabBadge } from '../lib/tabTitle'

export default function PageTitle() {
  const { pathname } = useLocation()
  const { settings } = useStore()
  const storeName = settings?.store_name || 'Avenida Construção'

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
        cupons: 'Cupons Admin',
        promocoes: 'Promoções Admin',
        'nova-venda': 'Nova venda',
        configuracoes: 'Configurações Admin',
      }
      title = (adminTitles[second] || 'Painel Admin') + ' - ' + storeName
    } else if (pathname === '/admin') {
      title = 'Painel Admin - ' + storeName
    }
    // selo de não lidas do WhatsApp na frente ("(2) Pedidos Admin - …"):
    // o AdminLayout mantém a contagem viva (Realtime) via setTabUnread
    document.title = applyTabBadge(title)
  }, [pathname, storeName])

  return null
}
