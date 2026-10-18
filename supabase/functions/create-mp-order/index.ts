// supabase/functions/create-mp-order/index.ts
// Edge Function: cria uma cobrança Pix no Mercado Pago (Payments API) com
// QR Code + Copia e Cola. Chamada DEPOIS que o place_order já criou o pedido
// no Supabase. Requer secret: MP_ACCESS_TOKEN
//
// NOTA: usamos POST /v1/payments (não a Orders API): ela devolve o QR do Pix
// na própria resposta (também em modo teste), síncrono. A Orders API devolve
// sem QR ("waiting_transfer") e a cobrança só se materializa depois.
//
// Segurança: roda com service_role (ignora RLS), então valida o CHAMADOR
// antes de tocar em qualquer coisa:
//   • pedido com dono  -> só o próprio dono (ou admin) gera/lê o Pix;
//   • pedido de visitante -> o próprio orderId (UUID v4, gerado no navegador)
//     é a credencial; pedido cancelado é recusado — mas "já pago" é
//     RESPONDIDO (é assim que a tela do visitante descobre a confirmação);
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

// Payments API devolve o QR obrigatoriamente aqui quando o Pix é criado
const txOf = (payment: any) => payment?.point_of_interaction?.transaction_data ?? null

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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // ---------- quem está chamando? ----------
  const authHeader = req.headers.get('Authorization') ?? ''
  // tira o prefixo "Bearer " DE VERDADE: a regex antiga ("Bearers+") não casava
  // com o espaço — o token ia com prefixo colado, o getUser falhava e o cliente
  // LOGADO tomava "Faça login para pagar este pedido" (visitante não sofria).
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let callerId: string | null = null
  if (token) {
    const { data } = await supabase.auth.getUser(token)
    callerId = data?.user?.id ?? null
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, total, customer_name, payment_method, payment_status, mp_order_id, mp_payment_id, status, user_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr || !order) return json({ error: 'Pedido não encontrado', details: orderErr?.message }, 404)

  // ---------- autorização ----------
  if (order.user_id) {
    if (!callerId) return json({ error: 'Faça login para pagar este pedido.' }, 401)
    if (callerId !== order.user_id) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', callerId).maybeSingle()
      if (prof?.role !== 'admin') return json({ error: 'Pedido não encontrado' }, 404)
    }
  } else {
    const ps = String(order.payment_status ?? '').toLowerCase()
    if (order.status === 'cancelled' || ['cancelled', 'canceled', 'rejected', 'expired'].includes(ps)) {
      return json({ error: 'Pedido não encontrado' }, 404)
    }
  }

  // ---------- nunca cobrar duas vezes ----------
  if (String(order.payment_status ?? '').toLowerCase() === 'approved') {
    return json({ status: 'approved', already_paid: true, mp_payment_id: order.mp_payment_id ?? null })
  }

  const mpHeaders = { Authorization: 'Bearer ' + MP_TOKEN, 'Content-Type': 'application/json' }

  // ---------- reutiliza a cobrança já criada para ESTE pedido ----------
  // Caminho atual: mp_payment_id (Payments API).    Legado: mp_order_id (Orders API).
  if (order.mp_payment_id) {
    try {
      const r = await fetch('https://api.mercadopago.com/v1/payments/' + order.mp_payment_id, { headers: mpHeaders })
      if (r.ok) {
        const p = await r.json()
        const st = String(p?.status ?? '').toLowerCase()
        if (st === 'approved') {
          await supabase.from('orders').update({ payment_status: 'approved', status: 'confirmed' }).eq('id', orderId)
          return json({ status: 'approved', already_paid: true, mp_payment_id: order.mp_payment_id })
        }
        const tx = txOf(p)
        if (tx?.qr_code) {
          return json({
            mp_payment_id: String(p.id),
            qr_code: tx.qr_code,
            qr_code_base64: tx.qr_code_base64 ?? null,
            ticket_url: tx.ticket_url ?? null,
            status: p.status ?? 'pending',
            mp_status_detail: p.status_detail ?? null,
            reused: true,
          })
        }
        // pagamento ainda processando sem QR? cria um novo abaixo
      }
    } catch { /* fallback: recria */ }
  } else if (order.mp_order_id) {
    // Legado (Orders API): tenta devolver o QR re-lendo a order
    try {
      const r = await fetch('https://api.mercadopago.com/v1/orders/' + order.mp_order_id, { headers: mpHeaders })
      if (r.ok) {
        const mpOrder = await r.json()
        const pay = mpOrder?.transactions?.payments?.[0]
        const tx = pay?.point_of_interaction?.transaction_data
        if (tx?.qr_code) {
          return json({
            mp_order_id: mpOrder.id,
            mp_payment_id: pay?.id ?? null,
            qr_code: tx.qr_code,
            qr_code_base64: tx.qr_code_base64 ?? null,
            ticket_url: tx.ticket_url ?? null,
            status: pay?.status ?? mpOrder.status,
            reused: true,
          })
        }
      }
    } catch { /* segue para criar um Pix novo abaixo */ }
  }

  const amount = Number(order.total)
  if (!Number.isFinite(amount) || amount < 0.01) return json({ error: 'Total do pedido inválido' }, 400)

  // Payer: o MP exige email válido. Cliente logado usa o real; visitante usa
  // um sintético com TLD público (o MP recusava "@sualoja.local" com 402).
  let emailForMp = Deno.env.get('MP_FALLBACK_PAYER_EMAIL') || ('pix-' + orderId.slice(0, 8) + '@sualoja.store')
  if (order.user_id) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(order.user_id)
      if (userData?.user?.email) emailForMp = userData.user.email
    } catch { /* usa o sintético */ }
  }

  // ---------- cria o Pix (Payments API: QR vem na resposta, até em teste) ----------
  const payload = {
    transaction_amount: Number(amount.toFixed(2)),
    payment_method_id: 'pix',
    description: 'Pedido ' + orderId.slice(0, 8),
    external_reference: orderId,   // <- é assim que o webhook acha o pedido
    payer: { email: emailForMp },
    notification_url: Deno.env.get('MP_WEBHOOK_URL') ?? undefined,
  }

  const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: { ...mpHeaders, 'X-Idempotency-Key': orderId },
    body: JSON.stringify(payload),
  })
  const mpData = await mpRes.json().catch(() => ({}))

  if (!mpRes.ok || !mpData?.id) {
    console.error('[create-mp-order] MP error', mpRes.status, JSON.stringify(mpData).slice(0, 2000))
    return json({ error: 'Erro ao criar Pix no Mercado Pago', details: mpData, mp_status: mpRes.status }, 502)
  }

  const tx = txOf(mpData)

  // Persiste o payment id no pedido (webhook + retries futuros)
  await supabase.from('orders').update({
    mp_payment_id: String(mpData.id),
    payment_status: 'pending',
    payment_method: 'mercado_pago', // enum histórico = "Pix online gerado"
  }).eq('id', orderId)

  return json({
    mp_payment_id: String(mpData.id),
    qr_code: tx?.qr_code ?? null,               // <-- Pix Copia e Cola
    qr_code_base64: tx?.qr_code_base64 ?? null, // <-- Imagem do QR Code
    ticket_url: tx?.ticket_url ?? null,
    status: mpData.status ?? 'pending',
    mp_status_detail: mpData.status_detail ?? null,
  })
})
