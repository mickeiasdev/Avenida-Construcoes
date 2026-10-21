-- ============================================================
-- MIGRATION 34 — Banners promocionais da vitrine (carrossel)
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-33).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda: campanhas ("semana do acabamento") ganham lugar na
-- vitrine. A Home mostra um CARROSSEL com os banners ativos (foto,
-- título, subtítulo e botão) em vez do banner fixo único; sem
-- banners cadastrados o hero atual continua valendo.
-- ============================================================

create table if not exists public.home_banners (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  title text,
  subtitle text,
  cta_text text,
  cta_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.home_banners enable row level security;

drop policy if exists "public read banners" on public.home_banners;
create policy "public read banners" on public.home_banners
  for select using (true);

drop policy if exists "admin write banners" on public.home_banners;
create policy "admin write banners" on public.home_banners
  for all using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
