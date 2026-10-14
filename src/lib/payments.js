import { supabase } from './supabaseClient'

// Gateway de Pix online da loja: **Mercado Pago** (Orders API).
// A tela de Pix (MpPixDisplay) é agnóstica: ela lê qr_code/qr_code_base64 e
// consulta o status por esta função — trocar de gateway no futuro é escrever
// outra Edge Function com o mesmo contrato e apontar o nome abaixo.
export const PIX_FUNCTION = 'create-mp-order'

// Gera (ou re-lê) a cobrança Pix de um pedido já gravado.
// Idempotente: nunca cria cobrança nova para o mesmo pedido nem cobra pedido pago.
export async function createPixOrder(orderId) {
  const { data, error } = await supabase.functions.invoke(PIX_FUNCTION, { body: { orderId } })
  if (error) throw error
  return data
}
