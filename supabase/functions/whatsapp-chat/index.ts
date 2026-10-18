// supabase/functions/whatsapp-chat/index.ts
// WhatsApp direto no painel — ponte autenticada entre o admin (navegador)
// e a Evolution API. Nenhum segredo (apikey/URL da Evolution) vai para o
// front: toda ação passa por aqui, com JWT do atendente + role admin.
//
// Ações (POST JSON { action, ...params }):
//   status   → { configured, state }  estado da conexão (open/close/connecting)
//   connect  → { base64, pairingCode } QR + código para parear o celular
//   chats    → { chats } lista de conversas (e sincroniza o selo de não lidas)
//   messages → { messages } histórico de uma conversa  { chat }
//   send     → { ok } envia texto       { chat, text }
//   read     → { ok } marca como lida   { chat, id? }
//
// Formatos conferidos com a Evolution API v2.3.7 (findChats devolve array
// direto; findMessages espera o jid NO CORPO e responde messages.records;
// leitura é markMessageAsRead com o id da mensagem). Conversas @lid (o novo
// endereço interno do WhatsApp) são conversas 1:1 válidas — entram na lista.
//
// Segurança: verify_jwt = true (config.toml) garante JWT válido no gateway;
// aqui dentro confirmamos que o dono do JWT é admin (defesa em profundidade).
// A tabela whatsapp_chats (migration-19) é um CACHE opcional: se a migration
// ainda não rodou, tudo continua funcionando — só o selo do menu não conta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------- helpers ----------

// sub (user id) do JWT — o gateway já validou a assinatura (verify_jwt)
function jwtSub(req: Request): string | null {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))?.sub ?? null
  } catch {
    return null
  }
}

// conversas 1:1: número real (@s.whatsapp.net) ou endereço interno (@lid)
function personJid(jid: unknown): string | null {
  const j = String(jid ?? '')
  return j.endsWith('@s.whatsapp.net') || j.endsWith('@lid') ? j : null
}

// Baileys guarda o texto em campos diferentes por tipo de mensagem —
// devolvemos algo legível para o painel em TODOS os casos comuns.
function extractText(message: Record<string, any> | null | undefined): string | null {
  if (!message || typeof message !== 'object') return null
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage?.text
  if (typeof ext === 'string') return ext
  for (const k of ['imageMessage', 'videoMessage', 'documentMessage']) {
    if (message[k]?.caption) return String(message[k].caption)
  }
  if (message.imageMessage) return '📷 Foto'
  if (message.videoMessage) return '🎥 Vídeo'
  if (message.audioMessage) return '🎙️ Áudio'
  if (message.stickerMessage) return '🎨 Figurinha'
  if (message.documentMessage) return '📄 Documento'
  if (message.contactMessage) return '👤 ' + String(message.contactMessage.displayName ?? 'Contato')
  if (message.locationMessage) return '📍 Localização'
  if (message.reactionMessage || message.protocolMessage) return null // reação/eco: nada a listar
  return null
}

// messageTimestamp chega em SEGUNDOS (às vezes string); normaliza p/ ms
function toMs(ts: unknown): number | null {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 1e12 ? n : n * 1000
}

