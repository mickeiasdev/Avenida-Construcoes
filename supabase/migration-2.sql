-- ============================================================
-- MIGRAÇÃO 2 — rode ESTE script se você já rodou o schema.sql
-- da versão anterior. Para instalações novas, o schema.sql já
-- inclui estas mudanças (os dois são idempotentes e compatíveis).
-- ============================================================

-- Produto pode ficar SEM categoria (category_id opcional)
alter table public.products alter column category_id drop not null;

-- Estoque opcional (null = sem controle de número no app)
alter table public.products alter column stock drop not null;

-- Galeria de fotos do produto (além da imagem principal)
alter table public.products add column if not exists images text[] not null default '{}';

-- Novas etapas do processo de entrega
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','confirmed','preparing','shipping','delivered','cancelled'));
