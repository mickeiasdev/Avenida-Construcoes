-- MIGRATION 4 — Corrige o insert de order_items para visitantes
-- O problema: a policy anterior fazia SELECT em public.orders para checar
-- o dono do pedido, mas convidado não tem leitura em orders → o EXISTS
-- falhava e o RLS bloqueava com "new row violates row-level security policy".
-- A função SECURITY DEFINER roda como dono da tabela e ignora o RLS,
-- então a checagem funciona para logado E visitante.
--
-- Rode no Supabase → SQL Editor, UMA VEZ.

create or replace function public.order_item_owner_check(p_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.user_id = auth.uid() or (o.is_guest and o.user_id is null))
  );
$$;

drop policy if exists "items insert" on public.order_items;
create policy "items insert" on public.order_items for insert
  with check (public.order_item_owner_check(order_id));
