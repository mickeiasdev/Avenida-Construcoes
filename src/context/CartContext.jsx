import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { effectivePrice, onlyDigits } from '../lib/utils'
import { isMigrationMissing } from '../lib/storeOrder'
import { readFunctionError } from '../lib/functionError'
import { createPixOrder } from '../lib/payments'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)
const STORAGE_KEY = 'wl_cart_v1'

const paymentLabels = { dinheiro: 'Dinheiro', cartao: 'Cartão na entrega/retirada', mercado_pago: 'Pix online (QR + Copia e Cola)' }

// Colunas REAIS de profiles. Usar Object.keys(form) mandaria cpf/on_behalf_of/
// site_note no patch e o PostgREST recusaria o update INTEIRO.
const PROFILE_COLUMNS = ['full_name', 'phone', 'street', 'number', 'complement', 'district', 'city', 'state', 'zip']

// "Troco para quanto?" é texto livre (ex.: "100,00"): vira R$ 100,00 na mensagem.
function formatChangeFor(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const n = Number(normalized)
  if (!Number.isFinite(n)) return 'R$ ' + raw
  const [int, dec] = n.toFixed(2).split('.')
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}

// Linha de observação do checkout (só as partes preenchidas), ex.:
// "CPF: 123.456.789-00 · Em nome de: João (Obra: Construtora X) · Troco para: R$ 100,00"
function checkoutNote(form, changeFor) {
  const parts = []
  if (String(form?.cpf ?? '').trim()) parts.push('CPF: ' + form.cpf)
  if (String(form?.on_behalf_of ?? '').trim()) {
    let who = 'Em nome de: ' + form.on_behalf_of
    if (String(form?.site_note ?? '').trim()) who += ' (Obra: ' + form.site_note + ')'
    parts.push(who)
  }
  const change = formatChangeFor(changeFor)
  if (change) parts.push('Troco para: ' + change)
  return parts.join(' · ')
}

