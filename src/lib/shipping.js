// FRETE: faixas de CEP (cadastro do lojista) + cotação Melhor Envio
// (edge function melhor-envio-quote) para CEP fora das faixas.
import { supabase } from './supabaseClient'

export function onlyDigits(s) {
  return String(s ?? '').replace(/\D/g, '')
}

// Taxa pela faixa de CEP (a mais barata quando houver sobreposição)
// Devolve { label, fee, eta } ou null quando o CEP não está em nenhuma faixa
export function feeFromCepRanges(ranges, cep) {
  const c = onlyDigits(cep)
  if (c.length !== 8) return null
  const match = (ranges ?? [])
    .filter((r) => r.active !== false && onlyDigits(r.cep_start) <= c && c <= onlyDigits(r.cep_end))
    .sort((a, b) => Number(a.fee) - Number(b.fee))[0]
  return match ? { label: match.label, fee: Math.max(0, Number(match.fee)), eta: match.eta ?? null } : null
}

// Cotação Melhor Envio (CEP fora da área própria). Requer os secrets
// MELHOR_ENVIO_TOKEN no Supabase — sem eles devolve { error } e o
// checkout informa que não entrega naquele CEP.
export async function melhorEnvioQuote({ destZip, weightGram, total }) {
  try {
    const { data, error } = await supabase.functions.invoke('melhor-envio-quote', {
      body: { dest_zip: onlyDigits(destZip), weight_gram: Math.max(100, weightGram || 300), declared: total },
    })
    if (error || data?.error) return { error: data?.error ?? 'Falha na cotação.' }
    return { options: data.options ?? [] }
  } catch {
    return { error: 'Cotação de frete indisponível agora.' }
  }
}
