// supabase/functions/whatsapp-webhook/index.ts
// Recebe os eventos da Evolution API (mensagens enviadas/recebidas pelo
// número da loja) e mantém o CACHE do painel (tabela whatsapp_chats) vivo:
// o selo de não lidas do menu sobe na hora, mesmo com o painel fechado.
//
// Configuração (uma vez, no painel da sua Evolution ou ao criar a instância):
//   Webhook: https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook?secret=SEU_NOTIFY_SECRET
//   Eventos: Messages Upsert  (Connection Update é opcional — aceito e ignoro)
//
// Segurança: verify_jwt = false (a Evolution não envia Authorization).
// A autenticidade é garantida pelo segredo na query (?secret=NOTIFY_SECRET),
// o MESMO usado nas notificações automáticas (whatsapp-notify).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// espelho do extrator do whatsapp-chat (funções vivem isoladas no Deno)
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
  if (message.locationMessage) return '📍 Localização'
  return null
}

function toMs(ts: unknown): number | null {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 1e12 ? n : n * 1000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: true })

  // ---------- trava de chamada: segredo na query ----------
  const SECRET = Deno.env.get('NOTIFY_SECRET') ?? ''
  if (!SECRET) return json({ ok: false, error: 'NOTIFY_SECRET não configurado no Supabase' }, 500)
  const incoming = new URL(req.url).searchParams.get('secret') ?? req.headers.get('x-notify-secret') ?? ''
  if (incoming !== SECRET) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const event = String(body?.event ?? '')

  // só o que interessa: mensagem nova (do cliente OU enviada pelo celular
  // do lojista — o painel precisa refletir as duas).
  if (event !== 'messages.upsert') return json({ ok: true, ignored: event })

  const msg = body?.data ?? null
  const jid = String(msg?.key?.remoteJid ?? '')
  if (!jid.endsWith('@s.whatsapp.net')) return json({ ok: true, ignored: 'não é conversa 1:1' })

  const text = extractText(msg?.message)
  if (!text) return json({ ok: true, ignored: 'sem texto (reação/protocolo)' })

  const fromMe = Boolean(msg?.key?.fromMe)
  const at = toMs(msg?.messageTimestamp ?? msg?.messageTimestamp?.low) ?? Date.now()
  const name = typeof msg?.pushName === 'string' ? msg.pushName : ''

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { error } = await supabase.rpc('wa_register_message', {
    p_jid: jid,
    p_name: fromMe ? '' : name, // pushName do remetente (deles) ou nada (nossa)
    p_text: String(text).slice(0, 500),
    p_from_me: fromMe,
    p_at: new Date(at).toISOString(),
  })
  if (error) {
    console.warn('[whatsapp-webhook] registro falhou:', error.message)
    return json({ ok: false, error: 'veja os logs da função' }, 500)
  }
  return json({ ok: true })
})
