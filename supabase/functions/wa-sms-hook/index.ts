// ============================================================
// wa-sms-hook — códigos de login (OTP) por WhatsApp
// ------------------------------------------------------------
// "Custom SMS Hook" do Supabase Auth: quando o cliente pede login
// por telefone (signInWithOtp), o servidor de autenticação chama
// ESTA function com o código, e a gente entrega por WhatsApp via
// Evolution API (o canal que o público de obra já usa).
//
// Configuração (Dashboard → Authentication → Sign In / Providers):
//   1) Ative o provedor "Phone";
//   2) Em SMS Provider escolha "Custom SMS Hook" e aponte para
//      https://SEU-REF.supabase.co/functions/v1/wa-sms-hook
//
// Segredos (já usados pelas functions de WhatsApp existentes):
//   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
// ============================================================

const EV_URL = Deno.env.get('EVOLUTION_API_URL') ?? ''
const EV_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? ''
const EV_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? ''

// Supabase manda E.164 ("+5585..."): a Evolution quer só dígitos
// com código do país (55...).
function toEvolutionPhone(p: string): string | null {
  const digits = p.replace(/\D/g, '')
  if (!digits) return null
  return digits.startsWith('55') ? digits : '55' + digits
}

Deno.serve(async (req) => {
  // o hook é chamado pelo SERVIDOR de autenticação (sem CORS de navegador)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!EV_URL || !EV_KEY || !EV_INSTANCE) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp não configurado (EVOLUTION_* no Supabase)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let code = ''
  let phones: string[] = []
  try {
    const body = await req.json()
    code = String(body?.code ?? '')
    phones = Array.isArray(body?.phones) ? body.phones.map(String) : []
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!code || phones.length === 0) {
    return new Response(JSON.stringify({ error: 'Payload sem código/telefone.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let delivered = 0
  for (const raw of phones) {
    const phone = toEvolutionPhone(raw)
    if (!phone) continue
    try {
      const res = await fetch(`${EV_URL}/message/sendText/${EV_INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EV_KEY },
        body: JSON.stringify({
          number: phone,
          text: `🔐 Seu código de acesso é ${code}. Válido por 10 minutos. Se não foi você, ignore esta mensagem.`,
        }),
      })
      if (res.ok) delivered++
    } catch {
      // tenta o próximo número (o hook responde 2xx mesmo assim — o
      // Supabase não deve travar o login por um envio que falhou)
    }
  }

  // não entregou NADA → 503: o Supabase mostra erro de envio em vez
  // de deixar o cliente esperando um código que nunca chega
  if (delivered === 0) {
    return new Response(JSON.stringify({ error: 'Falha ao enviar o código.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ delivered }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
