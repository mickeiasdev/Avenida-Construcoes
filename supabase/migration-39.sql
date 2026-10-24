-- ============================================================
-- MIGRATION 39 — SaaS multi-tenant: FUNDAÇÃO (Fase 1 do
-- PLANO-SAAS-MULTI-TENANT.md). Roda DEPOIS da migration-38.
-- IDEMPOTENTE. 100% compatível com a loja atual: nada muda no ar.
--
-- O que faz (nesta ordem — policies dependem das funções):
--   1) stores — o registro de tenants (uma linha = uma loja/cliente).
--      A loja atual (Avenida) vira a store
--      00000000-0000-0000-0000-000000000001 — o MESMO valor default
--      que a migration-37 já grava nas tabelas com store_id.
--   2) profiles.store_id (usuário pertence a uma loja) e
--      store_settings.store_id (prepara o fim do singleton id = 1).
--   3) Funções: is_admin_of_store(store_id) — o "is_admin com escopo"
--      que vira padrão das policies na Fase 2 — e is_super_admin()
--      (VOCÊ, dono do SaaS). is_admin() passa a aceitar super_admin.
--   4) RLS de stores (usa as funções do passo 3).
-- ============================================================

-- 1) REGISTRO DE TENANTS
create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  subdomain text unique,              -- avenida.sualoja.com (null = loja principal/dominio próprio)
  custom_domain text unique,          -- domínio próprio do cliente (plano Pro, Fase 6)
  owner_user_id uuid references auth.users(id) on delete set null,
  plan text not null default 'trial' check (plan in ('trial','essencial','pro')),
  status text not null default 'active' check (status in ('trial','active','paused','cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- a loja atual vira o tenant #1 (id fixo = default da migration-37)
insert into public.stores (id, name)
select '00000000-0000-0000-0000-000000000001',
       coalesce((select store_name from public.store_settings limit 1), 'Loja principal')
where not exists (select 1 from public.stores where id = '00000000-0000-0000-0000-000000000001');

-- 2) USUÁRIO PERTENCE A UMA LOJA + settings por loja
--    (lojista = profile com role 'admin' e store_id da loja dele)
alter table public.profiles
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'
  references public.stores(id);

alter table public.store_settings
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'
  references public.stores(id);
create unique index if not exists store_settings_store_id_key on public.store_settings (store_id);

-- 3) FUNÇÕES DE ACESSO COM ESCOPO
create or replace function public.is_admin_of_store(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('admin','super_admin') and store_id = p_store
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'super_admin'
  );
$$;

-- is_admin clássico aceita super_admin (hoje ninguém tem essa role)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin'));
$$;

-- 4) RLS DE STORES (agora que as funções existem)
alter table public.stores enable row level security;
drop policy if exists "public read stores" on public.stores;
create policy "public read stores" on public.stores
  for select using (true);  -- vitrine resolve loja pelo subdomínio: nome/subdomínio são públicos
drop policy if exists "admin manages own store" on public.stores;
create policy "admin manages own store" on public.stores
  for all using (public.is_admin_of_store(id) or public.is_super_admin())
  with check (public.is_admin_of_store(id) or public.is_super_admin());

-- 5) versão do banco
insert into public.schema_migrations (version, name)
values (39, 'saas-fundacao-stores')
on conflict (version) do update set name = excluded.name, applied_at = now();

notify pgrst, 'reload schema';
