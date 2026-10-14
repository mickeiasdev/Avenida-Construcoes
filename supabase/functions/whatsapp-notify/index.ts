// supabase/functions/whatsapp-notify/index.ts
// Central de mensagens de WhatsApp da loja (automáticas).
//
// Canal principal: Evolution API (self-hosted — pareia o número como um
// WhatsApp Web: atendimento manual no celular e mensagens automáticas do
// sistema convivem no mesmo número).
// Plano B (grátis): CallMeBot — só para a LOJA (a loja faz o opt-in uma vez;
// para cliente não funciona sem ele autorizar).
//
// Quem chama:
//   • webhook-mercadopago  -> topic "order_paid"   (pedido pago no site)
//   • Database Webhooks    -> INSERT em orders (pedido novo) e UPDATE
//     (mudança de status) — cadastro manual em Database → Webhooks (README).
//
// Segurança: verify_jwt = false é necessário (DB webhooks/function→function
// não carregam JWT), então TODA chamada exige x-notify-secret = NOTIFY_SECRET.
// Sem NOTIFY_SECRET configurado a função não faz nada (default OFF).
//
// Secrets:
//   NOTIFY_SECRET        — senha interna sua (mesma em webhook→function e DB webhooks)
//   EVOLUTION_API_URL    — ex.: https://evo.seuvps.com.br
//   EVOLUTION_API_KEY    — chave global da Evolution
//   EVOLUTION_INSTANCE   — nome da instância pareada por QR (ex.: loja)
//   NOTIFY_TO            — opcional: número que recebe os avisos de pedido
//                          (padrão: o WhatsApp das configurações da loja)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const brPhone = (v: unknown) => {
  const d = onlyDigits(v)
  if (d.length < 10) return null
  return d.length <= 11 ? '55' + d : d
}
const money = (n: unknown) => 'R$ ' + Number(n ?? 0).toFixed(2).replace('.', ',')

// rótulos de etapa (espelho de ORDER_LABELS do app; função vive isolada)
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pedido recebido',
  confirmed: 'Pagamento confirmado e pedido em preparo',
  preparing: 'Separando seus itens',
  shipping: 'Saiu para entrega 🚚',
  delivered: 'Entrega concluída ✅',
}

async function sendEvo(url: string, key: string, instance: string, number: string, text: string) {
  const r = await fetch(url.replace(/\/$/, '') + '/message/sendText/' + encodeURIComponent(instance), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number, text }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    console.warn('[whatsapp-notify] Evolution recusou', r.status, t.slice(0, 300))
  }
  return r.ok
}

