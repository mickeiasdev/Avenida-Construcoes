-- ============================================================
-- MIGRATION 23 — WhatsApp: conversas "conhecidas" da loja
-- A lista do painel só exibe números que a loja conhece: cliente de
-- pedido, cliente cadastrado ou conversa que o PRÓPRIO ADMIN abriu.
-- known=true marca isso. O sync (edge function whatsapp-chat) casa
-- o telefone da conversa com orders/profiles e preenche o nome.
-- Idempotente.
-- ============================================================

alter table public.whatsapp_chats
  add column if not exists known boolean not null default false;

-- conversas abertas manualmente pelo admin também são conhecidas
create index if not exists whatsapp_chats_known_idx on public.whatsapp_chats (known);

notify pgrst, 'reload schema';