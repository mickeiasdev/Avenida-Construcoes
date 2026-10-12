-- ============================================================
-- MIGRATION 8 — Segurança do checkout e do perfil
-- Rode no Supabase -> SQL Editor, UMA VEZ, no banco de produção.
-- É idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ============================================================
-- O que esta migration corrige:
--   1. QUALQUER usuário logado podia se promover a admin
--      (a policy de UPDATE em profiles permitia alterar a coluna "role").
--   2. O valor do pedido (total, desconto, cupom, unit_price) era calculado
--      no navegador e aceito pelo banco sem conferência.
--   3. O estoque nunca era baixado quando um pedido era feito.
--   4. Produtos inativos eram legíveis pela API pública.
--   5. A tabela "coupons" faltava em instalações novas (schema.sql).
-- ============================================================


-- ============================================================
-- 1) PROFILES: usuário só atualiza os PRÓPRIOS DADOS CADASTRAIS
-- ============================================================
-- Antes: a RLS garantia apenas "a linha é sua" — e a coluna "role" ia junto,
-- então dava para fazer PATCH /rest/v1/profiles { "role": "admin" } com a
-- anon key + o JWT do próprio usuário e virar administrador.
-- Agora o privilégio é por COLUNA: "role" fica fora do alcance da API.
-- (O SQL Editor / painel continua podendo promover admins, pois roda como
--  owner da tabela — é o passo documentado no fim do schema.sql.)
revoke all on table public.profiles from anon, authenticated;
grant select, update (full_name, phone, street, number, complement, district, city, state, zip)
  on table public.profiles to authenticated;


-- ============================================================
-- 2) COUPONS + desconto por produto: garante o que a migration-7 criou
--    (instalação que rodou só o schema.sql antigo não tem essas colunas)
-- ============================================================
alter table public.products
  add column if not exists discount_percent int not null default 0
    check (discount_percent between 0 and 95);
alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists discount numeric(10,2) not null default 0;
create table if not exists public.coupons (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  kind text not null default 'percent' check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_total numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;

drop policy if exists "read active coupons" on public.coupons;
create policy "read active coupons" on public.coupons for select using (active = true);
drop policy if exists "admin manage coupons" on public.coupons;
create policy "admin manage coupons" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 3) PRODUCTS: a API pública só enxerga produto ATIVO
-- ============================================================
-- Antes: "using (true)" — produto desativado (rascunho, esgotado, preço em
-- revisão) continuava acessível para quem chamasse a API direto.
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select
  using (active = true or public.is_admin());


-- ============================================================
-- 4) PLACE_ORDER: o servidor calcula o pedido
-- ============================================================
-- Preço unitário (com desconto do produto), subtotal, cupom, total e baixa
-- de estoque passam a ser calculados aqui — o navegador só diz QUAIS itens
-- e QUANTAS unidades. Roda como SECURITY DEFINER porque precisa escrever em
-- orders/order_items mesmo para visitante (sem sessão).
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
  p_is_guest boolean default false
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
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2);
  v_coupon public.coupons%rowtype;
  v_code text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_resolved jsonb := '[]'::jsonb;  -- itens já com o preço lido do banco
begin
  if p_order_id is null then
    raise exception 'Pedido sem identificador.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item no pedido.';
  end if;

  -- quem pode criar pedido em nome de quem
  if auth.uid() is not null then
    if p_user_id is distinct from auth.uid() or coalesce(p_is_guest, false) then
      raise exception 'Pedido inválido para este usuário.';
    end if;
  elsif not coalesce(p_is_guest, false) or p_user_id is not null then
    raise exception 'Pedido de visitante inválido.';
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

    v_subtotal := v_subtotal + (v_price * v_qty);

    -- guarda o item já precificado: o insert de order_items acontece só
    -- DEPOIS do insert do pedido (order_items.order_id tem FK para orders)
    v_resolved := v_resolved || jsonb_build_object(
      'product_id', v_pid, 'name', v_name, 'qty', v_qty, 'price', v_price
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

  insert into public.orders (
    id, user_id, is_guest, status, total, customer_name, customer_phone,
    delivery_address, delivery_method, payment_method, coupon_code, discount
  ) values (
    p_order_id,
    p_user_id,
    coalesce(p_is_guest, false),
    'pending',
    v_total,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    case when p_delivery_method = 'retirada' then 'retirada' else 'entrega' end,
    case when p_payment_method in ('pix', 'dinheiro', 'cartao') then p_payment_method else 'pix' end,
    v_code,
    v_discount
  );

  -- itens + baixa de estoque: o pedido precisa existir ANTES porque
  -- order_items.order_id é uma FK para orders
  for v_item in select * from jsonb_array_elements(v_resolved) loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (p_order_id, (v_item->>'product_id')::uuid, v_item->>'name',
            (v_item->>'qty')::int, (v_item->>'price')::numeric);

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
    'total', v_total
  );
end $$;

revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean) from public;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean)
  to anon, authenticated;

-- faz o PostgREST enxergar a função nova na hora
notify pgrst, 'reload schema';


-- ============================================================
-- 5) (OPCIONAL) fechar o caminho antigo de insert direto
-- ============================================================
-- Depois de confirmar que o checkout está usando a RPC place_order (nenhum
-- aviso "[checkout] RPC place_order não encontrada" no console do navegador),
-- descomente os comandos abaixo para remover o insert anônimo de pedidos.
-- A partir daí o único caminho para criar pedido é a função acima, que sabe
-- calcular preço, validar cupom e baixar estoque.
--
-- drop policy if exists "own orders insert" on public.orders;
-- drop policy if exists "items insert" on public.order_items;
-- drop function if exists public.order_item_owner_check(uuid);

-- ============================================================
-- DEPOIS DE RODAR: recarregue a página (Ctrl+F5) para o bundle novo.
-- ============================================================
