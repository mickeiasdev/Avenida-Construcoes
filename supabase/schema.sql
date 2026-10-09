-- ============================================================
-- WHITE-LABEL STORE · Schema + RLS + Seed (mocks)
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('admin','client')),
  street text, number text, complement text,
  district text, city text, state text, zip text,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Avenida Construção',
  logo_url text,
  banner_url text,
  primary_color text not null default '#7c3aed',
  secondary_color text not null default '#151022',
  whatsapp text not null default '5511999999999',
  address text default 'Av. das Obras, 1000 - Centro, São Paulo/SP',
  business_hours text default 'Seg a Sex 7h-18h · Sáb 7h-13h',
  -- horários estruturados (usados pela vitrine para aberto/fechado)
  weekday_open  time not null default '07:00',
  weekday_close time not null default '18:00',
  sat_open      time          default '07:00',
  sat_close     time          default '13:00',
  sun_closed    boolean not null default true,
  sun_open      time          default null,
  sun_close     time          default null,
  about text default 'Tudo para sua obra, do alicerce ao acabamento.',
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.categories(id) on delete restrict, -- opcional
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  discount_percent int not null default 0 check (discount_percent between 0 and 95),
  image_url text,
  images text[] not null default '{}',  -- galeria de fotos extras
  stock int check (stock >= 0),         -- opcional: null = sem controle
  active boolean not null default true,
  views int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade, -- null = convidado
  is_guest boolean not null default false,
  delivery_method text not null default 'entrega'
    check (delivery_method in ('entrega','retirada')),
  payment_method text not null default 'pix'
    check (payment_method in ('pix','dinheiro','cartao')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','shipping','delivered','cancelled')),
  total numeric(10,2) not null default 0,
  customer_name text,
  customer_phone text,
  delivery_address text,
  coupon_code text,
  discount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'client')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "public read settings" on public.store_settings;
create policy "public read settings" on public.store_settings for select using (true);
drop policy if exists "admin write settings" on public.store_settings;
create policy "admin write settings" on public.store_settings for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);
drop policy if exists "admin write categories" on public.categories;
create policy "admin write categories" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select using (true);
drop policy if exists "admin write products" on public.products;
create policy "admin write products" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "own orders insert" on public.orders;
create policy "own orders insert" on public.orders for insert
  with check (user_id = auth.uid() or (user_id is null and is_guest = true));
drop policy if exists "admin orders update" on public.orders;
create policy "admin orders update" on public.orders for update
  using (public.is_admin());

drop policy if exists "items read" on public.order_items;
create policy "items read" on public.order_items for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
-- função que permite a checagem do dono mesmo sem leitura pública em orders
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

insert into storage.buckets (id, name, public) values ('store','store',true)
on conflict (id) do nothing;
drop policy if exists "public read store assets" on storage.objects;
create policy "public read store assets" on storage.objects
  for select using (bucket_id = 'store');
drop policy if exists "admin upload store assets" on storage.objects;
create policy "admin upload store assets" on storage.objects
  for insert with check (bucket_id = 'store' and public.is_admin());
drop policy if exists "admin update store assets" on storage.objects;
create policy "admin update store assets" on storage.objects
  for update using (bucket_id = 'store' and public.is_admin());

-- SEED (produção): só a identidade da loja — produtos e categorias
-- são cadastrados pelo painel admin (/admin/produtos e /admin/categorias)
insert into public.store_settings (id) values (1) on conflict (id) do nothing;
update public.store_settings set
  store_name = 'Avenida Construção',
  primary_color = '#7c3aed',
  secondary_color = '#151022',
  whatsapp = '',
  banner_url = 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80',
  logo_url = null
where id = 1;

-- APÓS RODAR ESTE SCHEMA, CRIE O USUÁRIO ADMIN NO PAINEL:
-- 1) Supabase Dashboard → Authentication → Users → "Add user"
--    (email real do responsável + senha forte, marque "Auto Confirm User")
-- 2) Promova para admin:
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'seu-email@dominio.com');
-- 3) Em /admin/configuracoes preencha: WhatsApp real, logo, banner,
--    endereço e horário da loja.

-- ============================================================
-- SUPLEMENTO: REALTIME + CONTADOR DE ACESSOS
-- ============================================================

-- Realtime: permite que a vitrine reaja a mudanças de tema/categorias
-- sem refresh (canal 'store_updates' no StoreContext.jsx)
do $$
begin
  begin
    alter publication supabase_realtime add table public.store_settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.categories;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
end $$;

-- Contador de acessos do produto: RLS impede que não-admins façam UPDATE
-- em products, mas a vitrine precisa incrementar 'views' na página do
-- produto. A função é SECURITY DEFINER e só toca nessa coluna.
create or replace function public.increment_product_views(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products set views = views + 1 where id = p_id;
$$;

revoke all on function public.increment_product_views(uuid) from public;
grant execute on function public.increment_product_views(uuid) to anon, authenticated;
