-- ============================================================
-- MIGRATION 32 — Listas de compra recorrente ("lista da obra")
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-31).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda: o cliente logado salva a sacola como uma LISTA nomeada
-- (ex.: "Obra do João") e repede tudo com um toque — o pedreiro que
-- compra os mesmos materiais toda semana não refaz o pedido de novo.
-- ============================================================

create table if not exists public.shopping_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists shopping_lists_user_idx on public.shopping_lists (user_id);
create index if not exists shopping_list_items_list_idx on public.shopping_list_items (list_id);

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

-- dono da lista faz tudo com as listas dele (ninguém mais as vê)
drop policy if exists "owner all lists" on public.shopping_lists;
create policy "owner all lists" on public.shopping_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- itens: acesso via join no dono da lista
drop policy if exists "owner all list items" on public.shopping_list_items;
create policy "owner all list items" on public.shopping_list_items
  for all
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));

notify pgrst, 'reload schema';
