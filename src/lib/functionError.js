// Lê o corpo JSON de um erro de Edge Function (supabase.functions.invoke com
// status != 2xx) para mostrar o motivo REAL devolvido pela função.
// Cobre os formatos do gateway antigo (details.errors[0].message) e o envelope
// da AbacatePay ({ error } dentro de details, ou o campo message direto).
export async function readFunctionError(e) {
  try {
    const body = await e?.context?.json?.()
    const mp = body?.details?.errors?.[0]
    return (mp && (mp.details?.[0] ?? mp.message))
      ?? body?.details?.error
      ?? body?.details?.message
      ?? body?.message
      ?? body?.error
      ?? null
  } catch {
    return null
  }
}
