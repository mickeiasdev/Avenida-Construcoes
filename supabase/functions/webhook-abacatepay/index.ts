// supabase/functions/webhook-abacatepay/index.ts
// Recebe os eventos da AbacatePay e confirma o pagamento do pedido.
// Docs: https://docs.abacatepay.com/pages/webhooks
//
// CONFIGURAÇÃO OBRIGATÓRIA:
//   verify_jwt = false (já está no supabase/config.toml): a AbacatePay NÃO envia
//     token do Supabase — o gateway do Supabase aceitaria apenas chamadas com JWT.
//   Webhook cadastrado (dashboard ou POST /v2/webhooks/create) apontando para:
//     https://SEU-PROJETO.supabase.co/functions/v1/webhook-abacatepay
//   com os eventos: transparent.completed, transparent.refunded,
//                   transparent.disputed, transparent.lost
//
// AUTENTICIDADE (duas camadas, como manda a documentação):
//   1) ?webhookSecret= na URL — comparado com o secret ABACATE_WEBHOOK_SECRET;
//      obrigatório quando configurado (recomendado sempre).
//   2) X-Webhook-Signature — HMAC-SHA256 do corpo cru com a CHAVE PÚBLICA da
//      AbacatePay (integridade do corpo). Conferida quando o header vier.
//
// Todo evento é confirmado no servidor da AbacatePay (GET /transparents/check)
// antes de tocar no pedido — payload forjado não muda nada no banco.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Comparação em tempo constante (mesma abordagem do webhook do Mercado Pago)
async function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  const ka = await crypto.subtle.importKey('raw', new TextEncoder().encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const kb = await crypto.subtle.importKey('raw', new TextEncoder().encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sa = new Uint8Array(await crypto.subtle.sign('HMAC', ka, new TextEncoder().encode('cmp')))
  const sb = new Uint8Array(await crypto.subtle.sign('HMAC', kb, new TextEncoder().encode('cmp')))
  let diff = 0
  for (let i = 0; i < sa.length; i++) diff |= sa[i] ^ sb[i]
  return diff === 0
}

// Chave pública oficial (docs.abacatepay.com/pages/webhooks/security) — valida só
// a integridade do corpo; a AUTENTICIDADE quem prova é o webhookSecret.
const ABACATE_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9'

async function hmacBase64(rawBody: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(ABACATE_PUBLIC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method === 'GET') return json({ ok: true, hint: 'POST com evento da AbacatePay (transparent.completed etc.)' })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const API_KEY = Deno.env.get('ABACATE_API_KEY')
  if (!API_KEY) return json({ error: 'ABACATE_API_KEY não configurada' }, 500)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const raw = await req.text()
  let body: any = {}
  try { body = JSON.parse(raw) } catch { body = {} }

  // ---- 1) secret na URL: obrigatório quando configurado ----
  const SECRET = Deno.env.get('ABACATE_WEBHOOK_SECRET')
  if (SECRET) {
    const incoming = new URL(req.url).searchParams.get('webhookSecret') ?? ''
    if (!(await safeEqual(incoming, SECRET))) {
      console.warn('[webhook-abacate] webhookSecret inválido — descartado')
      return json({ error: 'Unauthorized' }, 401)
    }
  } else {
    console.warn('[webhook-abacate] ABACATE_WEBHOOK_SECRET não configurado: aceitando sem validar a origem. ' +
      'Configure o secret no Supabase (Secrets) E no webhook da AbacatePay.')
  }

  // ---- 2) assinatura HMAC do corpo (integridade; conferida quando presente) ----
  const signature = req.headers.get('x-webhook-signature') ?? ''
  if (signature) {
    const expected = await hmacBase64(raw)
    if (!(await safeEqual(expected, signature))) {
      console.warn('[webhook-abacate] X-Webhook-Signature inválido — corpo descartado')
      return json({ error: 'Invalid signature' }, 401)
    }
  }

  const event = String(body?.event ?? body?.type ?? '')
  const chargeId: string = String(body?.data?.id ?? body?.id ?? '').trim()
  const orderIdFromMeta: string = String(body?.data?.metadata?.pedidoId ?? '').trim()
  console.log('[webhook-abacate] evento:', event, 'cobrança:', chargeId, 'pedido(meta):', orderIdFromMeta)

  if (!chargeId && !orderIdFromMeta) {
    console.warn('[webhook-abacate] payload sem id de cobrança', raw.slice(0, 1000))
    return json({ ok: true, ignored: true })
  }

  // ---- confirma o status na API (payload forjado não convence o banco) ----
  let status = ''
  if (chargeId) {
    try {
      const r = await fetch('https://api.abacatepay.com/v2/transparents/check?id=' + encodeURIComponent(chargeId), {
        headers: { Authorization: 'Bearer ' + API_KEY },
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        console.error('[webhook-abacate] check falhou', r.status, JSON.stringify(j).slice(0, 1500))
        return json({ ok: true, warn: 'check failed', status: r.status })
      }
      status = String(j?.data?.status ?? '')
    } catch (e) {
      console.error('[webhook-abacate] check exception', String(e))
      return json({ ok: true, warn: 'check exception' })
    }
  }

  // ---- acha o pedido: por payment_ref, senão pelo metadata.pedidoId ----
  let orderId: string | null = null
  if (chargeId) {
    const { data: found } = await supabase
      .from('orders').select('id, status, payment_status')
      .eq('payment_provider', 'abacatepay').eq('payment_ref', chargeId).maybeSingle()
    orderId = found?.id ?? null
  }
  if (!orderId && orderIdFromMeta) {
    const { data: found } = await supabase.from('orders').select('id').eq('id', orderIdFromMeta).maybeSingle()
    orderId = found?.id ?? null
  }
  if (!orderId) {
    console.warn('[webhook-abacate] pedido não achado para a cobrança', chargeId)
    return json({ ok: true, ignored: true })
  }

  // ---- mapeia status AbacatePay -> payment_status + orders.status ----
  const upd: Record<string, string> = {}
  if (status === 'PAID') {
    upd.payment_status = 'approved'
    upd.status = 'confirmed'
  } else if (status === 'EXPIRED' || status === 'CANCELLED') {
    upd.payment_status = status === 'EXPIRED' ? 'expired' : 'cancelled'
    upd.status = 'cancelled'
  }

  if (Object.keys(upd).length) {
    const { error } = await supabase.from('orders').update(upd).eq('id', orderId)
    if (error) {
      console.error('[webhook-abacate] falha ao atualizar pedido', error.message)
      return json({ ok: false, error: error.message }, 500)
    }
  }

  return json({ ok: true, order_id: orderId, event, charge_status: status, applied: upd })
})
