// supabase/functions/create-mp-order/index.ts
// Edge Function: cria uma Order no Mercado Pago (Orders API v1) para Pix
// com QR Code + Copia e Cola. Chamado DEPOIS que o place_order já criou
// o pedido no Supabase.
// Requer secret: MP_ACCESS_TOKEN (Access Token do Mercado Pago)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string,string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
  if (!MP_TOKEN) return json({ error: 'MP_ACCESS_TOKEN não configurado nos Secrets da Edge Function' }, 500)

  let orderId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    orderId = (body.orderId ?? body.order_id ?? '').toString().trim() || null
  } catch { /* ignore */ }
  if (!orderId) return json({ error: 'orderId é obrigatório' }, 400)

  // Supabase client com service_role para ler o pedido independente de RLS
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Busca pedido + itens
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, total, customer_name, payment_method, payment_status, mp_order_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr || !order) return json({ error: 'Pedido não encontrado', details: orderErr?.message }, 404)

  // Se já existe mp_order_id, retorna os dados salvos (idempotência)
  if (order.mp_order_id) {
    // Tenta buscar a order no MP para devolver o QR atualizado
    try {
      const r = await fetch(`https://api.mercadopago.com/v1/orders/${order.mp_order_id}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      })
      if (r.ok) {
        const mpOrder = await r.json()
        const pay = mpOrder?.transactions?.payments?.[0]
        const tx = pay?.point_of_interaction?.transaction_data
        if (tx?.qr_code) {
          return json({
            mp_order_id: mpOrder.id,
            mp_payment_id: pay.id ?? null,
            qr_code: tx.qr_code,
            qr_code_base64: tx.qr_code_base64 ?? null,
            ticket_url: tx.ticket_url ?? null,
            status: pay.status ?? mpOrder.status,
            reused: true,
          })
        }
      }
    } catch { /* fallback: recria abaixo */ }
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, unit_price')
    .eq('order_id', orderId)

  const amount = Number(order.total)
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Total do pedido inválido' }, 400)

  // Payer: o MP exige email válido; visitante usa email sintético
  const payerEmail = (order as any).customer_name
    ? `${orderId.slice(0,8)}@sualoja.local`
    : `${orderId.slice(0,8)}@sualoja.local`
  // Tenta usar email real se o pedido tiver user_id
  let emailForMp = payerEmail
  try {
    const { data: fullOrder } = await supabase.from('orders').select('user_id').eq('id', orderId).maybeSingle()
    if (fullOrder?.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(fullOrder.user_id)
      if (userData?.user?.email) emailForMp = userData.user.email
    }
  } catch { /* usa sintético */ }

  const payload = {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: orderId,
    total_amount: amount.toFixed(2),
    // Expira em 30 minutos (MP aceita date string ou minutes)
    // Usamos 30 min para Pix não ficar pendurado o dia todo
    transactions: {
      payments: [
        {
          amount: amount.toFixed(2),
          payment_method: { id: 'pix', type: 'bank_transfer' },
        },
      ],
    },
    payer: { email: emailForMp },
    // Expiração do Pix (opcional, mas recomendado)
    // O MP respeita 'expiration_time' em alguns fluxos; manter sem expirar também funciona
  }

  const mpRes = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderId,
    },
    body: JSON.stringify(payload),
  })

  const mpData = await mpRes.json().catch(() => ({}))

  if (!mpRes.ok) {
    console.error('[create-mp-order] MP error', mpRes.status, JSON.stringify(mpData).slice(0, 2000))
    return json({ error: 'Erro ao criar Pix no Mercado Pago', details: mpData, mp_status: mpRes.status }, 502)
  }

  const payment = mpData?.transactions?.payments?.[0]
  const tx = payment?.point_of_interaction?.transaction_data
  const mpOrderId = mpData?.id ?? null
  const mpPaymentId = payment?.id ?? null

  // Persiste IDs no pedido para o webhook
  if (mpOrderId) {
    await supabase.from('orders').update({
      mp_order_id: String(mpOrderId),
      mp_payment_id: mpPaymentId ? String(mpPaymentId) : null,
      payment_status: 'pending',
      payment_method: 'mercado_pago',
    }).eq('id', orderId)
  }

  return json({
    mp_order_id: mpOrderId,
    mp_payment_id: mpPaymentId,
    qr_code: tx?.qr_code ?? null,              // <-- Pix Copia e Cola
    qr_code_base64: tx?.qr_code_base64 ?? null, // <-- Imagem do QR Code
    ticket_url: tx?.ticket_url ?? null,
    status: payment?.status ?? mpData?.status ?? 'pending',
  })
})
