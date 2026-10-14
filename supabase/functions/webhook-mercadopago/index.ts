// supabase/functions/webhook-mercadopago/index.ts
// Webhook do Mercado Pago: aceita eventos de Payments (topic=payment) e
// de Orders (topic=order). Sempre confirma o estado REAL na API do MP antes
// de tocar no banco (payload forjado não altera pedido).
// URL para cadastrar no painel MP: https://SEU-PROJETO.supabase.co/functions/v1/webhook-mercadopago
// Requer secret: MP_ACCESS_TOKEN
// Opcional (recomendado): MP_WEBHOOK_SECRET para validar a assinatura x-signature
//
// IMPORTANTE: esta função precisa ser publicada com verify_jwt = false
// (ver supabase/config.toml) porque o Mercado Pago não envia Authorization.
// A autenticidade vem da assinatura x-signature.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string,string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Compara em tempo constante (evita vazar o hash por diferença de timing)
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Avisa a LOJA (e o cliente) no WhatsApp quando um Pix é confirmado.
// Delega para a function whatsapp-notify (Evolution API; se não estiver
// configurada, ela só confirma sem enviar mensagem).
async function notifyStoreOnPaid(supabase: any, orderId: string) {
  const SECRET = Deno.env.get('NOTIFY_SECRET')
  if (!SECRET) return // notificações desligadas
  try {
    const { data: o } = await supabase
      .from('orders').select('*').eq('id', orderId).maybeSingle()
    if (!o) return
    await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/whatsapp-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notify-secret': SECRET },
      body: JSON.stringify({ topic: 'order_paid', record: o }),
    })
  } catch (e) {
    console.warn('[webhook] aviso WhatsApp da loja falhou:', String(e))
  }
}