async function sendCmb(number: string, text: string, apikey: string) {
  const u = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent('+' + number) +
    '&text=' + encodeURIComponent(text) + '&apikey=' + encodeURIComponent(apikey)
  const r = await fetch(u)
  return r.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method === 'GET') return json({ ok: true, hint: 'POST com { type, record } (DB webhook) ou { topic, record } (payment webhook)' })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ---------- trava de chamada: só quem sabe o segredo ----------
  const SECRET = Deno.env.get('NOTIFY_SECRET') ?? ''
  if (!SECRET) return json({ ok: false, error: 'NOTIFY_SECRET não configurado — notificações desligadas' }, 500)
  const incoming = req.headers.get('x-notify-secret') ?? new URL(req.url).searchParams.get('secret') ?? ''
  if (incoming !== SECRET) return json({ error: 'Unauthorized' }, 401)

  const EV_URL = Deno.env.get('EVOLUTION_API_URL') ?? ''
  const EV_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? ''
  const EV_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? ''
  const evoReady = Boolean(EV_URL && EV_KEY && EV_INSTANCE)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const body = await req.json().catch(() => ({}))
  // aceita o formato de Database Webhook do Supabase { type, record, old_record }
  // e o formato interno { topic, record } usado pelo webhook de pagamento
  const topic = body.topic ?? null
  const dbType = body.type ?? null
  const record = body.record ?? null
  if (!record?.id) return json({ ok: true, ignored: 'sem record' })

  const [{ data: settings }] = await Promise.all([
    supabase.from('store_settings').select('store_name, whatsapp, notify_whatsapp_key').eq('id', 1).maybeSingle(),
  ])
  // Para quem os avisos de pedido vão? NOTIFY_TO (secret opcional) primeiro —
  // ideal: seu número PESSOAL, porque o número pareado na Evolution é o da loja.
  // Se vazio, cai no WhatsApp público da loja (configurações).
  const storePhone = brPhone(Deno.env.get('NOTIFY_TO')) ?? brPhone(settings?.whatsapp)

  const storeName = settings?.store_name ?? 'Loja'
  const orderShort = String(record.id).slice(0, 8)
  const cliente = String(record.customer_name ?? 'Cliente')
  const clientePhone = brPhone(record.customer_phone)
  const entrega = record.delivery_method === 'retirada' ? 'Retirada no balcão' : record.delivery_method === 'misto' ? 'Retirada + entrega' : 'Entrega'
  const pagamento = record.payment_method === 'mercado_pago' ? 'Pix online' : record.payment_method === 'cartao' ? 'Cartão na entrega/retirada' : record.payment_method === 'dinheiro' ? 'Dinheiro' : 'Pix'

  // Evolution primeiro; se não estiver configurada e for a LOJA, CallMeBot (grátis)
  async function deliver(number: string | null, text: string, isStore: boolean) {
    if (!number) return false
    if (evoReady && (await sendEvo(EV_URL, EV_KEY, EV_INSTANCE, number, text))) return true
    if (isStore && settings?.notify_whatsapp_key) return await sendCmb(number, text, settings.notify_whatsapp_key)
    return false
  }

  const sent: string[] = []

  // ---------- pedido PAGO (pagamento webhook): avisa LOJA + CLIENTE ----------
  if (topic === 'order_paid') {
    if (await deliver(storePhone,
      '🧾 *Pedido PAGO no site!*\n' +
      'Pedido #' + orderShort + ' · ' + money(record.total) + '\n' +
      'Cliente: ' + cliente + (record.customer_phone ? ' · ' + record.customer_phone : '') + '\n' +
      entrega + '\nDê andamento em /admin/pedidos.', true)) sent.push('loja')
    if (await deliver(clientePhone,
      '✅ Pagamento confirmado!\nSeu pedido nº ' + orderShort + ' na ' + storeName +
      ' foi pago e já está em preparo.\nQualquer dúvida, responda por aqui.', false)) sent.push('cliente')
  }

  // ---------- pedido NOVO (DB webhook INSERT): avisa a LOJA ----------
  if (dbType === 'INSERT') {
    const aviso = record.payment_method === 'mercado_pago'
      ? '(aguardando pagamento do Pix — quando confirmar chega outro aviso)'
      : '(pagamento: ' + pagamento + ')'
    if (await deliver(storePhone,
      '🛒 *Novo pedido no site*\n' +
      'Pedido #' + orderShort + ' · ' + money(record.total) + ' ' + aviso + '\n' +
      'Cliente: ' + cliente + (record.customer_phone ? ' · ' + record.customer_phone : '') + '\n' +
      entrega, true)) sent.push('loja')
  }

  // ---------- mudança de STATUS (DB webhook UPDATE): avisa o CLIENTE ----------
  if (dbType === 'UPDATE') {
    const oldStatus = String(body.old_record?.status ?? '')
    const newStatus = String(record.status ?? '')
    if (newStatus !== oldStatus && STATUS_LABEL[newStatus] && clientePhone && newStatus !== 'cancelled') {
      const ok = await deliver(clientePhone,
        'Olá, ' + cliente + '! Aqui é da ' + storeName + '.\n\n' +
        'Atualização do seu pedido nº ' + orderShort + ': *' + STATUS_LABEL[newStatus] + '*' +
        (newStatus === 'delivered' ? '\nObrigado pela preferência! ⭐' : '\nQualquer dúvida é só responder por este WhatsApp.'), false)
      if (ok) sent.push('cliente:' + newStatus)
    }
  }

  return json({ ok: true, evo: evoReady, sent })
})
