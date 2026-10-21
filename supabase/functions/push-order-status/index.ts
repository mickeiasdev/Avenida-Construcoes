// ============================================================
// push-order-status — notificação Web Push ao cliente (PWA)
// ------------------------------------------------------------
// O painel chama esta function depois de mudar o status de um
// pedido: ela lê as assinaturas push do cliente na tabela
// push_subscriptions (migration-35) e envia a notificação
// "seu pedido saiu para entrega 🚚" no celular de quem ativou.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   — chave pública VAPID (npx web-push generate-vapid-keys)
//   VAPID_PRIVATE_KEY  — chave privada VAPID
//   VAPID_SUBJECT      — "mailto:contato@sualoja.com" (opcional)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetados automaticamente
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const STATUS_TEXT: Record<string, string> = {
  pending: 'Pedido recebido! Vamos confirmar em instantes. 🧾',
  confirmed: 'Pedido confirmado! Já estamos preparando. ✅',
  preparing: 'Seu pedido está sendo separado. 📦',
  shipping: 'Seu pedido saiu para entrega! 🚚',
  delivered: 'Pedido entregue! Obrigado pela compra 🎉',
  cancelled: 'Seu pedido foi cancelado. Qualquer dúvida, fale com a loja.',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  let orderId = ''
  try {
    const body = await req.json()
    orderId = String(body?.order_id ?? '')
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }
  if (!orderId) return json({ error: 'order_id obrigatório.' }, 400)

  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  // VAPID ausente: o push ainda não foi configurado — responde OK para
  // não "quebrar" a mudança de status no painel (feature é opcional)
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ skipped: 'VAPID não configurado' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, user_id')
    .eq('id', orderId)
    .maybeSingle()
  // pedido sem dono (visitante) ou inexistente: nada a fazer, sem erro
  if (!order?.user_id) return json({ skipped: 'pedido sem usuário (visitante)' })

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', order.user_id)
  if (!subs?.length) return json({ skipped: 'cliente sem assinatura push' })

  const { data: settings } = await supabase
    .from('store_settings')
    .select('store_name')
    .eq('id', 1)
    .maybeSingle()
  const storeName = settings?.store_name ?? 'Sua loja'

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@loja.com.br',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  )

  const payload = JSON.stringify({
    title: storeName,
    body: STATUS_TEXT[order.status] ?? 'Atualização no seu pedido.',
    url: '/pedidos',
  })

  let sent = 0
  let removed = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
        { TTL: 3600, urgency: 'normal' },
      )
      sent++
    } catch (err) {
      // 404/410: assinatura morreu (app desinstalado) → limpa a tabela
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        removed++
      }
    }
  }

  return json({ sent, removed, status: order.status })
})
