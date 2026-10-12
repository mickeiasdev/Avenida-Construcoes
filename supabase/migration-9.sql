-- MIGRATION 9 — Venda na loja (PDV) + separação retirada/entrega + gestão de pedidos
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-8.
--
-- O que muda:
--  1) order_items ganha "fulfillment" (retirada | entrega) e "fulfilled_at";
--  2) orders ganha "origin" (site | loja) e delivery_method aceita 'misto';
--  3) place_order passa a receber p_origin/p_status e o fulfillment de cada
--     item — a assinatura antiga é REMOVIDA, senão o PostgREST veria duas
--     funções candidatas (as novas colunas têm default) e recusaria a chamada;
--  4) admin pode excluir pedidos (limpar cancelados/antigos) e marcar itens
--     como retirados/entregues.

-- ============================================================
-- 0) remove a assinatura antiga da RPC (a nova entra no passo 3)
-- ============================================================
drop function if exists public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean);

-- ============================================================
-- 1) Colunas novas
-- ============================================================
alter table public.products
  add column if not exists discount_percent int not null default 0;
alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists discount numeric(10,2) not null default 0;

alter table public.orders
  add column if not exists origin text not null default 'site';
alter table public.orders drop constraint if exists orders_origin_check;
alter table public.orders add constraint orders_origin_check
  check (origin in ('site','loja'));

-- misto = parte retirada no balcão, parte para entrega depois
alter table public.orders drop constraint if exists orders_delivery_method_check;
alter table public.orders add constraint orders_delivery_method_check
  check (delivery_method in ('entrega','retirada','misto'));

alter table public.order_items
  add column if not exists fulfillment text not null default 'entrega';
alter table public.order_items
  add column if not exists fulfilled_at timestamptz;
alter table public.order_items drop constraint if exists order_items_fulfillment_check;
alter table public.order_items add constraint order_items_fulfillment_check
  check (fulfillment in ('retirada','entrega'));

create index if not exists order_items_fulfillment_idx on public.order_items (fulfillment);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);

-- ============================================================
-- 2) POLÍTICAS: excluir pedidos e marcar itens (só admin)
--    order_items cai junto pelo "on delete cascade"
-- ============================================================
drop policy if exists "admin orders delete" on public.orders;
create policy "admin orders delete" on public.orders for delete
  using (public.is_admin());

drop policy if exists "admin items update" on public.order_items;
create policy "admin items update" on public.order_items for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin items delete" on public.order_items;
create policy "admin items delete" on public.order_items for delete
  using (public.is_admin());

-- ============================================================
-- 3) place_order v2 (preço/cupom/estoque no servidor + retirada x entrega)
-- ============================================================
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
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text) to anon, authenticated;

-- avisa o PostgREST para recarregar o cache de funções
notify pgrst, 'reload schema';
