-- ============================================================
-- MIGRATION 35 — Carrinho abandonado + notificações push (PWA)
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-34).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--  1) cart_snapshots — a sacola do visitante (localStorage) é
--     sincronizada com o banco (anon upsert por device_id): o
--     painel lista carrinhos parados > 2h e oferece o clique
--     "recuperar pelo WhatsApp". Dados NÃO sensíveis (itens+total;
--     telefone só aparece se o cliente logou ou digitou no checkout);
--  2) push_subscriptions — endpoints Web Push por usuário: a Edge
--     Function push-order-status avisa "seu pedido saiu para
--     entrega" no celular de quem ativou as notificações (PWA).
-- ============================================================

-- ---------- carrinho abandonado ----------
create table if not exists public.cart_snapshots (
  device_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  phone text,
  items jsonb not null default '[]',
  total numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cart_snapshots enable row level security;

-- upsert anônimo por device_id (dado não sensível — itens e total).
-- O cliente gera e guarda o próprio device_id no localStorage.
drop policy if exists "anon upsert snapshots" on public.cart_snapshots;
create policy "anon upsert snapshots" on public.cart_snapshots
  for insert to anon, authenticated with check (true);
drop policy if exists "anon update snapshots" on public.cart_snapshots;
create policy "anon update snapshots" on public.cart_snapshots
  for update to anon, authenticated using (true) with check (true);

-- só o painel lê (aqui moram telefones de quem logou/checkout)
drop policy if exists "admin read snapshots" on public.cart_snapshots;
create policy "admin read snapshots" on public.cart_snapshots
  for select using (public.is_admin());

-- ---------- notificações push ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- dono gerencia as próprias assinaturas (ativar/desativar notificações)
drop policy if exists "owner all subscriptions" on public.push_subscriptions;
create policy "owner all subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
