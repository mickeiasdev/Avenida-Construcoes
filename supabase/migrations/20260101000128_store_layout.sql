-- ============================================================
-- MIGRATION 28 — Layout da vitrine (loja x cardápio)
-- 'loja' = e-commerce tradicional (grid de cards, hero, categorias)
-- 'cardapio' = estilo menu de restaurante (lista por categoria, header limpo)
-- Idempotente.
-- ============================================================

alter table public.store_settings
  add column if not exists layout text not null default 'loja'
  check (layout in ('loja', 'cardapio'));

comment on column public.store_settings.layout is 'Layout da vitrine: loja (e-commerce) ou cardapio (menu de restaurante). Escolhido em /admin/configuracoes.';

notify pgrst, 'reload schema';