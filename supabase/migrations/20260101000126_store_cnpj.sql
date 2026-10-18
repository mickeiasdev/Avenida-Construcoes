-- ============================================================
-- MIGRATION 26 — CNPJ da loja (cupom/nota de venda)
-- Necessário no cabeçalho do cupom térmico e da nota de venda.
-- Editável em /admin/configuracoes (Identidade da loja).
-- Idempotente.
-- ============================================================

alter table public.store_settings
  add column if not exists cnpj text;

comment on column public.store_settings.cnpj is 'CNPJ da loja (só dígitos) — cabeçalho do cupom/nota de venda.';

notify pgrst, 'reload schema';