async function evoFetch(url: string, key: string, instance: string, path: string, init: RequestInit = {}) {
  // junção à prova de erro: a base perde barras finais, o path ganha a inicial
  const base = url.replace(/\/+$/, '')
  const clean = path.startsWith('/') ? path : '/' + path
  const full = base + clean
  return fetch(full, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: key, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
}

// o primeiro candidato que for DE FATO array vence — nunca confiar em chave só
function firstArray(...candidates: unknown[]): any[] {
  for (const c of candidates) if (Array.isArray(c)) return c
  return []
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const EV_URL = Deno.env.get('EVOLUTION_API_URL') ?? ''
  const EV_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? ''
  const EV_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? ''
  const configured = Boolean(EV_URL && EV_KEY && EV_INSTANCE)

  const uid = jwtSub(req)
  if (!uid) return json({ error: 'Não autenticado' }, 401)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
  if (profile?.role !== 'admin') return json({ error: 'Acesso restrito a administradores' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  if (!configured) {
    if (action === 'status') return json({ configured: false })
    return json({ error: 'WhatsApp não configurado (EVOLUTION_API_URL/KEY/INSTANCE no Supabase)' }, 400)
  }

  const inst = encodeURIComponent(EV_INSTANCE)

  try {
    // ---------- STATUS da conexão ----------
    if (action === 'status') {
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/instance/connectionState/${inst}`)
      const d = await r.json().catch(() => ({}))
      const state = d?.instance?.state ?? d?.state ?? 'close'
      return json({ configured: true, state })
    }

    // ---------- QR / pairing code ----------
    if (action === 'connect') {
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/instance/connect/${inst}`)
      const d = await r.json().catch(() => ({}))
      // ATENÇÃO: d.code é a string CRUA do QR (gigante) — só o pairingCode
      // (8 dígitos) é o "código sem câmera". Nunca mostrar d.code no painel.
      const pc = d?.pairingCode
      return json({
        configured: true,
        base64: d?.base64 ?? null,
        pairingCode: typeof pc === 'string' && pc ? pc : null,
        state: d?.instance?.state ?? d?.state ?? null,
      })
    }

    // ---------- LISTA de conversas (2.3.7: array direto na raiz) ----------
    if (action === 'chats') {
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/chat/findChats/${inst}`, {
        method: 'POST', body: JSON.stringify({}),
      })
      const d = await r.json().catch(() => ({}))
      const raw = firstArray(d, d?.chats, d?.response)

      // Números que a LOJA conhece (pedidos + clientes): o nome do cadastro
      // é salvo na conversa (known=true). Números desconhecidos não são
      // listados no painel — só entram se o admin abrir a conversa.
      const knownByDigits = new Map()
      try {
        const [ordersRes, profilesRes] = await Promise.all([
          supabase.from('orders').select('customer_name, customer_phone').order('created_at', { ascending: false }).limit(2000),
          supabase.from('profiles').select('full_name, phone').not('phone', 'is', null).limit(1000),
        ])
        const addKnown = (phone: unknown, name: unknown) => {
          const digits = String(phone ?? '').replace(/\D/g, '')
          if (digits.length < 10 || !knownByDigits.has(digits)) {
            const key = digits.length >= 9 ? digits.slice(-9) : digits
            if (!knownByDigits.has(key)) knownByDigits.set(key, String(name ?? '').trim())
          }
        }
        for (const o of ordersRes.data ?? []) addKnown(o.customer_phone, o.customer_name)
        for (const p of profilesRes.data ?? []) addKnown(p.phone, p.full_name)
      } catch (e) {
        console.warn('[whatsapp-chat] base de clientes indisponível:', (e as Error)?.message)
      }

      // atendimentos ENCERRADOS ficam fora da lista (closed=true no cache).
      // Se o cliente mandar mensagem, o webhook reabre e a conversa volta.
      const closedJids = new Set<string>()
      try {
        const { data: closed } = await supabase
          .from('whatsapp_chats')
          .select('remote_jid')
          .eq('closed', true)
        for (const row of closed ?? []) closedJids.add(String(row.remote_jid))
      } catch { /* migration-24 ausente: sem filtro */ }

      const chats = raw
        .map((c) => {
          const jid = personJid(c?.remoteJid)
          if (!jid) return null // grupos/@newsletter ficam fora
          if (closedJids.has(jid)) return null // atendimento encerrado
          const last = c?.lastMessage ?? null
          const lastKey = last?.key ?? {}
          const text = extractText(last?.message)
          const ts = toMs(last?.messageTimestamp)
            ?? (c?.updatedAt ? Date.parse(String(c.updatedAt)) : null)
          const phone = jid.replace(/@s\.whatsapp\.net|@lid$/, '')
          // nome do CADASTRO da loja manda; sem cadastro entra o NOME DO
          // PRÓPRIO WHATSAPP do contato (pushName da última mensagem recebida)
          const storeName = jid.endsWith('@s.whatsapp.net')
            ? knownByDigits.get(phone.length >= 9 ? phone.slice(-9) : phone) ?? null
            : null
          const chatName = typeof c?.name === 'string' && c.name.trim() ? c.name : null
          const push = typeof last?.pushName === 'string' && last.pushName.trim() && last.pushName !== 'Você'
            ? last.pushName
            : (typeof c?.pushName === 'string' && c.pushName.trim() && c.pushName !== 'Você' ? c.pushName : null)
          return {
            jid,
            phone,
            known: Boolean(storeName),
            name: storeName ?? chatName ?? push,
            lastText: text ?? (lastKey.fromMe ? 'Mensagem enviada' : null),
            lastAt: Number.isFinite(ts) ? ts : null,
            fromMe: Boolean(lastKey.fromMe),
            unread: Math.max(0, Number(c?.unreadCount ?? 0) || 0),
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (b.lastAt ?? 0) - (a.lastAt ?? 0))

      // Sincroniza o cache do selo do menu (best-effort: migration opcional)
      try {
        if (chats.length) {
          const rows = (chats as any[]).map((c) => {
            const row: Record<string, unknown> = {
              remote_jid: c.jid,
              phone: c.phone,
              known: c.known,
              last_message: c.lastText,
              last_message_at: c.lastAt ? new Date(c.lastAt).toISOString() : null,
              last_from_me: c.fromMe,
              unread_count: c.unread,
              updated_at: new Date().toISOString(),
            }
            if (c.known && c.name) row.name = c.name
            return row
          })
          await supabase.from('whatsapp_chats').upsert(rows, { onConflict: 'remote_jid' })
          // limpa apenas os DESCONHECIDOS que saíram da Evolution —
          // conversas abertas pelo admin (known) ficam de pé
          const jids = (chats as any[]).map((c) => c.jid).join(',')
          await supabase.from('whatsapp_chats').delete().eq('known', false).not('remote_jid', 'in', `(${jids})`)
        }
      } catch (e) {
        console.warn('[whatsapp-chat] sync da tabela falhou (migration-19 rodou?):', (e as Error)?.message)
      }

      // Mescla conversas CONHECIDAS salvas que ainda não existem na Evolution
      // (aviso automático de pedido enviado, conversa aberta pelo admin…) —
      // o painel mostra desde já, com o resumo do que foi enviado.
      try {
        const { data: saved } = await supabase
          .from('whatsapp_chats')
          .select('remote_jid, phone, name, last_message, last_message_at, last_from_me')
          .eq('known', true)
          .eq('closed', false)
        const evoJids = new Set((chats as any[]).map((c: any) => c.jid))
        for (const s of saved ?? []) {
          const jid = personJid(s.remote_jid)
          if (!jid || evoJids.has(jid)) continue
          evoJids.add(jid)
          const at = s.last_message_at ? Date.parse(String(s.last_message_at)) : null
          ;(chats as any[]).push({
            jid,
            phone: String(s.phone ?? jid.replace(/@s\.whatsapp\.net|@lid$/, '')),
            known: true,
            name: s.name ?? null,
            lastText: s.last_message ?? null,
            lastAt: Number.isFinite(at) ? at : null,
            fromMe: s.last_from_me ?? true,
            unread: 0,
          })
        }
        ;(chats as any[]).sort((a: any, b: any) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
      } catch (e) {
        console.warn('[whatsapp-chat] mescla de conversas salvas falhou:', (e as Error)?.message)
      }

      return json({ configured: true, chats })
    }

    // ---------- ABRIR conversa (marca o número como conhecido) ----------
    if (action === 'startChat') {
      const chat = personJid(body.chat)
      if (!chat) return json({ error: 'Conversa inválida' }, 400)
      // verify=true (número digitado ou vindo de pedido): confirmamos com a
      // Evolution que EXISTE no WhatsApp antes de entrar na lista. A
      // verificação só bloqueia com resposta clara (exists=false) — erro de
      // rede não trava a abertura (o envio valida de novo depois).
      if (body.verify && chat.endsWith('@s.whatsapp.net')) {
        const phone = chat.replace('@s.whatsapp.net', '')
        try {
          const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/chat/whatsappNumbers/${inst}`, {
            method: 'POST',
            body: JSON.stringify({ numbers: [phone] }),
          })
          const d = await r.json().catch(() => null)
          const first = Array.isArray(d) ? d[0] : null
          if (first && first.exists === false) {
            return json({ configured: true, ok: false, reason: 'numero-inexistente' })
          }
        } catch (e) {
          console.warn('[whatsapp-chat] verificação de número falhou, seguindo:', (e as Error)?.message)
        }
      }
      try {
        await supabase.from('whatsapp_chats').upsert({
          remote_jid: chat,
          phone: chat.replace(/@s\.whatsapp\.net|@lid$/, ''),
          known: true,
          closed: false, // abrir/reabrir pelo admin devolve a conversa à lista
          updated_at: new Date().toISOString(),
        }, { onConflict: 'remote_jid' })
      } catch { /* migration opcional */ }
      return json({ configured: true, ok: true })
    }

    // ---------- ENCERRAR atendimento (sai da lista do painel) ----------
    if (action === 'closeChat') {
      const chat = personJid(body.chat)
      if (!chat) return json({ error: 'Conversa inválida' }, 400)
      try {
        await supabase.from('whatsapp_chats').upsert({
          remote_jid: chat,
          phone: chat.replace(/@s\.whatsapp\.net|@lid$/, ''),
          closed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'remote_jid' })
        return json({ configured: true, ok: true })
      } catch (e) {
        return json({ error: 'Não foi possível encerrar: ' + ((e as Error)?.message ?? 'erro') }, 500)
      }
    }

    // ---------- AVISO AUTOMÁTICO ao atualizar o pedido ----------
    // Mesmos textos das notificações automáticas (whatsapp-notify). Se o
    // telefone não existe no pedido, devolve reason e o painel só ALERTA.
    if (action === 'notifyOrder') {
      const { data: order } = await supabase
        .from('orders')
        .select('id, status, total, customer_name, customer_phone')
        .eq('id', String(body.orderId ?? ''))
        .maybeSingle()
      if (!order) return json({ ok: false, reason: 'pedido-nao-encontrado' }, 404)
      const digits = String(order.customer_phone ?? '').replace(/\D/g, '')
      if (!digits) return json({ ok: false, reason: 'sem-telefone' })
      const phone = digits.length <= 11 ? '55' + digits : digits
      if (phone.length < 12) return json({ ok: false, reason: 'telefone-invalido' })

      const { data: store } = await supabase.from('store_settings').select('store_name').eq('id', 1).maybeSingle()
      const storeName = store?.store_name ?? 'loja'
      const short = String(order.id).slice(0, 8)
      const etapa: Record<string, string> = {
        pending: 'Pedido recebido — confirmamos e já vamos dar andamento',
        confirmed: 'Pedido confirmado — já está em preparo',
        preparing: 'Estamos separando seus itens neste momento',
        shipping: 'Saiu para entrega! 🚚',
        delivered: 'Entrega concluída. ✅ Obrigado pela preferência!',
      }
      const status = String(body.status ?? order.status ?? '')
      if (!etapa[status]) return json({ ok: false, reason: 'status-sem-aviso' })

      const typingDelay = Math.floor(Math.random() * 1400) + 600 // 0,6-2s

      let text: string
      if (status === 'confirmed') {
        // CONFIRMAÇÃO: comprovante COMPLETO (itens, endereço, pagamento).
        // Dados únicos por pedido já quebram repetição; título/rodapé
        // sorteiam entre 3 variações.
        const money = (v: unknown) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
        const sep = '─────────────────'
        const digits = String(order.customer_cpf ?? '').replace(/\D/g, '')
        const cpf = digits.length === 11
          ? digits.slice(0, 3) + '.' + digits.slice(3, 6) + '.' + digits.slice(6, 9) + '-' + digits.slice(9)
          : ''
        const retirada = order.delivery_method === 'retirada'
        const pay: Record<string, string> = {
          mercado_pago: 'Pix (QR + Copia e Cola)',
          pix: 'Pix',
          dinheiro: 'Dinheiro na entrega/retirada',
          cartao: 'Cartão na entrega/retirada',
        }
        const titulo = ['NOVO PEDIDO', 'PEDIDO CONFIRMADO', 'SEU PEDIDO'][Math.floor(Math.random() * 3)]
        const rodape = [
          '> *Pedido enviado pelo site — em caso de dúvidas envie uma mensagem.*',
          '> *Comprovante do seu pedido — dúvidas? Responde aqui!*',
          '> *Qualquer coisa, manda mensagem por aqui!* 😊',
        ][Math.floor(Math.random() * 3)]
        const L: string[] = []
        L.push('*' + titulo + ' — ' + storeName + '*')
        L.push(sep)
        L.push('Pedido nº ' + short)
        L.push('')
        L.push('*CLIENTE*')
        L.push('Nome: ' + (order.customer_name ?? 'Cliente'))
        if (order.customer_phone) L.push('Telefone: ' + order.customer_phone)
        if (cpf) L.push('CPF: ' + cpf)
        L.push('')
        L.push('*ITENS DO PEDIDO*')
        ;(orderItems ?? []).forEach((it: any, i: number) =>
          L.push((i + 1) + ') ' + Number(it.quantity) + 'x ' + it.product_name + ' — ' + money(Number(it.unit_price) * Number(it.quantity))))
        L.push(sep)
        if (Number(order.discount ?? 0) > 0) {
          L.push('Subtotal: ' + money(Number(order.total ?? 0) + Number(order.discount ?? 0)))
          L.push('Desconto: -' + money(Number(order.discount ?? 0)))
        }
        L.push('*TOTAL: ' + money(order.total) + '*')
        L.push(sep)
        L.push('')
        L.push(retirada ? '*RETIRADA NO BALCÃO*' : '*ENDEREÇO DE ENTREGA*')
        if (!retirada && order.delivery_address) L.push(order.delivery_address)
        L.push('')
        L.push('*PAGAMENTO*')
        L.push(pay[order.payment_method] ?? String(order.payment_method ?? '—'))
        L.push('')
        L.push(rodape)
        text = L.join('\n')
      } else {
        // demais etapas: redação curta sorteada entre 10 variações
        const variants: string[] = [
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
        const pick = variants[Math.floor(Math.random() * variants.length)]
        text = pick
          .replace(/\{nome\}/g, String(order.customer_name ?? 'cliente'))
          .replace(/\{loja\}/g, storeName)
          .replace(/\{n\}/g, short)
          .replace(/\{etapa\}/g, etapa[status])
      }
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/message/sendText/${inst}`, {
        method: 'POST',
        body: JSON.stringify({ number: phone + '@s.whatsapp.net', text, delay: typingDelay }),
      })
      // recusas da Evolution são RESPOSTA DE NEGÓCIO (200 + reason), não erro
      // de sistema: com status 5xx o front caia no catch genérico com jargão
      // ("non-2xx") em vez da mensagem traduzida do painel.
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        const first = Array.isArray(d?.response?.message) ? d.response.message[0] : (Array.isArray(d) ? d[0] : null)
        if (first?.exists === false) return json({ ok: false, reason: 'numero-inexistente' })
        return json({ ok: false, reason: 'evolution-recusou' })
      }
      // a mensagem saiu: a conversa entra no painel MESMO antes de o cliente
      // responder (a Evolution só cria o chat dela quando há resposta) —
      // gravamos aqui com o nome do pedido, como conversa conhecida
      const chatJid = phone + '@s.whatsapp.net'
      const now = new Date().toISOString()
      try {
        await supabase.from('whatsapp_chats').upsert({
          remote_jid: chatJid,
          phone,
          known: true,
          name: order.customer_name ?? null,
          closed: false, // novo aviso reabre atendimento encerrado
          last_message: text.slice(0, 500),
          last_message_at: now,
          last_from_me: true,
          unread_count: 0,
          updated_at: now,
        }, { onConflict: 'remote_jid' })
      } catch (e) {
        console.warn('[whatsapp-chat] conversa do aviso não foi salva:', (e as Error)?.message)
      }
      return json({ ok: true, sent: true })
    }

    // ---------- HISTÓRICO de uma conversa ----------
    if (action === 'messages') {
      const chat = personJid(body.chat)
      if (!chat) return json({ error: 'Conversa inválida' }, 400)
      const count = Math.min(Math.max(Number(body.count ?? 50) || 50, 10), 100)
      // 2.3.7: POST /chat/findMessages/{instance} com o jid NO CORPO
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/chat/findMessages/${inst}`, {
        method: 'POST',
        body: JSON.stringify({ where: { key: { remoteJid: chat } }, limit: count }),
      })
      const d = await r.json().catch(() => ({}))
      // resposta: { messages: { records: [...] } } — mas aceitamos formatos antigos
      const raw = firstArray(d?.messages?.records, d?.response, d?.messages?.messages, d?.messages, d)

      const messages = raw
        .map((m) => {
          const text = extractText(m?.message)
          if (!text) return null // reações/protocolo não entram na lista
          return {
            id: String(m?.key?.id ?? ''),
            fromMe: Boolean(m?.key?.fromMe),
            text,
            at: toMs(m?.messageTimestamp ?? m?.messageTimestamp?.low) ?? Date.now(),
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.at - b.at)

      return json({ configured: true, messages })
    }

    // ---------- ENVIAR texto (jid completo — cobre número e @lid) ----------
    if (action === 'send') {
      const chat = personJid(body.chat)
      const text = String(body.text ?? '').trim()
      if (!chat || !text) return json({ error: 'Mensagem vazia ou conversa inválida' }, 400)
      if (text.length > 4000) return json({ error: 'Mensagem muito longa (máx. 4000 caracteres)' }, 400)
      // número real precisa de DDI+DDD (>=12 dígitos; o BR é 55+10/11).
      // @lid é endereço interno — sempre válido, sem essa checagem.
      if (chat.endsWith('@s.whatsapp.net')) {
        const digits = chat.replace('@s.whatsapp.net', '')
        if (digits.length < 12) {
          return json({
            error: 'Telefone incompleto — este contato não tem DDD (' + digits.length + ' dígitos). Corrija o telefone no cadastro do cliente e tente de novo.',
          }, 400)
        }
      }
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/message/sendText/${inst}`, {
        method: 'POST',
        body: JSON.stringify({ number: chat, text, delay: 0 }),
      })
      if (!r.ok) {
        // a Evolution verifica se o número EXISTE no WhatsApp; traduzimos a
        // resposta técnica ("exists":false) para algo que o lojista entende
        const d = await r.json().catch(() => null)
        const first = Array.isArray(d?.response?.message) ? d.response.message[0] : null
        if (first?.exists === false) {
          return json({
            error: 'Este número não existe no WhatsApp (' + String(first.number ?? chat).split('@')[0] + ') — confira o DDD e o telefone do cliente.',
          }, 400)
        }
        return json({ error: 'A Evolution recusou o envio (' + r.status + ')' }, 502)
      }
      try {
        await supabase.rpc('wa_mark_read', { p_jid: chat })
        await supabase.from('whatsapp_chats').upsert({
          remote_jid: chat,
          phone: chat.replace(/@s\.whatsapp\.net|@lid$/, ''),
          last_message: text,
          last_message_at: new Date().toISOString(),
          last_from_me: true,
          unread_count: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'remote_jid' })
      } catch (e) {
        console.warn('[whatsapp-chat] sync pós-envio falhou:', (e as Error)?.message)
      }
      return json({ configured: true, ok: true })
    }

    // ---------- MARCAR como lida (2.3.7: markMessageAsRead) ----------
    if (action === 'read') {
      const chat = personJid(body.chat)
      if (!chat) return json({ error: 'Conversa inválida' }, 400)
      const id = String(body.id ?? '')
      if (id) {
        await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/chat/markMessageAsRead/${inst}`, {
          method: 'POST',
          body: JSON.stringify({ id, fromMe: false, remoteJid: chat }),
        }).catch(() => null)
      }
      try { await supabase.rpc('wa_mark_read', { p_jid: chat }) } catch { /* migration opcional */ }
      return json({ configured: true, ok: true })
    }

    return json({ error: 'Ação desconhecida: ' + action }, 400)
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError'
      ? 'A Evolution API não respondeu (timeout de 20s)'
      : (e as Error)?.message ?? 'erro inesperado'
    return json({ error: 'Falha ao falar com a Evolution API: ' + msg }, 502)
  }
})
