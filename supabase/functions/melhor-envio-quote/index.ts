// ============================================================
// melhor-envio-quote — cotação de frete para CEP fora da área própria
// ------------------------------------------------------------
// Chamado pelo checkout quando o CEP não está em nenhuma faixa
// cadastrada (migration-36). Devolve as opções do Melhor Envio
// (nome, preço, prazo) já ordenadas do mais barato.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   MELHOR_ENVIO_TOKEN  — token pessoal do Melhor Envio
//                         (sandbox: https://sandbox.melhorenvio.com.br)
//   MELHOR_ENVIO_URL    — opcional; padrão: https://api.melhorenvio.com/v2
// ============================================================

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const TOKEN = Deno.env.get('MELHOR_ENVIO_TOKEN') ?? ''
  if (!TOKEN) return json({ error: 'Frete automático não configurado (MELHOR_ENVIO_TOKEN).' })

  let body: { dest_zip?: string; weight_gram?: number; declared?: number } = {}
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }

  const dest = String(body.dest_zip ?? '').replace(/\D/g, '')
  if (dest.length !== 8) return json({ error: 'CEP de destino inválido.' }, 400)

  const base = Deno.env.get('MELHOR_ENVIO_URL') ?? 'https://api.melhorenvio.com/v2'
  try {
    const res = await fetch(base + '/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
      body: JSON.stringify({
        from: { postal_code: '60000000' }, // CEP da loja: ajuste por loja depois
        to: { postal_code: dest },
        products: [{
          id: '1',
          width: 20, height: 15, length: 15,
          weight: Math.max(0.1, (Number(body.weight_gram) || 300) / 1000),
          insurance_value: Math.max(1, Number(body.declared) || 20),
          quantity: 1,
        }],
        services: '1,2,3,4', // PAC, Sedex, .Package e .Com
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return json({ error: 'Melhor Envio recusou a cotação (' + res.status + ').' + (text ? ' Detalhe: ' + text.slice(0, 200) : '') })
    }
    const data = await res.json()
    const options = (Array.isArray(data) ? data : data?.data ?? [])
      .filter((o: any) => Number(o?.price) > 0)
      .map((o: any) => ({
        id: o.id,
        name: o.name ?? o.company?.name ?? 'Entrega',
        price: Number(o.price),
        eta: o.delivery_range ? (o.delivery_range.min === o.delivery_range.max ? o.delivery_range.min + ' dias' : o.delivery_range.min + ' a ' + o.delivery_range.max + ' dias') : null,
      }))
      .sort((a: any, b: any) => a.price - b.price)
    return json({ options })
  } catch (err) {
    return json({ error: 'Não foi possível falar com o Melhor Envio agora (' + (err?.message ?? 'rede') + ').' })
  }
})
