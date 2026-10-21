-- ============================================================
-- MIGRATION 33 — Avaliações de produto (prova social com moderação)
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-32).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--  1) product_reviews — nota (1-5), comentário e foto opcional;
--  2) ANTI-FAKE: a policy de INSERT só aceita review de pedido
--     ENTREGUE do próprio cliente que contenha o produto — nota
--     fria de quem nunca comprou não entra;
--  3) MODERAÇÃO: review nasce "não aprovada"; o painel aprova
--     (vai à vitrine) ou apaga. Só as aprovadas são públicas.
-- ============================================================

create table if not exists public.product_reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  -- FK para PROFILES (não auth.users): o PostgREST só resolve o embed
  -- "profiles(full_name)" quando o FK aponta para a tabela pública.
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  photo_url text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_product_idx on public.product_reviews (product_id);
create index if not exists product_reviews_pending_idx on public.product_reviews (approved, created_at);

alter table public.product_reviews enable row level security;

-- público: só review APROVADA; autor e admin veem a própria/todas
drop policy if exists "read reviews" on public.product_reviews;
create policy "read reviews" on public.product_reviews
  for select using (
    approved = true
    or user_id = auth.uid()
    or public.is_admin()
  );

-- cliente avalia: exige pedido ENTREGUE dele com o produto (anti-fake)
drop policy if exists "own insert from delivered order" on public.product_reviews;
create policy "own insert from delivered order" on public.product_reviews
  for insert with check (
    user_id = auth.uid()
    and order_id is not null
    and rating between 1 and 5
    and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.user_id = auth.uid()
         and o.status = 'delivered'
         and exists (
           select 1 from public.order_items oi
            where oi.order_id = o.id and oi.product_id = product_id
         )
    )
  );

-- admin: aprova e apaga
drop policy if exists "admin manage reviews" on public.product_reviews;
create policy "admin manage reviews" on public.product_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- CORREÇÃO (v2 — rode o arquivo inteiro de novo se já tinha rodado a v1):
-- a primeira versão criava o FK user_id apontando para auth.users, e o
-- PostgREST não consegue resolver o embed "profiles(full_name)" assim
-- (erro "Could not find a relationship"). Reaponta para public.profiles.
alter table public.product_reviews
  drop constraint if exists product_reviews_user_id_fkey;
-- (mesmo nome que o Postgres daria ao FK de user_id — drop e add idempotentes)
alter table public.product_reviews
  add constraint product_reviews_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';
