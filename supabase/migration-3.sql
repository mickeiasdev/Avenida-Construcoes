-- MIGRATION 3 — Checkout de visitante (pedido sem login)
-- Rode no Supabase → SQL Editor, UMA VEZ, no banco de produção.

-- 1) user_id passa a aceitar NULL (= convidado)
alter table public.orders alter column user_id drop not null;

-- 2) marcador explícito de pedido de convidado (controle no admin)
alter table public.orders add column if not exists is_guest boolean not null default false;

-- 3) Política de insert: logado insere com o próprio id; visitante insere com user_id NULL
drop policy if exists "own orders insert" on public.orders;
create policy "own orders insert" on public.orders for insert
  with check (user_id = auth.uid() or (user_id is null and is_guest = true));

-- 4) Itens: visitante grava itens no próprio pedido (user_id null)
drop policy if exists "items insert" on public.order_items;
create policy "items insert" on public.order_items for insert with check (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id = auth.uid() or o.user_id is null)));
