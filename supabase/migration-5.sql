-- MIGRATION 5 — Forma de entrega e de pagamento no pedido
-- Rode no Supabase → SQL Editor, UMA VEZ.

alter table public.orders
  add column if not exists delivery_method text not null default 'entrega'
    check (delivery_method in ('entrega','retirada')),
  add column if not exists payment_method text not null default 'pix'
    check (payment_method in ('pix','dinheiro','cartao'));
