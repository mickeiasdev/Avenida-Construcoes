// supabase/functions/create-mp-order/index.ts
// Edge Function: cria uma Order no Mercado Pago (Orders API v1) para Pix
// com QR Code + Copia e Cola. Chamado DEPOIS que o place_order já criou
// o pedido no Supabase.
// Requer secret: MP_ACCESS_TOKEN
//
// Segurança: roda com service_role (ignora RLS), então valida o CHAMADOR
// antes de tocar em qualquer coisa:
//   • pedido com dono  -> só o próprio dono (ou admin) gera/lê o Pix;
//   • pedido de visitante -> o próprio orderId (UUID v4, gerado no navegador)
//     é a credencial; pedido já pago ou cancelado é recusado;
//   • qualquer outro caso recebe 404 (não confirma se o pedido existe).

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

  // ---------- quem está chamando? ----------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let callerId: string | null = null
  if (token) {
    const { data } = await supabase.auth.getUser(token)
    callerId = data?.user?.id ?? null
  }

  // Busca pedido (com o estado necessário para autorizar)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, total, customer_name, payment_method, payment_status, mp_order_id, status, user_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr || !order) return json({ error: 'Pedido não encontrado', details: orderErr?.message }, 404)

  // ---------- autorização ----------
  if (order.user_id) {
    // pedido de cliente logado: só o dono (ou um admin, que pode reenviar o Pix)
    if (!callerId) return json({ error: 'Faça login para pagar este pedido.' }, 401)
    if (callerId !== order.user_id) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', callerId).maybeSingle()
      if (prof?.role !== 'admin') return json({ error: 'Pedido não encontrado' }, 404)
    }
  } else {
    // pedido de visitante: não tem sessão, então o orderId é a credencial
    // (mesma lógica de link mágico). Aceitamos só pedido que ainda pode ser
    // pago — mas "já pago" precisa ser RESPONDIDO, não 404: é assim que a tela
    // do Pix do visitante descobre que o webhook confirmou o pagamento.
    const ps = String(order.payment_status ?? '').toLowerCase()
    if (order.status === 'cancelled' || ['cancelled', 'canceled', 'rejected', 'expired'].includes(ps)) {
      return json({ error: 'Pedido não encontrado' }, 404)
    }
  }

  // ---------- nunca cobrar duas vezes ----------
  // Pedido já aprovado devolve o status salvo, sem criar uma segunda cobrança
  // (antes isso só era checado no ramo do visitante, e o re-fetch do MP podia
  // cair no caminho de CRIAÇÃO de uma nova Order).
  if (String(order.payment_status ?? '').toLowerCase() === 'approved') {
    return json({ status: 'approved', already_paid: true, mp_order_id: order.mp_order_id ?? null })
  }

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

  const amount = Number(order.total)
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Total do pedido inválido' }, 400)

  // Payer: o MP exige email válido. Usa o email real do cliente logado;
  // visitante cai num email sintético — com TLD público (.store), porque o MP
  // rejeitava o antigo "@sualoja.local" com processing_error (402).
  // Dá para trocar pelo secret MP_FALLBACK_PAYER_EMAIL.
  let emailForMp = Deno.env.get('MP_FALLBACK_PAYER_EMAIL') || `pix-${orderId.slice(0, 8)}@sualoja.store`
  if (order.user_id) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(order.user_id)
      if (userData?.user?.email) emailForMp = userData.user.email
    } catch { /* usa o sintético */ }
  }

  const payload = {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: orderId,
    total_amount: amount.toFixed(2),
    transactions: {
      payments: [
        {
          amount: amount.toFixed(2),
          payment_method: { id: 'pix', type: 'bank_transfer' },
        },
      ],
    },
    payer: { email: emailForMp },
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
  let tx = payment?.point_of_interaction?.transaction_data
  const mpOrderId = mpData?.id ?? null
  const mpPaymentId = payment?.id ?? null

  // Persiste IDs no pedido para o webhook e para o botão "Ver QR Pix"
  if (mpOrderId) {
    await supabase.from('orders').update({
      mp_order_id: String(mpOrderId),
      mp_payment_id: mpPaymentId ? String(mpPaymentId) : null,
      payment_status: 'pending',
      payment_method: 'mercado_pago',
    }).eq('id', orderId)
  }

  // O MP pode CRIAR a ordem antes de processar o Pix (status "processing"):
  // a cobrança é gerada alguns segundos depois — sem este retry o site dizia
  // "não conseguimos gerar o Pix" mesmo com a cobrança pronta (o cliente até
  // recebia o e-mail da cobrança!). Relembra a Order algumas vezes.
  if (!tx?.qr_code && mpOrderId) {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/orders/${mpOrderId}`, {
          headers: { Authorization: `Bearer ${MP_TOKEN}` },
        })
        if (r.ok) {
          const refreshed = await r.json()
          const tx2 = refreshed?.transactions?.payments?.[0]?.point_of_interaction?.transaction_data
          if (tx2?.qr_code) { tx = tx2; break }
        }
      } catch { /* tenta de novo */ }
    }
  }

  return json({
    mp_order_id: mpOrderId,
    mp_payment_id: mpPaymentId,
    qr_code: tx?.qr_code ?? null,               // <-- Pix Copia e Cola
    qr_code_base64: tx?.qr_code_base64 ?? null, // <-- Imagem do QR Code
    ticket_url: tx?.ticket_url ?? null,
    status: payment?.status ?? mpData?.status ?? 'pending',
    mp_status_detail: payment?.status_detail ?? mpData?.status_detail ?? null,
  })
})
