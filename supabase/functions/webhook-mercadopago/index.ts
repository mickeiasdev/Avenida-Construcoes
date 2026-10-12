// supabase/functions/webhook-mercadopago/index.ts
// Webhook do Mercado Pago para Orders API (topic=order)
// URL para cadastrar no painel MP: https://SEU-PROJETO.supabase.co/functions/v1/webhook-mercadopago
// Requer secret: MP_ACCESS_TOKEN
// Opcional: MP_WEBHOOK_SECRET para validar assinatura (x-signature)

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

  // MP Orders API pode enviar { id, type: 'order', data: { id } } ou variação
  const mpOrderId = String(body.id ?? body.data?.id ?? body.resource ?? '').trim()
  // Alguns eventos antigos mandam resource like https://api.mercadopago.com/v1/orders/xxx
  const idFromResource = (() => {
    const r = String(body.resource ?? '')
    const m = r.match(/\/orders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : ''
  })()
  const orderIdToFetch = mpOrderId || idFromResource

  if (!orderIdToFetch) {
    console.warn('[webhook] payload sem id', JSON.stringify(body).slice(0, 1000))
    return json({ ok: true, ignored: true })
  }

  // Busca a order no MP para ler status autoritativo
  let mpOrder: any = null
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/orders/${orderIdToFetch}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
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

  const externalRef: string | null = mpOrder?.external_reference ?? null
  const payment = mpOrder?.transactions?.payments?.[0] ?? null
  const mpStatus: string = String(payment?.status ?? mpOrder?.status ?? '').toLowerCase()

  // Mapeia status MP -> payment_status + orders.status
  let payment_status: string | null = null
  let order_status: string | null = null
  if (['approved', 'authorized'].includes(mpStatus)) {
    payment_status = 'approved'
    order_status = 'confirmed'
  } else if (['rejected', 'cancelled', 'canceled'].includes(mpStatus)) {
    payment_status = mpStatus === 'cancelled' || mpStatus === 'canceled' ? 'cancelled' : 'rejected'
    order_status = 'cancelled'
  } else if (['expired'].includes(mpStatus)) {
    payment_status = 'expired'
    order_status = 'cancelled'
  } else if (['pending', 'processing', 'in_process'].includes(mpStatus)) {
    payment_status = 'pending'
  }

  if (!externalRef) {
    // tenta achar pelo mp_order_id caso external_reference não venha
    const { data: found } = await supabase.from('orders').select('id').eq('mp_order_id', String(mpOrder.id)).maybeSingle()
    if (found?.id) {
      if (payment_status || order_status) {
        const upd: Record<string,string> = {}
        if (payment_status) upd.payment_status = payment_status
        if (order_status) upd.status = order_status
        if (payment?.id) upd.mp_payment_id = String(payment.id)
        await supabase.from('orders').update(upd).eq('id', found.id)
      }
      return json({ ok: true, order_id: found.id, mp_status: mpStatus, payment_status, order_status })
    }
    console.warn('[webhook] sem external_reference e sem match por mp_order_id', mpOrder.id)
    return json({ ok: true, ignored: true })
  }

  if (payment_status || order_status) {
    const upd: Record<string,string> = {}
    if (payment_status) upd.payment_status = payment_status
    if (order_status) upd.status = order_status
    if (payment?.id) upd.mp_payment_id = String(payment.id)
    // garante que o mp_order_id fica gravado
    upd.mp_order_id = String(mpOrder.id)

    const { error } = await supabase.from('orders').update(upd).eq('id', externalRef)
    if (error) console.error('[webhook] update error', error.message)
    return json({ ok: true, order_id: externalRef, mp_status: mpStatus, payment_status, order_status })
  }

  return json({ ok: true, mp_status: mpStatus, ignored: true })
})
