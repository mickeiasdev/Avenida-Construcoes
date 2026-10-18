-- ============================================================
-- MIGRATION 25 — Respostas rápidas personalizadas do WhatsApp
-- O lojista cria/edita/exclui respostas próprias dentro do chat
-- (menu ⚡ > Editar respostas). Ficam nas configurações da loja em
-- jsonb [{ label, text }] — o Realtime de store_settings espalha as
-- mudanças para todos os paineis abertos. As respostas automáticas
-- (com dados da loja) continuam fixas no código.
-- Idempotente.
-- ============================================================

alter table public.store_settings
  add column if not exists quick_replies jsonb not null default '[]'::jsonb;

comment on column public.store_settings.quick_replies is 'Respostas rápidas personalizadas do WhatsApp do painel: [{ label, text }]. Editáveis no próprio chat.';

notify pgrst, 'reload schema';