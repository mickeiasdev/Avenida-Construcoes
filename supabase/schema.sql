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
  -- escala de fonte do sistema (100 = normal) — ajustada no painel admin
  font_scale int not null default 100 constraint store_settings_font_scale_range
    check (font_scale between 80 and 130),
  -- respostas rápidas personalizadas do WhatsApp do painel [{ label, text }]
  quick_replies jsonb not null default '[]',
  -- CNPJ da loja (só dígitos) — cabeçalho do cupom/nota de venda
  cnpj text,
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
    check (delivery_method in ('entrega','retirada','misto')), -- misto: parte retirada, parte entrega
  origin text not null default 'site'
    check (origin in ('site','loja')),  -- 'loja' = venda registrada no painel (PDV)
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
  unit_price numeric(10,2) not null,
  -- separa o que o cliente levou do balcão do que fica para entrega depois
  fulfillment text not null default 'entrega' check (fulfillment in ('retirada','entrega')),
  fulfilled_at timestamptz  -- quando o item saiu (retirado no balcão ou entregue)
);

create table if not exists public.coupons (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,                 -- salvo em MAIÚSCULO
  kind text not null default 'percent' check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_total numeric(10,2) not null default 0, -- compra mínima p/ valer
  active boolean not null default true,
  created_at timestamptz not null default now()
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
alter table public.coupons enable row level security;

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

-- a API pública só enxerga produto ATIVO (rascunho/inativo não vaza)
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select
  using (active = true or public.is_admin());
drop policy if exists "admin write products" on public.products;
create policy "admin write products" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read active coupons" on public.coupons;
create policy "read active coupons" on public.coupons for select using (active = true);
drop policy if exists "admin manage coupons" on public.coupons;
create policy "admin manage coupons" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- IMPORTANTE: a RLS acima só garante "a linha é sua" — sem restrição de
-- coluna, o próprio usuário podia mandar PATCH { "role": "admin" } na API
-- (anon key + o JWT dele) e virar administrador. O privilégio por coluna
-- deixa "role" fora do alcance da API; o SQL Editor (owner) continua
-- podendo promover admins, como no passo a passo do fim deste arquivo.
revoke all on table public.profiles from anon, authenticated;
grant select, update (full_name, phone, street, number, complement, district, city, state, zip)
  on table public.profiles to authenticated;

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

-- ADMIN: excluir pedidos (limpar cancelados/antigos) e marcar item como
-- retirado/entregue. Os itens caem junto pelo "on delete cascade".
drop policy if exists "admin orders delete" on public.orders;
create policy "admin orders delete" on public.orders for delete
  using (public.is_admin());
drop policy if exists "admin items update" on public.order_items;
create policy "admin items update" on public.order_items for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin items delete" on public.order_items;
create policy "admin items delete" on public.order_items for delete
  using (public.is_admin());

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
-- exclusão de arquivo quando produto é excluído ou logo/banner trocados
drop policy if exists "admin delete store assets" on storage.objects;
create policy "admin delete store assets" on storage.objects
  for delete using (bucket_id = 'store' and public.is_admin());

-- Histórico completo do cliente: ao entrar na conta, a loja adota os
-- pedidos feitos como VISITANTE com o mesmo CPF/telefone do perfil.
create or replace function public.claim_guest_orders(p_cpf text, p_phone text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cpf   text;
  v_phone text;
  v_count int;
begin
  if v_uid is null then
    return 0;
  end if;
  v_cpf   := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_cpf = '' and length(v_phone) < 10 then
    return 0;
  end if;
  update public.orders o
     set user_id = v_uid,
         is_guest = false
   where o.user_id is null
     and o.is_guest = true
     and (
       (v_cpf <> '' and coalesce(o.customer_cpf, '') = v_cpf)
       or (length(v_phone) >= 10 and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8))
     );
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.claim_guest_orders(text, text) from public;
grant execute on function public.claim_guest_orders(text, text) to authenticated;

-- Mais vendidos da vitrine (ranking público; visitante não lê order_items,
-- então a função roda como SECURITY DEFINER e devolve só id + total).
create or replace function public.top_selling_products(p_limit int default 12)
returns table (product_id uuid, sold bigint)
language sql security definer set search_path = public as $$
  select oi.product_id, coalesce(sum(oi.quantity), 0)::bigint as sold
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where oi.product_id is not null
     and o.status <> 'cancelled'
   group by oi.product_id
   order by sold desc, max(o.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 12), 50))
$$;
revoke all on function public.top_selling_products(int) from public;
grant execute on function public.top_selling_products(int) to anon, authenticated;

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

-- ============================================================
-- CHECKOUT NO SERVIDOR (place_order)
-- ============================================================
-- Preço unitário (com o desconto do produto), subtotal, cupom, total e baixa
-- de estoque são calculados AQUI — o navegador só informa quais itens e
-- quantas unidades. Sem isso o cliente poderia enviar total = 0.
-- a assinatura antiga (10 parâmetros, migration-8) precisa sair: com as
-- colunas novas tendo default, o PostgREST veria duas funções candidatas
drop function if exists public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean);

create or replace function public.place_order(
  p_order_id uuid,
  p_items jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_delivery_method text default 'entrega',
  p_payment_method text default 'pix',
  p_user_id uuid default null,
  p_is_guest boolean default false,
  p_origin text default 'site',
  p_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_pid uuid;
  v_qty int;
  v_name text;
  v_price numeric(10,2);
  v_fulfillment text;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2);
  v_coupon public.coupons%rowtype;
  v_code text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_resolved jsonb := '[]'::jsonb;
  v_origin text;
  v_status text;
  v_delivery_method text;
  v_has_retirada boolean := false;
  v_has_entrega boolean := false;
  v_user_id uuid;
  v_is_guest boolean;
