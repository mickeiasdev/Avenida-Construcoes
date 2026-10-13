import { supabase } from './supabaseClient'

// Gateway de Pix online ativo na loja.
// Hoje: AbacatePay (taxas menores + cria a conta com CPF).
// Para voltar ao Mercado Pago, troque o valor abaixo para 'create-mp-order'
// E configure os secrets MP_ACCESS_TOKEN / MP_WEBHOOK_SECRET (ver README).
export const PIX_FUNCTION = 'create-abacate-order'

// Chama a Edge Function que gera (ou re-lê) a cobrança Pix de um pedido já
// gravado. É idempotente: nunca cria cobrança nova para o mesmo pedido nem
// cobra um pedido já pago.
export async function createPixOrder(orderId) {
  const { data, error } = await supabase.functions.invoke(PIX_FUNCTION, { body: { orderId } })
  if (error) throw error
  return data
}
