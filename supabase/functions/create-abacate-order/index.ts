// supabase/functions/create-abacate-order/index.ts
// Edge Function: cria uma cobrança PIX na AbacatePay (Checkout Transparente)
// com QR Code + Copia e Cola. Chamada DEPOIS que o place_order já criou
// o pedido no Supabase. O frontend resolve o nome desta função via
// src/lib/payments.js (PIX_FUNCTION).
// Docs: https://docs.abacatepay.com (POST /v2/transparents/create)
//
// Requer secrets:
//   ABACATE_API_KEY        — chave com permissões TRANSPARENT:CREATE e TRANSPARENT:READ
//   MP_FALLBACK... não se aplica aqui; guest sem e-mail vai SEM customer (API permite).
//
// Segurança (roda com service_role, então valida o CHAMADOR antes):
//   • pedido com dono  -> só o dono (ou admin) gera/lê o Pix;
//   • pedido de visitante -> o orderId (UUID v4) é a credencial; cancelado
//     é recusado; pago é RESPONDIDO (never double-charge).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string, string> = {
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

// A resposta traz brCodeBase64 já com prefixo "data:image/png;base64,";
// o front monta o src ele mesmo, então o prefixo sai aqui.
const stripDataUri = (v: string | null | undefined) =>
  String(v ?? '').replace(/^data:image\/[a-z]+;base64,/i, '') || null

type AcpStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | string
const mapStatus = (s: AcpStatus) =>
  s === 'PAID' ? 'approved' : s === 'EXPIRED' ? 'expired' : s === 'CANCELLED' ? 'cancelled' : 'pending'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const API_KEY = Deno.env.get('ABACATE_API_KEY')
  if (!API_KEY) return json({ error: 'ABACATE_API_KEY não configurada nos Secrets da Edge Function' }, 500)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const body = await req.json().catch(() => ({}))
  const orderId = String(body?.orderId ?? '').trim()
  if (!orderId) return json({ error: 'orderId é obrigatório' }, 400)

  const acpFetch = (path: string, init: RequestInit = {}) =>
    fetch('https://api.abacatepay.com/v2' + path, {
      ...init,
      headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })

  // ---------- identifica o chamador ----------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let callerId: string | null = null
  if (token) {
    const { data } = await supabase.auth.getUser(token)
    callerId = data?.user?.id ?? null
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, total, customer_name, payment_method, payment_status, payment_provider, payment_ref, payment_qr_code, payment_qr_base64, status, user_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderErr && String(orderErr.message).includes('payment_provider')) {
    return json({ error: 'Colunas de gateway ausentes: rode a supabase/migration-15.sql no SQL Editor' }, 500)
  }
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
    return json({ status: 'approved', already_paid: true, payment_ref: order.payment_ref ?? null })
  }

  // ---------- reutiliza a cobrança já criada para ESTE pedido ----------
  if (order.payment_provider === 'abacatepay' && order.payment_ref) {
    try {
      const r = await acpFetch('/transparents/check?id=' + encodeURIComponent(order.payment_ref))
      const j = await r.json().catch(() => null)
      const st = mapStatus(String(j?.data?.status ?? ''))
      if (st === 'approved') {
        await supabase.from('orders').update({ payment_status: 'approved', status: 'confirmed' }).eq('id', orderId)
        return json({ status: 'approved', already_paid: true, payment_ref: order.payment_ref })
      }
      if (st === 'pending' && order.payment_qr_code) {
        // QR guardado no pedido (a AbacatePay não tem endpoint para re-ler o brCode)
        return json({
          qr_code: order.payment_qr_code,
          qr_code_base64: order.payment_qr_base64 ?? null,
          ticket_url: null,
          payment_ref: order.payment_ref,
          status: 'pending',
          reused: true,
        })
      }
      if (st === 'pending') {
        return json({ status: 'pending', payment_ref: order.payment_ref, qr_pending: true })
      }
      // expired/cancelled -> cai para criar uma cobrança nova abaixo
    } catch { /* cria uma nova */ }
  }

  const amountCents = Math.round(Number(order.total) * 100)
  if (!Number.isFinite(amountCents) || amountCents < 100) {
    return json({ error: 'Total do pedido inválido (mínimo R$ 1,00)' }, 400)
  }

  // ---------- cria a cobrança PIX ----------
  const payload: Record<string, unknown> = {
    method: 'PIX',
    data: {
      amount: amountCents,
      description: 'Pedido ' + orderId.slice(0, 8),
      expiresIn: 3600,
      metadata: { pedidoId: orderId },
    },
  }
  // customer é opcional no PIX. Só envia com dados de verdade (cliente logado
  // tem e-mail; visitante fica sem — melhor que inventar dado).
  if (order.user_id) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(order.user_id)
      const email = userData?.user?.email
      if (email) {
        (payload.data as Record<string, unknown>).customer = {
          name: order.customer_name ?? 'Cliente',
          email,
          cellphone: userData?.user?.phone ?? undefined,
        }
      }
    } catch { /* sem customer */ }
  }

  const res = await acpFetch('/transparents/create', { method: 'POST', body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))

  if (!res.ok || !data?.data?.brCode) {
    console.error('[create-abacate-order] erro da AbacatePay', res.status, JSON.stringify(data).slice(0, 2000))
    return json({ error: 'Erro ao criar Pix na AbacatePay', details: data, acp_status: res.status }, 502)
  }

  const charge = data.data
  const qrBase64 = stripDataUri(charge.brCodeBase64)

  // guarda a cobrança no pedido (migration-15): QR volta rápido no retry e o
  // webhook acha o pedido por payment_ref
  await supabase.from('orders').update({
    payment_provider: 'abacatepay',
    payment_ref: String(charge.id),
    payment_qr_code: String(charge.brCode),
    payment_qr_base64: qrBase64,
    payment_status: 'pending',
    payment_method: 'mercado_pago', // valor legado = "Pix online gerado" (ver PAYMENT_LABELS)
  }).eq('id', orderId)

  return json({
    qr_code: charge.brCode,            // Pix Copia e Cola
    qr_code_base64: qrBase64,          // imagem PNG (sem prefixo data:)
    ticket_url: null,
    payment_ref: charge.id,
    status: mapStatus(charge.status ?? 'PENDING'),
    expires_at: charge.expiresAt ?? null,
  })
})