// Assinatura do MP: header "x-signature: ts=<ts>,v1=<hmac>"
// manifesto = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
async function verifySignature(req: Request, dataId: string, secret: string) {
  const raw = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  const parts: Record<string, string> = {}
  for (const piece of raw.split(',')) {
    const [k, v] = piece.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  }
  if (!parts.ts || !parts.v1) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return safeEqual(hex, parts.v1)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // MP testa webhook com GET às vezes
  if (req.method === 'GET') return json({ ok: true, hint: 'POST com { id, type } do Mercado Pago' })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
  if (!MP_TOKEN) return json({ error: 'MP_ACCESS_TOKEN não configurado' }, 500)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  // Formas possíveis:
  //   Payments: { type: 'payment', data: { id: '123456' } }  (ou antigo topic=payment)
  //   Orders:   { type: 'order' , data: { id: 'ORD...' } }
  const topic = String(body.type ?? body.topic ?? '').toLowerCase()
  const rawId = String(body.data?.id ?? body.id ?? body.resource ?? '').trim()
  const idFromResource = (() => {
    const r = String(body.resource ?? '')
    const m = r.match(/\/(orders|payments)\/([a-zA-Z0-9_-]+)/)
    return m ? m[2] : ''
  })()
  const resourceId = rawId || idFromResource

  // ---- Assinatura: obrigatória quando MP_WEBHOOK_SECRET está configurado ----
  const WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET')
  if (WEBHOOK_SECRET) {
    const dataId = String(body.data?.id ?? body.id ?? idFromResource ?? '')
    const ok = await verifySignature(req, dataId, WEBHOOK_SECRET)
    if (!ok) {
      console.warn('[webhook] assinatura inválida — payload descartado')
      return json({ error: 'Assinatura inválida' }, 401)
    }
  } else {
    console.warn('[webhook] MP_WEBHOOK_SECRET não configurado: respondendo sem validar a assinatura. ' +
      'Configure o secret em Edge Functions > Secrets.')
  }

  if (!resourceId) {
    console.warn('[webhook] payload sem id', JSON.stringify(body).slice(0, 1000))
    return json({ ok: true, ignored: true })
  }

  const isPayment = topic.includes('payment') || String(body.resource ?? '').includes('/payments/')

  let externalRef: string | null = null
  let mpStatus = ''
  let payId: string | null = null
  let ordId: string | null = null

  if (isPayment) {
    // ---- evento de PAYMENT (node atual: cobrança nasce via /v1/payments) ----
    try {
      const r = await fetch('https://api.mercadopago.com/v1/payments/' + resourceId, {
        headers: { Authorization: 'Bearer ' + MP_TOKEN },
      })
      const p = await r.json().catch(() => null)
      if (!r.ok) {
        console.error('[webhook] erro ao buscar payment', r.status, JSON.stringify(p).slice(0, 1500))
        return json({ ok: true, warn: 'mp fetch failed', status: r.status })
      }
      externalRef = p?.external_reference ?? null
      mpStatus = String(p?.status ?? '').toLowerCase()
      payId = String(p?.id ?? '')
    } catch (e) {
      console.error('[webhook] fetch exception', String(e))
      return json({ ok: true, warn: 'fetch exception' })
    }
  } else {
    // ---- evento de ORDER (legado) ----
    let mpOrder: any = null
    try {
      const r = await fetch('https://api.mercadopago.com/v1/orders/' + resourceId, {
        headers: { Authorization: 'Bearer ' + MP_TOKEN },
      })
      mpOrder = await r.json().catch(() => null)
      if (!r.ok) {
        console.error('[webhook] erro ao buscar MP order', r.status, JSON.stringify(mpOrder).slice(0, 1500))
        return json({ ok: true, warn: 'mp fetch failed', status: r.status })
      }
    } catch (e) {
      console.error('[webhook] fetch exception', String(e))
      return json({ ok: true, warn: 'fetch exception' })
    }
    externalRef = mpOrder?.external_reference ?? null
    const payment = mpOrder?.transactions?.payments?.[0] ?? null
    mpStatus = String(payment?.status ?? mpOrder?.status ?? '').toLowerCase()
    payId = payment?.id ? String(payment.id) : null
    ordId = mpOrder?.id ? String(mpOrder.id) : null
  }

  // Mapeia status MP -> payment_status + orders.status
  let payment_status: string | null = null
  let order_status: string | null = null
  if (['approved', 'authorized'].includes(mpStatus)) {
    payment_status = 'approved'
    order_status = 'confirmed'
  } else if (['rejected', 'cancelled', 'canceled', 'refunded', 'charged_back'].includes(mpStatus)) {
    payment_status = ['cancelled', 'canceled'].includes(mpStatus)
      ? 'cancelled'
      : ['refunded', 'charged_back'].includes(mpStatus) ? 'refunded' : 'rejected'
    order_status = 'cancelled'
  } else if (mpStatus === 'expired') {
    payment_status = 'expired'
    order_status = 'cancelled'
  } else if (['pending', 'processing', 'in_process', 'in_mediation'].includes(mpStatus)) {
    payment_status = 'pending'
  }

  // acha o pedido: external_reference (nosso orderId), senão pelos ids salvos
  let targetId: string | null = externalRef
  if (!targetId && payId) {
    const { data: found } = await supabase.from('orders').select('id').eq('mp_payment_id', payId).maybeSingle()
    targetId = found?.id ?? null
  }
  if (!targetId && ordId) {
    const { data: found } = await supabase.from('orders').select('id').eq('mp_order_id', ordId).maybeSingle()
    targetId = found?.id ?? null
  }
  if (!targetId) {
    console.warn('[webhook] pedido não achado para o recurso', resourceId)
    return json({ ok: true, ignored: true })
  }

  if (payment_status || order_status) {
    const upd: Record<string,string> = {}
    if (payment_status) upd.payment_status = payment_status
    if (order_status) upd.status = order_status
    if (payId) upd.mp_payment_id = payId
    if (ordId) upd.mp_order_id = ordId

    // estado anterior — o aviso no WhatsApp dispara UMA vez, na primeira
    // confirmação (o MP pode mandar o mesmo evento mais de uma vez)
    const { data: before } = await supabase.from('orders').select('payment_status').eq('id', targetId).maybeSingle()

    const { error } = await supabase.from('orders').update(upd).eq('id', targetId)
    if (error) {
      console.error('[webhook] update error', error.message)
      return json({ ok: false, error: error.message }, 500)
    }
    if (upd.payment_status === 'approved' && String(before?.payment_status ?? '').toLowerCase() !== 'approved') {
      await notifyStoreOnPaid(supabase, targetId)
    }
    return json({ ok: true, order_id: targetId, mp_status: mpStatus, payment_status, order_status })
  }

  return json({ ok: true, order_id: targetId, mp_status: mpStatus, ignored: true })
})
