-- MIGRATION 7 — Cupons de desconto + desconto percentual por produto
-- Rode no Supabase → SQL Editor, UMA VEZ.

-- 1) desconto "% off" no produto (admin define; vitrine mostra preço antigo riscado)
alter table public.products
  add column if not exists discount_percent int not null default 0
    check (discount_percent between 0 and 95);

-- 2) pedido pode vir com cupom e desconto
alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists discount numeric(10,2) not null default 0;

-- 3) tabela de cupons (o admin cria no painel; o cliente digita no checkout)
create table if not exists public.coupons (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,                 -- salvo em MAIÚSCULO
  kind text not null default 'percent' check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_total numeric(10,2) not null default 0, -- compra mínima p/ valer
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;

-- cliente (inclusive convidado) pode CONSULTAR cupom ativo para aplicar;
drop policy if exists "read active coupons" on public.coupons;
create policy "read active coupons" on public.coupons for select using (active = true);
-- só o admin cria/edita/exclui
drop policy if exists "admin manage coupons" on public.coupons;
create policy "admin manage coupons" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());
