// Lê o corpo JSON de um erro de Edge Function (supabase.functions.invoke com
// status != 2xx) para mostrar o motivo REAL devolvido pela função (ex.: erro do MP).
export async function readFunctionError(e) {
  try {
    const body = await e?.context?.json?.()
    const mp = body?.details?.errors?.[0]
    return (mp && (mp.details?.[0] ?? mp.message))
      ?? body?.message
      ?? body?.error
      ?? null
  } catch {
    return null
  }
}
