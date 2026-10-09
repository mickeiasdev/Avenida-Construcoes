import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)
const STORAGE_KEY = 'wl_cart_v1'

const paymentLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão na entrega/retirada' }

// Carrinho persistente (LocalStorage) + modal "adicionado ao carrinho"
// + checkout que grava orders/order_items, atualiza o perfil do cliente
// e abre o WhatsApp da loja com o resumo formatado.
export function CartProvider({ children }) {
  const { user, refreshProfile } = useAuth()
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [lastAdded, setLastAdded] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* storage indisponível */ }
  }, [items])

  function addItem(product, quantity = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id)
      if (existing) {
        const max = product.stock ?? existing.stock ?? 999
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: Math.min(i.quantity + quantity, max) } : i
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        image_url: product.image_url,
        quantity,
        stock: product.stock,
      }]
    })
    // aciona o modal "Deseja finalizar ou continuar comprando?"
    setLastAdded({ name: product.name, image_url: product.image_url, quantity })
  }

  function dismissLastAdded() { setLastAdded(null) }

  function updateQuantity(productId, quantity) {
    if (quantity <= 0) { removeItem(productId); return }
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity } : i)))
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  function clearCart() { setItems([]) }

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  // ---------- CHECKOUT VIA WHATSAPP ----------
  // form = dados de entrega; directItems = quando a finalização vem
  // DIRETO da tela do produto ("comprar agora"): o pedido contém só
  // aquele item e o carrinho NÃO é mexido.
  // options: { deliveryMethod: 'entrega'|'retirada', paymentMethod: 'pix'|'dinheiro'|'cartao' }
  async function checkout(form, directItems = null, options = {}) {
    // Visitante pode finalizar: pedido grava com user_id = null e is_guest = true
    // (policy RLS da migration-3 permite insert anônimo nesse caso).
    const checkoutItems = directItems ?? items
    if (!checkoutItems.length) throw new Error('Nada para finalizar.')

    const totalValue = checkoutItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

    // 1) se estiver LOGADO, mantém o perfil atualizado (o admin vê esses dados)
    //    só sobrescreve os campos que foram preenchidos
    if (user) {
      const profileUpdate = {}
      Object.keys(form).forEach((k) => {
        if (String(form[k] ?? '').trim() !== '') profileUpdate[k] = form[k]
      })
      await supabase.from('profiles').update(profileUpdate).eq('id', user.id)
      if (refreshProfile) refreshProfile(user.id)
    }

    const deliveryMethod = options.deliveryMethod === 'retirada' ? 'retirada' : 'entrega'
    const paymentMethod = ['pix', 'dinheiro', 'cartao'].includes(options.paymentMethod)
      ? options.paymentMethod : 'pix'

    // 2) endereço em linhas legíveis (usado no pedido e na mensagem);
    //    retirada no balcão não grava endereço
    const addressParts = []
    if (deliveryMethod === 'entrega') {
      addressParts.push((form.street || '') + ((form.street && form.number) ? ', ' + form.number : (form.number || '')))
      if (form.complement) addressParts.push(form.complement)
      if (form.district) addressParts.push(form.district)
      if (form.city) addressParts.push(form.city + (form.state ? '/' + form.state : ''))
      if (form.zip) addressParts.push('CEP ' + form.zip)
    }
    const deliveryAddress = addressParts.filter(Boolean).join(', ')

    // 3) grava o pedido + itens
    // O uuid é gerado aqui no navegador: convidado não consegue LER o pedido
    // de volta (RLS), então não podemos usar .select() após o insert.
    const order = { id: crypto.randomUUID() }
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: order.id,
        user_id: user ? user.id : null,
        is_guest: !user,
        total: totalValue,
        customer_name: form.full_name || (user?.email ?? 'Visitante'),
        customer_phone: form.phone || '',
        delivery_address: deliveryAddress,
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
      })
    if (orderError) throw orderError

    const { error: itemsError } = await supabase.from('order_items').insert(
      checkoutItems.map((i) => ({
        order_id: order.id,
        product_id: i.product_id,
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
      }))
    )
    if (itemsError) throw itemsError

    const { data: store } = await supabase
      .from('store_settings').select('store_name, whatsapp').eq('id', 1).maybeSingle()

    // 4) mensagem para o WhatsApp — só texto + *negrito* nativo e
    // emojis clássicos (Unicode antigo); emojis novos/box-drawing
    // (🧾, ━━━) aparecem como "�" no WhatsApp Web e celulares antigos.
    const money = (n) => 'R$ ' + n.toFixed(2).replace('.', ',')
    const sep = '─────────────────'
    const lines = []
    lines.push('*NOVO PEDIDO — ' + (store?.store_name ?? 'Loja') + '*')
    lines.push(sep)
    lines.push('Pedido nº ' + order.id.slice(0, 8))
    lines.push('')
    lines.push('*CLIENTE*')
    lines.push('Nome: ' + (form.full_name || user.email))
    if (form.phone) lines.push('Telefone: ' + form.phone)
    lines.push('')
    lines.push('*ITENS DO PEDIDO*')
    checkoutItems.forEach((i, idx) => {
      lines.push((idx + 1) + ') ' + i.quantity + 'x ' + i.name + ' — ' + money(i.price * i.quantity))
    })
    lines.push('')
    lines.push(sep)
    lines.push('*TOTAL: ' + money(totalValue) + '*')
    lines.push(sep)
    lines.push('')
    if (deliveryMethod === 'retirada') {
      lines.push('*RETIRADA NO BALCÃO*')
      lines.push('O cliente vai buscar o pedido na loja')
    } else {
      lines.push('*ENDEREÇO DE ENTREGA*')
      addressParts.filter(Boolean).forEach((p) => lines.push(p))
    }
    lines.push('')
    lines.push('*PAGAMENTO*')
    lines.push(paymentLabels[paymentMethod] || 'Pix')
    lines.push('')
    lines.push(new Date().toLocaleString('pt-BR'))
    lines.push('')
    lines.push('_Pedido enviado pelo site_')

    const message = encodeURIComponent(lines.join('\n'))
    const waUrl = 'https://wa.me/' + (store?.whatsapp ?? '') + '?text=' + message
    // window.open pode ser bloqueado em navegadores mobile (iOS) quando
    // chamado após um await — se for bloqueado, navega direto
    const win = window.open(waUrl, '_blank')
    if (!win) window.location.href = waUrl

    // pedido direto não mexe no carrinho
    if (!directItems) clearCart()
    return order
  }

  return (
    <CartContext.Provider
      value={{ items, count, total, lastAdded, dismissLastAdded, addItem, updateQuantity, removeItem, clearCart, checkout }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve ser usado dentro de CartProvider')
  return ctx
}