begin
  if p_order_id is null then
    raise exception 'Pedido sem identificador.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item no pedido.';
  end if;

  v_origin := case when p_origin = 'loja' then 'loja' else 'site' end;

  -- quem pode criar pedido em nome de quem
  if v_origin = 'loja' then
    -- venda presencial: só o admin registra, e o pedido não fica preso à
    -- conta dele (cliente da loja não tem login)
    if not public.is_admin() then
      raise exception 'Apenas o admin pode registrar venda na loja.';
    end if;
    v_user_id := null;
    v_is_guest := false;
  elsif auth.uid() is not null then
    if p_user_id is distinct from auth.uid() or coalesce(p_is_guest, false) then
      raise exception 'Pedido inválido para este usuário.';
    end if;
    v_user_id := p_user_id;
    v_is_guest := false;
  elsif not coalesce(p_is_guest, false) or p_user_id is not null then
    raise exception 'Pedido de visitante inválido.';
  else
    v_user_id := null;
    v_is_guest := true;
  end if;

  -- itens: preço SEMPRE relido de products (nunca confia no cliente)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := nullif(v_item->>'product_id', '')::uuid;
    v_qty := greatest(1, least(999, coalesce((v_item->>'quantity')::int, 1)));

    select p.name, round(p.price * (1 - p.discount_percent::numeric / 100), 2)
      into v_name, v_price
      from public.products p
     where p.id = v_pid and p.active = true;
    if not found then
      raise exception 'Produto indisponível no pedido.';
    end if;

    -- retirada x entrega: no site vale o modo escolhido no checkout; na venda
    -- presencial o admin decide item a item (padrão: retirar na hora)
    if v_origin = 'loja' then
      v_fulfillment := case when v_item->>'fulfillment' = 'entrega' then 'entrega' else 'retirada' end;
    else
      v_fulfillment := case when p_delivery_method = 'retirada' then 'retirada' else 'entrega' end;
    end if;
    if v_fulfillment = 'retirada' then v_has_retirada := true; else v_has_entrega := true; end if;

    v_subtotal := v_subtotal + (v_price * v_qty);

    -- guarda o item já precificado: o insert de order_items acontece só
    -- DEPOIS do insert do pedido (order_items.order_id tem FK para orders)
    v_resolved := v_resolved || jsonb_build_object(
      'product_id', v_pid, 'name', v_name, 'qty', v_qty, 'price', v_price,
      'fulfillment', v_fulfillment
    );
  end loop;

  -- cupom validado aqui: existe, está ativo e respeita a compra mínima
  if v_code is not null then
    select * into v_coupon from public.coupons
     where upper(code) = v_code and active = true
     limit 1;
    if not found then
      raise exception 'Cupom inválido ou inativo.';
    end if;
    if v_coupon.min_total > 0 and v_subtotal < v_coupon.min_total then
      raise exception 'Cupom exige compra mínima de R$ %.', to_char(v_coupon.min_total, 'FM999990.00');
    end if;
    v_discount := least(
      v_subtotal,
      case when v_coupon.kind = 'percent'
           then round(v_subtotal * v_coupon.value / 100, 2)
           else v_coupon.value
      end
    );
  else
    v_code := null;
  end if;

  v_total := greatest(0, v_subtotal - v_discount);

  -- parte retirada no balcão + parte para entrega = pedido misto
  v_delivery_method := case
    when v_has_retirada and v_has_entrega then 'misto'
    when v_has_retirada then 'retirada'
    else 'entrega'
  end;

  -- venda presencial sem nada para entregar já nasce concluída
  v_status := coalesce(p_status,
    case when v_origin = 'loja' and not v_has_entrega then 'delivered'
         when v_origin = 'loja' then 'confirmed'
         else 'pending'
    end);
  if v_status not in ('pending','confirmed','preparing','shipping','delivered','cancelled') then
    raise exception 'Status inválido para o pedido.';
  end if;

  insert into public.orders (
    id, user_id, is_guest, status, total, customer_name, customer_phone,
    delivery_address, delivery_method, payment_method, coupon_code, discount, origin
  ) values (
    p_order_id,
    v_user_id,
    v_is_guest,
    v_status,
    v_total,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    v_delivery_method,
    case when p_payment_method in ('pix', 'dinheiro', 'cartao') then p_payment_method else 'pix' end,
    v_code,
    v_discount,
    v_origin
  );

  -- itens + baixa de estoque: o pedido precisa existir ANTES porque
  -- order_items.order_id é uma FK para orders
  for v_item in select * from jsonb_array_elements(v_resolved) loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, fulfillment, fulfilled_at
    ) values (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      v_item->>'fulfillment',
      -- o que o cliente levou do balcão já sai baixado; entrega fica em aberto
      case when v_origin = 'loja' and v_item->>'fulfillment' = 'retirada' then now() else null end
    );

    -- baixa best-effort: nunca deixa negativo e nunca bloqueia a venda
    -- (o admin ajusta o que faltar depois)
    update public.products
       set stock = greatest(0, stock - (v_item->>'qty')::int)
     where id = (v_item->>'product_id')::uuid and stock is not null;
  end loop;

  return jsonb_build_object(
    'id', p_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'status', v_status,
    'origin', v_origin,
    'delivery_method', v_delivery_method,
    'items', v_resolved
  );
end $$;

revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text) from public;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text)
  to anon, authenticated;
