-- ============================================================
-- MIGRATION 15 — Suporte a gateway de Pix genérico (AbacatePay)
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-14.
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--   1) orders ganha payment_provider ('mercado_pago' | 'abacatepay'),
--      payment_ref (id da cobrança no gateway, ex.: pix_char_...),
--      payment_qr_code (Pix Copia e Cola) e payment_qr_base64 (imagem PNG)
--      — a AbacatePay não tem endpoint para re-ler o QR depois, então ele
--      é guardado aqui (a Edge Function que devolve ao cliente lê com
--      service_role; a RLS continua protegendo a leitura direta).
--   2) índice para o webhook achar o pedido por payment_ref.
-- ============================================================

alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_ref text;
alter table public.orders add column if not exists payment_qr_code text;
alter table public.orders add column if not exists payment_qr_base64 text;

create index if not exists idx_orders_payment_ref
  on public.orders (payment_ref)
  where payment_ref is not null;

comment on column public.orders.payment_provider is 'gateway do Pix online: mercado_pago | abacatepay';
comment on column public.orders.payment_ref is 'id da cobrança no gateway (ex.: pix_char_...)';
comment on column public.orders.payment_qr_code is 'Pix Copia e Cola da cobrança ativa';
comment on column public.orders.payment_qr_base64 is 'imagem PNG do QR (base64, sem prefixo data:)';

notify pgrst, 'reload schema';
