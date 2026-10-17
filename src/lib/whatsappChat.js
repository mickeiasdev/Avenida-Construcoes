import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// Chamada às ações da edge function whatsapp-chat (proxy admin ↔ Evolution).
// O JWT da sessão vai automaticamente (supabase.functions.invoke) e a
// apikey da Evolution nunca aparece no navegador.
// Devolve { configured, ... } da ação; lança Error com mensagem pronta.
export async function waCall(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('whatsapp-chat', {
    body: { action, ...params },
  })
  if (error) {
    const detail = await readFunctionError(error)
    throw new Error(detail ?? error.message ?? 'Sem contato com o servidor')
  }
  if (data?.error) throw new Error(data.error)
  return data ?? {}
}

// Número com DDI + sufixo JID do WhatsApp — conversa 1:1
export function toJid(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits + '@s.whatsapp.net'
}
