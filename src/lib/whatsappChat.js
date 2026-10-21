import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// TRADUTOR DE ERROS — o WhatsApp do painel depende da Evolution API (self-hosted
// via túnel). Quando o servidor/túnel está desligado, o erro cru da rede vem em
// inglês técnico ("dns error", "connection refused"...). Aqui viram português
// claro com a causa e o que fazer — cada padrão mapeado foi visto na prática.
export function translateWaError(raw) {
  const t = String(raw ?? '').toLowerCase()

  // --- servidor / túnel da Evolution fora do ar ---
  if (t.includes('dns error') || t.includes('failed to lookup address') || t.includes('getaddrinfo') || t.includes('name or service not known')) {
    return 'Não conseguimos encontrar o endereço do servidor da Evolution API (erro de DNS). Na maioria das vezes o túnel está desligado — e o link do trycloudflare MUDA a cada reinício. Ligue o servidor da Evolution, copie o endereço novo (https://....trycloudflare.com) e atualize o secret EVOLUTION_API_URL no Supabase.'
  }
  if (t.includes('connection refused') || t.includes('econnrefused') || t.includes('connect error')) {
    return 'O servidor da Evolution API recusou a conexão (a porta não respondeu). Verifique se o serviço da Evolution está rodando no servidor e se o endereço no secret EVOLUTION_API_URL está correto.'
  }
  if (t.includes('timed out') || t.includes('timeout') || t.includes('deadline') || t.includes('took longer')) {
    return 'A Evolution API demorou demais para responder (tempo esgotado). O servidor pode estar sobrecarregado ou o túnel lento — aguarde um momento e tente de novo.'
  }
  if (t.includes('error sending request for url') || t.includes('fetch failed') || t.includes('failed to fetch') || t.includes('networkerror')) {
    return 'Não conseguimos falar com a Evolution API agora. Na maioria das vezes o servidor/túnel está desligado — ligue-o, confira o endereço no secret EVOLUTION_API_URL e tente de novo.'
  }
  if (t.includes('unexpected token') || t.includes('<!doctype') || t.includes('<html')) {
    return 'A Evolution API respondeu algo inesperado (parece uma página de erro, não o JSON esperado). O túnel pode estar exibindo um aviso do Cloudflare — confira o endereço e o estado do servidor.'
  }

  // --- erros HTTP da Evolution ---
  if (t.includes('401') || t.includes('unauthorized')) {
    return 'A Evolution API recusou a chave de acesso (401). Confira o secret EVOLUTION_API_KEY no Supabase — precisa ser a MESMA chave global mostrada no painel da Evolution.'
  }
  if (t.includes('404') || t.includes('not found')) {
    return 'Endereço não encontrado (404). Confira os secrets no Supabase: EVOLUTION_API_URL (endereço correto, sem barra no final) e EVOLUTION_INSTANCE (nome exato da instância, ex.: loja).'
  }
  if (t.includes('500') || t.includes('internal server error')) {
    return 'A Evolution API teve um erro interno (500). Abra o painel da Evolution, veja se a instância está conectada (leia o QR se preciso) e tente de novo.'
  }

  // --- erros da chamada às Edge Functions do Supabase ---
  if (t.includes('non-2xx') || t.includes('edge function')) {
    return 'A função whatsapp-chat no Supabase respondeu com erro. Veja o motivo exato em Supabase → Edge Functions → whatsapp-chat → Logs.'
  }
  if (t.includes('functionsinvokeerror')) {
    return 'Não foi possível chamar a função whatsapp-chat no Supabase. Verifique sua internet e se a função foi implantada (Edge Functions → whatsapp-chat).'
  }

  // --- microfone/mídia do navegador ---
  if (t.includes('notallowederror') || t.includes('permission denied')) {
    return 'Permissão negada. Libere o acesso (microfone/mídia) nas configurações do site no navegador.'
  }
  if (t.includes('notfounderror') || t.includes('device not found')) {
    return 'Nenhum dispositivo encontrado — verifique se o microfone/câmera está conectado e habilitado no sistema.'
  }

  // já vem em português (mensagens prontas das functions) → passa direto
  return String(raw ?? 'Erro desconhecido.')
}

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
    throw new Error(translateWaError(detail ?? error.message ?? 'Sem contato com o servidor'))
  }
  if (data?.error) throw new Error(translateWaError(data.error))
  return data ?? {}
}

// Número com DDI + sufixo JID do WhatsApp — conversa 1:1
export function toJid(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits + '@s.whatsapp.net'
}
