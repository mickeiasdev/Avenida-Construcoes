-- ============================================================
-- MIGRATION 30 — Catálogo inteligente
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-29).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--  1) products.min_stock — alerta de reposição: badge na lista do
--     painel e card no Dashboard quando o estoque cai no mínimo;
--  2) products.coverage_value + coverage_unit — rendimento por
--     unidade (ex.: 1 saco de cimento cobre 5 m²). Com isso a
--     página do produto ganha a CALCULADORA de material: o cliente
--     informa a área e o site diz quantas unidades comprar;
--  3) store_settings.daily_goal — meta de vendas do dia (R$) para
--     o medidor de progresso no Dashboard.
-- ============================================================

-- 1) estoque mínimo por produto (null = sem alerta)
alter table public.products
  add column if not exists min_stock int;

-- 2) rendimento por unidade p/ calculadora (null = produto sem calculadora)
alter table public.products
  add column if not exists coverage_value numeric(10,2) check (coverage_value is null or coverage_value > 0),
  add column if not exists coverage_unit text not null default 'm²';

-- 3) meta diária de vendas (R$) — 0 = medidor escondido
alter table public.store_settings
  add column if not exists daily_goal numeric(10,2) not null default 0;

notify pgrst, 'reload schema';
