-- ============================================================
-- MIGRATION 24 — WhatsApp: encerrar atendimento
-- closed=true tira a conversa da lista do painel (atendimento
-- encerrado pelo admin). Mensagem NOVA do cliente reabre na hora;
-- aviso automático de pedido e conversa aberta pelo admin também
-- reabrem. Idempotente.
-- ============================================================

alter table public.whatsapp_chats
  add column if not exists closed boolean not null default false;

create index if not exists whatsapp_chats_closed_idx on public.whatsapp_chats (closed);

-- v2 do registro de mensagem: mensagem do CLIENTE reabre a conversa
create or replace function public.wa_register_message(
  p_jid     text,
  p_name    text,
  p_text    text,
  p_from_me boolean,
  p_at      timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.whatsapp_chats
    (remote_jid, phone, name, last_message, last_message_at, last_from_me, unread_count, closed)
  values
    (p_jid, replace(p_jid, '@s.whatsapp.net', ''), nullif(trim(p_name), ''),
     left(p_text, 500), p_at, p_from_me, case when p_from_me then 0 else 1 end, false)
  on conflict (remote_jid) do update set
    last_message    = excluded.last_message,
    last_message_at = excluded.last_message_at,
    last_from_me    = excluded.last_from_me,
    unread_count    = case when excluded.last_from_me
                            then public.whatsapp_chats.unread_count
                            else public.whatsapp_chats.unread_count + 1 end,
    name            = coalesce(nullif(trim(excluded.name), ''), public.whatsapp_chats.name),
    phone           = public.whatsapp_chats.phone,
    -- mensagem do cliente reabre o atendimento (a nossa não mexe)
    closed          = case when excluded.last_from_me
                            then public.whatsapp_chats.closed
                            else false end,
    updated_at      = now();
end $$;

revoke all on function public.wa_register_message(text, text, text, boolean, timestamptz)
  from anon, authenticated;

notify pgrst, 'reload schema';