// ============ CHECKOUT NO SERVIDOR ============
// A RPC public.place_order (supabase/migration-8.sql) recalcula os preços a
// partir da tabela products, valida o cupom e baixa o estoque — o navegador
// não decide mais o valor do pedido. Se a função ainda não existir no
// projeto, caímos no caminho antigo (insert direto) para a loja não parar;
// nesse modo os valores voltam a ser os calculados no cliente.
// escapa % e _ para o ILIKE não interpretá-los como coringas
function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_]/g, (m) => '\\' + m)
}

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
  const [lastAdded, setLastAdded] = useState(null) // modal (só na primeira vez)
  const [addedToast, setAddedToast] = useState(null) // aviso do 2º item em diante
  const [coupon, setCoupon] = useState(null) // { code, kind, value, min_total } ou null

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* storage indisponível */ }
  }, [items])

  // ATENÇÃO: total/count PRECISAM vir antes de discountValue — `const` fica
  // em TDZ e ler `total` antes da inicialização quebra o render inteiro.
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])
  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])

  // desconto em reais do cupom aplicado
  const discountValue = coupon
    ? Math.min(total, coupon.kind === 'percent'
        ? Math.round(total * Number(coupon.value)) / 100
        : Number(coupon.value))
    : 0

  function addItem(product, quantity = 1) {
    // estoque 0 = fora de estoque; null/undefined = sem controle numérico
    const stock = product?.stock
    if (stock != null && Number(stock) <= 0) return false

    // modal completo só quando a sacola estava vazia; depois, aviso discreto
    const primeiroItem = items.length === 0

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
        price: effectivePrice(product),
        list_price: Number(product.price), // preço "de" (para mostrar riscado)
        image_url: product.image_url,
        quantity,
        stock: product.stock,
      }]
    })
    const novidade = { name: product.name, image_url: product.image_url, quantity }
    if (primeiroItem) {
      setLastAdded(novidade) // "Deseja finalizar ou continuar comprando?"
    } else {
      setAddedToast({ ...novidade, key: Date.now() }) // apenas a notificação
    }
    return true
  }

  function dismissLastAdded() { setLastAdded(null) }

  const dismissAddedToast = useCallback(() => setAddedToast(null), [])

  function updateQuantity(productId, quantity) {
    if (quantity <= 0) { removeItem(productId); return }
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity } : i)))
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  function clearCart() { setItems([]); setCoupon(null) }

  // Revalida preço/estoque dos itens guardados no LocalStorage: o admin pode
  // ter mudado o preço (ou excluído o produto) desde a última visita. Itens
  // cujo produto não existe mais saem do carrinho.
  const refreshPrices = useCallback(async (productIds) => {
    const ids = [...new Set((productIds ?? []).filter(Boolean))]
    if (ids.length === 0) return
    const { data } = await supabase
      .from('products')
      .select('id, name, price, discount_percent, stock, image_url')
      .in('id', ids)
    if (!data) return
    const byId = new Map(data.map((p) => [p.id, p]))
    setItems((prev) => prev.flatMap((i) => {
      const p = byId.get(i.product_id)
      if (!p) return []
      return [{
        ...i,
        name: p.name,
        price: effectivePrice(p),
        list_price: Number(p.price),
        stock: p.stock,
        image_url: p.image_url,
      }]
    }))
  }, [])

  // valida o cupom no banco (público pode ler cupons ativos)
  async function applyCoupon(code) {
    const clean = String(code ?? '').trim().toUpperCase()
    if (!clean) return { error: 'Digite um código de cupom.' }
    const { data, error } = await supabase
      .from('coupons')
      .select('code, kind, value, min_total')
      .ilike('code', escapeLike(clean))
      .eq('active', true)
      .maybeSingle()
    if (error || !data) return { error: 'Cupom inválido ou inativo.' }
    if (Number(data.min_total) > 0 && total < Number(data.min_total)) {
      return { error: 'Esse cupom vale para compras a partir de R$ ' + Number(data.min_total).toFixed(2).replace('.', ',') }
    }
    setCoupon(data)
    return { data }
  }

  function removeCoupon() { setCoupon(null) }

  // ---------- CHECKOUT VIA WHATSAPP ----------
  // form = dados de entrega; directItems = quando a finalização vem
  // DIRETO da tela do produto ("comprar agora"): o pedido contém só
  // aquele item e o carrinho NÃO é mexido.
  // options: { deliveryMethod: 'entrega'|'retirada', paymentMethod: 'pix'|'dinheiro'|'cartao' }
  async function checkout(form, directItems = null, options = {}) {
    // Visitante pode finalizar: pedido grava com user_id = null e is_guest = true
    const checkoutItems = directItems ?? items
    if (!checkoutItems.length) throw new Error('Nada para finalizar.')

    // 1) se estiver LOGADO, mantém o perfil atualizado (o admin vê esses dados)
    //    só sobrescreve os campos que foram preenchidos
    if (user) {
      const profileUpdate = {}
      PROFILE_COLUMNS.forEach((k) => {
        if (String(form?.[k] ?? '').trim() !== '') profileUpdate[k] = form[k]
      })
      if (Object.keys(profileUpdate).length > 0) {
        await supabase.from('profiles').update(profileUpdate).eq('id', user.id)
      }
      // CPF é gravado à parte e de forma best-effort: nunca pode derrubar o
      // checkout (coluna única da migration-16 pode rejeitar CPF em duplicidade).
      if (String(form?.cpf ?? '').trim() !== '') {
        try {
          const { error: cpfErr } = await supabase.from('profiles').update({ cpf: onlyDigits(form.cpf) }).eq('id', user.id)
          if (cpfErr) console.warn('[checkout] CPF não atualizado no perfil:', cpfErr.message) // 23505 = CPF já usado em outra conta
        } catch { /* coluna ausente / RLS — o pedido segue normalmente */ }
      }
      if (refreshProfile) refreshProfile(user.id)
    }

    const deliveryMethod = options.deliveryMethod === 'retirada' ? 'retirada' : 'entrega'
    const paymentMethod = ['pix', 'dinheiro', 'cartao', 'mercado_pago'].includes(options.paymentMethod)
      ? options.paymentMethod
      : 'mercado_pago'

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
    const orderId = crypto.randomUUID()
    const customerName = form.full_name || user?.email || 'Visitante'
    let totals = null // { subtotal, discount, total }

    // CPF e observação entram na própria RPC (migration-21): assim também o
    // VISITANTE fica com CPF salvo no pedido — antes o CPF só ia escondido no
    // texto da observação e a observação nem gravava para convidado (RLS).
    const observacao = checkoutNote(form, options.changeFor)
    const rpc = await supabase.rpc('place_order', {
      p_order_id: orderId,
      p_items: checkoutItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      p_coupon_code: coupon?.code ?? null,
      p_customer_name: customerName,
      p_customer_phone: form.phone || '',
      p_delivery_address: deliveryAddress,
      p_delivery_method: deliveryMethod,
      p_payment_method: paymentMethod,
      p_user_id: user ? user.id : null,
      p_is_guest: !user,
      p_customer_cpf: onlyDigits(form.cpf) || null,
      p_customer_note: observacao || null,
    })

    if (!rpc.error) {
      // valores autoritativos, calculados no banco
      totals = {
        subtotal: Number(rpc.data?.subtotal ?? 0),
        discount: Number(rpc.data?.discount ?? 0),
        total: Number(rpc.data?.total ?? 0),
      }
    } else if (isMigrationMissing(rpc.error)) {
      // --- caminho legado (migration-8 ainda não rodada) --------------
      // Mantém a loja funcionando: aqui o valor volta a vir do cliente.
      console.warn('[checkout] RPC place_order não encontrada — usando o caminho legado. ' +
        'Rode supabase/migration-8.sql para o servidor calcular preços, cupom e estoque.')
      const subtotal = checkoutItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
      const discount = Math.min(
        subtotal,
        coupon ? (coupon.kind === 'percent'
          ? Math.round(subtotal * Number(coupon.value)) / 100
          : Number(coupon.value)) : 0
      )
      totals = { subtotal, discount, total: subtotal - discount }

      const { error: orderError } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          user_id: user ? user.id : null,
          is_guest: !user,
          total: totals.total,
          customer_name: customerName,
          customer_phone: form.phone || '',
          delivery_address: deliveryAddress,
          delivery_method: deliveryMethod,
          payment_method: paymentMethod,
          coupon_code: totals.discount > 0 ? (coupon?.code ?? null) : null,
          discount: totals.discount,
        })
      if (orderError) throw orderError

      const { error: itemsError } = await supabase.from('order_items').insert(
        checkoutItems.map((i) => ({
          order_id: orderId,
          product_id: i.product_id,
          product_name: i.name,
          quantity: i.quantity,
          unit_price: i.price,
        }))
      )
      if (itemsError) throw itemsError
    } else {
      throw rpc.error
    }

    const { subtotal, discount, total: totalValue } = totals

    // Caminho LEGADO (sem a migration-21, a RPC acima nem aceita os campos
    // novos): mantém a observação como update best-effort. Com a RPC nova,
    // CPF e observação já entraram no INSERT — nada a fazer aqui.
    if (rpc.error && isMigrationMissing(rpc.error)) {
      try {
        await supabase.from('orders').update({ customer_note: observacao }).eq('id', orderId)
      } catch { /* sem permissão ou coluna ausente — segue o fluxo normal */ }
    }

    const { data: store } = await supabase
      .from('store_settings').select('store_name, whatsapp').eq('id', 1).maybeSingle()

    // PIX ONLINE: se escolheu mercado_pago (= "Pix online gerado"), cria a
    // cobrança no gateway ativo (src/lib/payments.js — hoje: AbacatePay).
    // O pedido já existe no banco com total autoritativo; a Edge Function lê e cria a cobrança.
    let mpPix = null
    let mpErrorDetail = null
    if (paymentMethod === 'mercado_pago') {
      try {
        // mpData: { qr_code, qr_code_base64, status, ... } — idempotente por pedido
        const mpData = await createPixOrder(orderId)
        if (mpData?.qr_code) {
          mpPix = {
            qr_code: mpData.qr_code,               // Pix Copia e Cola
            qr_code_base64: mpData.qr_code_base64,  // Imagem QR
            ticket_url: mpData.ticket_url ?? null,
            mp_order_id: mpData.payment_ref ?? mpData.mp_order_id ?? null,
            mp_payment_id: mpData.mp_payment_id ?? null,
            status: mpData.status ?? 'pending',
          }
        } else {
          console.warn('[checkout] gateway de Pix sem qr_code:', mpData)
          if (mpData?.already_paid || mpData?.status === 'approved') {
            // cobrança já paga (webhook chegou primeiro): trata como sucesso
            mpPix = { qr_code: '', qr_code_base64: null, ticket_url: null, status: 'approved' }
          }
          mpErrorDetail = mpErrorDetail ?? (mpPix ? null : 'O gateway criou a ordem, mas ainda não devolveu o QR Code (status: ' +
            (mpData?.status ?? '?') + '). Use "Tentar novamente".')
        }
      } catch (mpErr) {
        // Não quebra o pedido: o pedido já foi criado; apenas avisa.
        // O admin pode reenviar o Pix ou o cliente pode tentar novamente.
        console.error('[checkout] Falha ao criar a cobrança Pix:', mpErr?.message ?? mpErr)
        mpErrorDetail = await readFunctionError(mpErr)
      }
    }

    // 4) mensagem para o WhatsApp — só texto, *negrito* nativo e emojis
    // clássicos; emojis novos e box-drawing costumam virar caractere
    // quebrado no WhatsApp Web e em celulares antigos.
    const money = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',')
    const sep = '─────────────────'
    const lines = []
    lines.push('*NOVO PEDIDO — ' + (store?.store_name ?? 'Loja') + '*')
    lines.push(sep)
    lines.push('Pedido nº ' + orderId.slice(0, 8))
    lines.push('')
    lines.push('*CLIENTE*')
    lines.push('Nome: ' + customerName)
    if (form.phone) lines.push('Telefone: ' + form.phone)
    if (observacao) lines.push(observacao)
    lines.push('')
    lines.push('*ITENS DO PEDIDO*')
    checkoutItems.forEach((i, idx) => {
      lines.push((idx + 1) + ') ' + i.quantity + 'x ' + i.name + ' — ' + money(i.price * i.quantity))
    })
    lines.push('')
    lines.push(sep)
    if (discount > 0) {
      lines.push('Subtotal: ' + money(subtotal))
      lines.push('Cupom ' + (coupon?.code ?? '') + ': -' + money(discount))
    }
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

    // WhatsApp: para Pix online (QR) NÃO abre agora — só depois do pagamento
    // aprovado (webhook). Se o usuário escolheu Pix online, o fluxo mostra o QR;
    // o WhatsApp será enviado pela loja após confirmação, ou o cliente pode
    // compartilhar o comprovante manualmente.
    const waNumber = String(store?.whatsapp ?? '').replace(/\D/g, '')
    let whatsappSent = false
    if (paymentMethod !== 'mercado_pago') {
      if (waNumber) {
        const waUrl = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(lines.join('\n'))
        const win = window.open(waUrl, '_blank')
        if (!win) window.location.href = waUrl
        whatsappSent = true
      } else {
        console.warn('[checkout] WhatsApp da loja não configurado em /admin/configuracoes — ' +
          'o pedido foi registrado, mas o resumo não foi aberto.')
      }
    } else {
      // Pix online: não abre WhatsApp antes do Pix ser pago. Deixa o QR em tela.
      whatsappSent = false
    }

    // Carrinho: com Pix online mantém até o pagamento confirmar (evita perder itens se o QR expirar)
    if (!directItems && paymentMethod !== 'mercado_pago') clearCart()
    if (paymentMethod === 'mercado_pago' && mpPix) {
      return { id: orderId, subtotal, discount, total: totalValue, whatsappSent, mpPix, paymentMethod }
    }
    if (paymentMethod === 'mercado_pago') {
      return { id: orderId, subtotal, discount, total: totalValue, whatsappSent, mpPix: null, paymentMethod, mpError: true, mpErrorDetail }
    }
    return { id: orderId, subtotal, discount, total: totalValue, whatsappSent, paymentMethod }
  }

  // Helper para polling do status do Pix (Orders API)
  const getOrderPaymentStatus = useCallback(async (orderId) => {
    const { data } = await supabase.from('orders').select('payment_status, status, mp_order_id').eq('id', orderId).maybeSingle()
    return data
  }, [])

  const checkMpOrderAgain = useCallback(async (orderId) => {
    // segue o gateway ativo (src/lib/payments.js); idempotente por pedido
    return await createPixOrder(orderId)
  }, [])

  return (
    <CartContext.Provider
      value={{ items, count, total, lastAdded, dismissLastAdded, addedToast, dismissAddedToast, addItem, updateQuantity, removeItem, clearCart, checkout, coupon, applyCoupon, removeCoupon, discountValue, refreshPrices, getOrderPaymentStatus, checkMpOrderAgain }}
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
