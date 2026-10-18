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

      const chats = raw
        .map((c) => {
          const jid = personJid(c?.remoteJid)
          if (!jid) return null // grupos/@newsletter ficam fora
          const last = c?.lastMessage ?? null
          const lastKey = last?.key ?? {}
          const text = extractText(last?.message)
          const ts = toMs(last?.messageTimestamp)
            ?? (c?.updatedAt ? Date.parse(String(c.updatedAt)) : null)
          // pushName é o nome do CONTATO ("Você" marca mensagens nossas)
          const push = typeof c?.pushName === 'string' && c.pushName.trim() && c.pushName !== 'Você' ? c.pushName : null
          const name = push ?? (typeof c?.name === 'string' && c.name.trim() ? c.name : null)
          return {
            jid,
            phone: jid.replace(/@s\.whatsapp\.net|@lid$/, ''),
            name,
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
              last_message: c.lastText,
              last_message_at: c.lastAt ? new Date(c.lastAt).toISOString() : null,
              last_from_me: c.fromMe,
              unread_count: c.unread,
              updated_at: new Date().toISOString(),
            }
            if (c.name) row.name = c.name // não sobrescreve nome já conhecido
            return row
          })
          await supabase.from('whatsapp_chats').upsert(rows, { onConflict: 'remote_jid' })
          const jids = (chats as any[]).map((c) => c.jid).join(',')
          await supabase.from('whatsapp_chats').delete().not('remote_jid', 'in', `(${jids})`)
        }
      } catch (e) {
        console.warn('[whatsapp-chat] sync da tabela falhou (migration-19 rodou?):', (e as Error)?.message)
      }

      return json({ configured: true, chats })
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
      const r = await evoFetch(EV_URL, EV_KEY, EV_INSTANCE, `/message/sendText/${inst}`, {
        method: 'POST',
        body: JSON.stringify({ number: chat, text, delay: 0 }),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        return json({ error: 'A Evolution recusou o envio (' + r.status + ')' + (t ? ': ' + t.slice(0, 200) : '') }, 502)
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
