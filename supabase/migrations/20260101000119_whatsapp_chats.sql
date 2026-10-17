-- ============================================================
-- migration-19 · WhatsApp no painel
-- Cache da caixa de entrada: última mensagem de cada conversa +
-- contador de não lidas (alimenta o selo do menu admin e a lista
-- em tempo real, sem depender de polling pesado na Evolution).
--
-- QUEM ESCREVE: só as Edge Functions (service role → bypass RLS).
-- QUEM LÊ: admin (página WhatsApp e selo de não lidas do menu).
-- Fonte primária de conversas continua sendo a Evolution API —
-- esta tabela é o "resumo" sempre atualizado.
-- ============================================================

create table if not exists public.whatsapp_chats (
  remote_jid      text primary key,              -- ex.: 5511999999999@s.whatsapp.net
  phone           text,                          -- só dígitos com DDI (casa com pedidos/clientes)
  name            text,                           -- nome do contato quando conhecido
  last_message    text,
  last_message_at timestamptz,
  last_from_me    boolean not null default false,
  unread_count    int not null default 0,
  updated_at      timestamptz not null default now()
);

alter table public.whatsapp_chats enable row level security;

-- admin lê o inbox; escrita fica só com service role (RLS sem policies de write)
drop policy if exists "admin read whatsapp chats" on public.whatsapp_chats;
create policy "admin read whatsapp chats" on public.whatsapp_chats
  for select using (public.is_admin());

grant select on public.whatsapp_chats to authenticated;

-- Registro ATÔMICO de mensagem nova (chamado pelo webhook whatsapp-webhook):
-- insere o chat se for o primeiro contato e, nas seguintes, atualiza o
-- resumo e soma as não lidas sem correr risco de "perder" incrementos
-- quando chegam mensagens em rajada.
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
    (remote_jid, phone, name, last_message, last_message_at, last_from_me, unread_count)
  values
    (p_jid, replace(p_jid, '@s.whatsapp.net', ''), nullif(trim(p_name), ''),
     left(p_text, 500), p_at, p_from_me, case when p_from_me then 0 else 1 end)
  on conflict (remote_jid) do update set
    last_message    = excluded.last_message,
    last_message_at = excluded.last_message_at,
    last_from_me    = excluded.last_from_me,
    unread_count    = case when excluded.last_from_me
                            then public.whatsapp_chats.unread_count
                            else public.whatsapp_chats.unread_count + 1 end,
    name            = coalesce(nullif(trim(excluded.name), ''), public.whatsapp_chats.name),
    phone           = public.whatsapp_chats.phone,  -- não perde o dígito já salvo
    updated_at      = now();
end $$;

revoke all on function public.wa_register_message(text, text, text, boolean, timestamptz)
  from anon, authenticated;

-- Zera as não lidas de um chat (chamado pelo proxy whatsapp-chat quando o
-- atendente abre a conversa no painel).
create or replace function public.wa_mark_read(p_jid text) returns void
language sql security definer set search_path = public as $$
  update public.whatsapp_chats
     set unread_count = 0, updated_at = now()
   where remote_jid = p_jid and unread_count <> 0;
$$;

revoke all on function public.wa_mark_read(text) from anon, authenticated;

-- Realtime: o selo de não lidas do menu sobe na hora em que o webhook grava
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'whatsapp_chats'
  ) then
    alter publication supabase_realtime add table public.whatsapp_chats;
  end if;
end $$;
