-- ============================================================
-- MIGRATION 16 — CPF único no perfil + chave de notificação WhatsApp
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-14.
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
-- ============================================================

-- CPF no perfil, único por loja (ignora vazios). O checkout já grava o CPF
-- best-effort; aqui a coluna passa a existir de verdade e ser atualizável
-- pelo próprio cliente (a migration-8 travou o UPDATE por coluna).
alter table public.profiles add column if not exists cpf text;
update public.profiles set cpf = null where cpf is not null and btrim(cpf) = '';
create unique index if not exists profiles_cpf_unique on public.profiles (cpf) where cpf is not null;
grant update (cpf) on table public.profiles to authenticated;
comment on column public.profiles.cpf is 'CPF do cliente (único). Preenchido no checkout ou no perfil.';

-- Chave do CallMeBot (opcional): com ela + WhatsApp configurado, o webhook
-- avisa a loja no WhatsApp quando um pagamento Pix é confirmado.
alter table public.store_settings add column if not exists notify_whatsapp_key text;
comment on column public.store_settings.notify_whatsapp_key is 'API key do CallMeBot para aviso automático de pedido pago no WhatsApp da loja (opcional).';

notify pgrst, 'reload schema';
