// supabase/functions/whatsapp-notify/index.ts
// Central de mensagens de WhatsApp da loja (automáticas).
//
// Canal único: Evolution API (self-hosted — pareia o número como um
// WhatsApp Web: atendimento manual no celular e mensagens automáticas do
// sistema convivem no mesmo número). Sem Evolution configurada, a função
// recebe os eventos e responde ok sem enviar nada.
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

// ---------- ANTI-BAN: redações variadas ----------
// O WhatsApp sinaliza contas que disparam mensagens IDÊNTICAS em
// repetição. Cada envio sorteia entre variações do mesmo tema e ganha
// um delay aleatório de "digitação" (nada de texto palavra-por-palavra
// igual em sequência).
const pickVariant = (list: string[]) => list[Math.floor(Math.random() * list.length)]
const applyVars = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
const typingDelay = () => Math.floor(Math.random() * 1400) + 600

const PAID_CLIENT = [
  'Olá, {nome}! ✅ Recebemos o pagamento do seu pedido nº {n} na {loja}.\n\nJá estamos preparando tudo! Qualquer dúvida, responde aqui.',
  'Oi, {nome}! Pagamento confirmado! 🎉\n\nO pedido nº {n} da {loja} já está em preparo. Obrigado! 😊',
  '{nome}, tudo certo por aqui! 💚\n\nO pagamento do pedido nº {n} caiu — a {loja} já tá preparando.',
  'Olá! Pagamento do pedido nº {n} confirmado ✅\n\nValeu pela confiança, {nome}! A {loja} avisa cada passo por aqui.',
  'Oi, {nome}! 🙌 Boa notícia: o pagamento do pedido nº {n} foi aprovado!\n\nA {loja} começa a preparar agora!',
  '{nome}, recebemos! ✅ O pedido nº {n} está pago e a {loja} já separa tudo.\n\nObrigado pela preferência! 😊',
  'Tudo certo, {nome}! 💚\n\nPagamento do nº {n} confirmado — a equipe da {loja} tá em ação.',
  'Olá, {nome}! Obrigado por comprar com a {loja} 🙏\n\nO pagamento do pedido nº {n} foi confirmado.',
  'Boa, {nome}! 🎉 Pagamento do pedido nº {n} ok!\n\nA {loja} avisa quando sair pra entrega.',
  'Oi, {nome}! 😊 Confirmando: o pagamento do pedido nº {n} chegou!\n\nA {loja} cuida do resto.',
]
const PAID_STORE = [
  '🧾 *Pedido PAGO no site!*\nPedido nº {n} · {valor}\nCliente: {cliente} · {fone}\nDê andamento em /admin/pedidos.',
  '💰 Caiu o pagamento! Pedido nº {n} ({valor}).\nCliente: {cliente} · {fone}\nConfere lá nos pedidos!',
  '🚨 Pix confirmado:\n\nPedido nº {n} — {valor}\nCliente: {cliente} ({fone})\nBora preparar!',
  '✅ Beleza: pedido nº {n} pago ({valor}).\nCliente: {cliente} · {fone}\nJá pode separar!',
  '🎉 Pedido do site pago!\n\nNº {n} · {valor}\nCliente: {cliente} · {fone}\nDê andamento em /admin/pedidos.',
]
const NEW_ORDER_STORE = [
  '🛒 *Novo pedido no site*\nPedido nº {n} · {valor}\nCliente: {cliente} · {fone}\n{entrega}',
  '📢 Pedido novo chegando no site!\n\nNº {n} — {valor}\nCliente: {cliente} ({fone})\n{entrega}',
  '🆕 Venda pelo site:\n\nPedido {n} · {valor}\nCliente: {cliente}\nTel: {fone}\n{entrega}',
  '📦 Olha o site trabalhando:\n\nPedido nº {n} ({valor})\nCliente: {cliente}\n{fone}\n{entrega}',
  '⚡ Novo pedido pra separar:\n\nNº {n} — {valor}\nCliente: {cliente} · {fone}\n{entrega}',
  '🛍️ Tem pedido novo no site!\n\nPedido {n} · {valor}\nCliente: {cliente} · {fone}\n{entrega}',
]
const STATUS_CLIENT = [
  'Olá, {nome}! Aqui é da {loja} 👋\n\nAtualização do seu pedido nº {n}: *{etapa}*\n\nQualquer dúvida é só responder por aqui.',
  'Oi, {nome}! Passando da {loja} pra avisar 😊\n\nSeu pedido nº {n}: *{etapa}*\n\nSe precisar de algo, estamos por aqui!',
  'Fala, {nome}! Equipe {loja} falando 🙌\n\nNovidade do pedido nº {n}: *{etapa}*\n\nAbraço — qualquer coisa chama!',
  'Olá, {nome}, tudo bem? 😃\n\nDa {loja}: o pedido nº {n} agora está assim: *{etapa}*\n\nDúvidas? Responde aqui.',
  'Olá, {nome}! Aviso rápido da {loja}:\n\nPedido nº {n} — *{etapa}*\n\nTamo junto!',
  'Oi, {nome}! 👋 Aqui é a {loja}.\n\nO pedido nº {n} teve novidade: *{etapa}*\n\nQualquer coisa, é só chamar!',
  '{nome}, olha só quem apareceu 😄 — a {loja}, com notícia do pedido nº {n}:\n\n*{etapa}*\n\nPrecisando, estamos aqui!',
  'Olá, {nome}!\n\nA {loja} avisando que o pedido nº {n} está: *{etapa}*\n\nObrigado pela confiança!',
  'Ei, {nome}! 🚀 Atualização da {loja}:\n\nPedido nº {n} → *{etapa}*\n\nDeu tudo certo? Qualquer coisa responde!',
  'Oi, {nome}, tudo certo por aí? 😊\n\nSeu pedido nº {n} na {loja}: *{etapa}*\n\nEstamos à disposição!',
]

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
    body: JSON.stringify({ number, text, delay: typingDelay() }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    console.warn('[whatsapp-notify] Evolution recusou', r.status, t.slice(0, 300))
  }
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
    supabase.from('store_settings').select('store_name, whatsapp').eq('id', 1).maybeSingle(),
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

  async function deliver(number: string | null, text: string) {
    if (!number || !evoReady) return false
    return await sendEvo(EV_URL, EV_KEY, EV_INSTANCE, number, text)
  }

  const sent: string[] = []

  // ---------- pedido PAGO (pagamento webhook): avisa LOJA + CLIENTE ----------
  if (topic === 'order_paid') {
    const vars = {
      n: orderShort,
      valor: money(record.total),
      cliente,
      fone: record.customer_phone || '—',
      nome: cliente,
      loja: storeName,
    }
    if (await deliver(storePhone, applyVars(pickVariant(PAID_STORE), vars))) sent.push('loja')
    if (await deliver(clientePhone, applyVars(pickVariant(PAID_CLIENT), vars))) sent.push('cliente')
  }

  // ---------- pedido NOVO (DB webhook INSERT): avisa a LOJA ----------
  if (dbType === 'INSERT') {
    const aviso = record.payment_method === 'mercado_pago'
      ? '(aguardando pagamento do Pix — quando confirmar chega outro aviso)'
      : '(pagamento: ' + pagamento + ')'
    if (await deliver(storePhone, applyVars(pickVariant(NEW_ORDER_STORE), {
      n: orderShort,
      valor: money(record.total) + ' ' + aviso,
      cliente,
      fone: record.customer_phone || '—',
      entrega,
    }))) sent.push('loja')
  }

  // ---------- mudança de STATUS (DB webhook UPDATE): avisa o CLIENTE ----------
  if (dbType === 'UPDATE') {
    const oldStatus = String(body.old_record?.status ?? '')
    const newStatus = String(record.status ?? '')
    if (newStatus !== oldStatus && STATUS_LABEL[newStatus] && clientePhone && newStatus !== 'cancelled') {
      const etapa = STATUS_LABEL[newStatus] +
        (newStatus === 'delivered' ? ' — obrigado pela preferência! ⭐' : '')
      const ok = await deliver(clientePhone, applyVars(pickVariant(STATUS_CLIENT), {
        nome: cliente,
        loja: storeName,
        n: orderShort,
        etapa,
      }), false)
      if (ok) sent.push('cliente:' + newStatus)
    }
  }

  return json({ ok: true, evo: evoReady, sent })
})
