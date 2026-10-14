-- ============================================================
-- MIGRATION 13 — Pix online no pedido — QR + Copia e Cola
-- Rode no Supabase -> SQL Editor, UMA VEZ, DEPOIS da migration-12.
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
-- (O nome 'mercado_pago' no enum virou histórico: hoje significa apenas
--  "Pix online gerado" — o gateway de verdade é definido em src/lib/payments.js)
--
-- O que muda:
--   1) orders ganha mp_order_id (id da Order no MP), mp_payment_id
--      (id do payment dentro da order) e payment_status
--      (pending | approved | rejected | cancelled | expired)
--   2) orders.payment_method passa a aceitar 'mercado_pago'
--   3) índice para buscar pedido pelo mp_order_id (webhook)
-- ============================================================

-- colunas novas
alter table public.orders
  add column if not exists mp_order_id text,
  add column if not exists mp_payment_id text,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','approved','rejected','cancelled','expired'));

-- payment_method: adiciona 'mercado_pago' mantendo os 3 anteriores
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('pix','dinheiro','cartao','mercado_pago'));

-- índice para o webhook achar o pedido pelo id externo do MP
create index if not exists orders_mp_order_id_idx on public.orders (mp_order_id);
create index if not exists orders_external_ref_idx on public.orders (mp_order_id) where mp_order_id is not null;

-- comentário para documentar no Dashboard
comment on column public.orders.mp_order_id is 'ID da Order no Mercado Pago (Orders API v1) - external_reference = orders.id';
comment on column public.orders.mp_payment_id is 'ID do Payment dentro da MP Order (transactions.payments[0].id)';
comment on column public.orders.payment_status is 'Status do pagamento no MP: pending | approved | rejected | cancelled | expired';

notify pgrst, 'reload schema';
