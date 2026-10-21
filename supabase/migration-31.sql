-- ============================================================
-- MIGRATION 31 — Frete por zona + cupons avançados
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-30).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--  1) delivery_zones — zonas de entrega com taxa e prazo, editadas
--     no painel (Configurações) e escolhidas no checkout. O cliente
--     vê o custo da entrega ANTES de finalizar — menos abandono;
--  2) orders ganha delivery_fee + delivery_zone (e followup_sent_at,
--     usado pela página de Automações do painel);
--  3) coupons ganha valid_from/valid_until (janela de validade),
--     first_purchase_only (só a primeira compra) e category_id
--     (vale só para produtos da categoria);
--  4) place_order v5: a TAXA é relida da tabela delivery_zones pelo
--     NOME da zona — nunca confia no cliente — e o cupom passa a
--     validar janela/primeira compra/categoria no servidor.
-- ============================================================

-- 1) zonas de entrega
create table if not exists public.delivery_zones (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  fee numeric(10,2) not null default 0 check (fee >= 0),
  eta text,                          -- prazo humano: "hoje", "até 48h", "2 dias úteis"
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.delivery_zones enable row level security;
drop policy if exists "public read zones" on public.delivery_zones;
create policy "public read zones" on public.delivery_zones
  for select using (true);
drop policy if exists "admin write zones" on public.delivery_zones;
create policy "admin write zones" on public.delivery_zones
  for all using (public.is_admin()) with check (public.is_admin());

-- 2) pedido: taxa/zona + controle de follow-up (Automações)
alter table public.orders
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists delivery_zone text,
  add column if not exists followup_sent_at timestamptz;

-- 3) cupons avançados
alter table public.coupons
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists first_purchase_only boolean not null default false,
  add column if not exists category_id uuid references public.categories(id) on delete set null;

-- 4) place_order v5 (substitui a v4 da migration-21)
drop function if exists public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text);

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
  p_status text default null,
  p_customer_cpf text default null,
  p_customer_note text default null,
  p_delivery_zone text default null
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
  v_category_id uuid;
  v_fulfillment text;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_fee numeric(10,2) := 0;
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
  v_cpf text := nullif(regexp_replace(coalesce(p_customer_cpf, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_zone public.delivery_zones%rowtype;
  v_has_category_item boolean := false;
begin
  if p_order_id is null then
    raise exception 'Pedido sem identificador.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item no pedido.';
  end if;
  if v_cpf is not null and length(v_cpf) <> 11 then
    v_cpf := null; -- CPF mal formado não trava o pedido, só não é gravado
  end if;

  v_origin := case when p_origin = 'loja' then 'loja' else 'site' end;

  -- quem pode criar pedido em nome de quem
  if v_origin = 'loja' then
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

    -- preço relido do banco; PROMOÇÃO ATIVA tem prioridade sobre o desconto comum
    select p.name, p.category_id,
           case
             when p.promo_price is not null and p.promo_until is not null and p.promo_until > now()
               then round(greatest(0, p.promo_price), 2)
             else round(p.price * (1 - p.discount_percent::numeric / 100), 2)
           end
      into v_name, v_category_id, v_price
      from public.products p
     where p.id = v_pid and p.active = true;
    if not found then
      raise exception 'Produto indisponível no pedido.';
    end if;

    if v_origin = 'loja' then
      v_fulfillment := case when v_item->>'fulfillment' = 'entrega' then 'entrega' else 'retirada' end;
    else
      v_fulfillment := case when p_delivery_method = 'retirada' then 'retirada' else 'entrega' end;
    end if;
    if v_fulfillment = 'retirada' then v_has_retirada := true; else v_has_entrega := true; end if;

    v_subtotal := v_subtotal + (v_price * v_qty);

    v_resolved := v_resolved || jsonb_build_object(
      'product_id', v_pid, 'name', v_name, 'qty', v_qty, 'price', v_price,
      'category_id', to_jsonb(v_category_id),
      'fulfillment', v_fulfillment
    );
  end loop;

  -- cupom validado AQUI (servidor): ativo, janela de validade, compra
  -- mínima, PRIMEIRA COMPRA e CATEGORIA — as regras novas da migration-31
  if v_code is not null then
    select * into v_coupon from public.coupons
     where upper(code) = v_code and active = true
     limit 1;
    if not found then
      raise exception 'Cupom inválido ou inativo.';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'Este cupom ainda não está valendo.';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'Este cupom venceu.';
    end if;
    if v_coupon.min_total > 0 and v_subtotal < v_coupon.min_total then
      raise exception 'Cupom exige compra mínima de R$ %.', to_char(v_coupon.min_total, 'FM999990.00');
    end if;
    if v_coupon.first_purchase_only then
      if exists (
        select 1 from public.orders o
         where (o.user_id is not null and o.user_id = v_user_id)
            or (v_cpf is not null and o.customer_cpf = v_cpf)
      ) then
        raise exception 'Este cupom vale só para a primeira compra.';
      end if;
    end if;
    if v_coupon.category_id is not null then
      select exists (
        select 1 from jsonb_array_elements(v_resolved) e
         where (e->>'category_id')::uuid = v_coupon.category_id
      ) into v_has_category_item;
      if not v_has_category_item then
        raise exception 'Este cupom vale só para produtos de uma categoria específica.';
      end if;
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

  -- FRETE: a taxa vem SEMPRE da tabela (o cliente só manda o NOME da
  -- zona); zona inexistente/inativa = entrega grátis (compatível com
  -- lojas sem a migration configurada)
  v_delivery_method := case
    when v_has_retirada and v_has_entrega then 'misto'
    when v_has_retirada then 'retirada'
    else 'entrega'
  end;

  if v_delivery_method = 'entrega' and nullif(btrim(coalesce(p_delivery_zone, '')), '') is not null then
    select * into v_zone from public.delivery_zones
     where lower(name) = lower(btrim(p_delivery_zone)) and active = true
     limit 1;
    if found then
      v_fee := v_zone.fee;
    end if;
  end if;

  v_total := greatest(0, v_subtotal - v_discount + v_fee);

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
    delivery_address, delivery_method, payment_method, coupon_code, discount,
    origin, customer_cpf, customer_note, delivery_fee, delivery_zone
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
    v_origin,
    v_cpf,
    v_note,
    v_fee,
    case when v_fee > 0 then lower(btrim(p_delivery_zone)) else null end
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
      case when v_origin = 'loja' and v_item->>'fulfillment' = 'retirada' then now() else null end
    );

    update public.products
       set stock = greatest(0, stock - (v_item->>'qty')::int)
     where id = (v_item->>'product_id')::uuid and stock is not null;
  end loop;

  -- Comprador LOGADO: guarda o CPF no perfil também (best-effort — o CPF
  -- único da migration-16 pode rejeitar; o pedido JÁ foi gravado com ele).
  if v_user_id is not null and v_cpf is not null then
    begin
      update public.profiles
         set cpf = v_cpf
       where id = v_user_id
         and (cpf is null or regexp_replace(cpf, '\D', '', 'g') <> v_cpf);
    exception when unique_violation then
      null; -- CPF pertence a outra conta: mantém o que estava
    end;
  end if;

  return jsonb_build_object(
    'id', p_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_fee,
    'total', v_total,
    'status', v_status,
    'origin', v_origin,
    'delivery_method', v_delivery_method,
    'items', v_resolved
  );
end $$;

revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text, text) from public;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
