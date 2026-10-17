-- ============================================================
-- MIGRATION 20 — tamanho da fonte do sistema (configurável no painel)
-- Rode no Supabase → SQL Editor, UMA VEZ (idempotente).
-- Adiciona font_scale em store_settings: 100 = tamanho normal.
-- O painel ajusta em /admin/configuracoes e o app inteiro segue
-- (vitrine + painel): a base de rem do <html> é escalada em runtime.
-- ============================================================

alter table public.store_settings
  add column if not exists font_scale int not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_font_scale_range'
  ) then
    alter table public.store_settings
      add constraint store_settings_font_scale_range
      check (font_scale between 80 and 130);
  end if;
end $$;
