-- ============================================================
-- MIGRATION 17 — remove o teste do CallMeBot
-- Rode no Supabase → SQL Editor, UMA VEZ (só precisa se você chegou a rodar
-- a migration-16 quando ela ainda criava esta coluna).
-- As notificações de WhatsApp são via Evolution API (secrets das functions).
-- ============================================================
alter table public.store_settings drop column if exists notify_whatsapp_key;
notify pgrst, 'reload schema';
