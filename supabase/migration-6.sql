-- MIGRATION 6 — Horários de funcionamento estruturados
-- Substitui o texto livre de business_hours por seletores reais,
-- permitindo que a vitrine mostre "Aberto agora" / "Fechado" de verdade.
-- Rode no Supabase → SQL Editor, UMA VEZ.

alter table public.store_settings
  add column if not exists weekday_open  time not null default '07:00',
  add column if not exists weekday_close time not null default '18:00',
  add column if not exists sat_open      time          default '07:00',
  add column if not exists sat_close     time          default '13:00',
  add column if not exists sun_closed    boolean       not null default true,
  add column if not exists sun_open      time          default null,
  add column if not exists sun_close     time          default null;
