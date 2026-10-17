-- ============================================================
-- MIGRATION 21 — CPF de volta no fluxo de compras
-- Rode no Supabase → SQL Editor, UMA VEZ (DEPOIS da migration-12).
-- IDEMPOTENTE: pode rodar mais de uma vez sem efeito colateral.
--
-- O que muda:
--  1) orders ganha customer_cpf — o CPF em coluna PRÓPRIA no pedido
--     (antes só ia escondido dentro de customer_note);
--  2) place_order v4 aceita p_customer_cpf e p_customer_note — assim o
--     VISITANTE também tem CPF e observação salvos (o update direto era
--     barrado pela RLS para convidado);
--  3) comprador LOGADO: a própria RPC guarda o CPF no perfil (best-effort,
--     nunca derruba o pedido se o CPF já pertence a outra conta);
--  4) lookup_cpf_account: o checkout sem login consulta se o CPF digitado
--     já tem conta e sugere "entrar na sua conta" (continuar como visitante
--     continua possível);
--  5) profiles.cpf normalizado para SÓ DÍGITOS (o front gravava com
--     máscara; o lookup compara os dígitos).
-- ============================================================

-- 1) coluna nova no pedido
alter table public.orders
  add column if not exists customer_cpf text;
create index if not exists orders_customer_cpf_idx on public.orders (customer_cpf);

-- 2) normaliza CPFs de perfil já gravados com máscara
update public.profiles
   set cpf = regexp_replace(cpf, '\D', '', 'g')
 where cpf is not null and cpf ~ '\D';

-- 3) remove a assinatura anterior da RPC (senão o PostgREST acharia duas
--    candidatas e recusaria a chamada — mesmo padrão da migration-9)
drop function if exists public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text);

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
  p_customer_note text default null
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
  v_cpf text := nullif(regexp_replace(coalesce(p_customer_cpf, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(coalesce(p_customer_note, '')), '');
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
    select p.name,
           case
             when p.promo_price is not null and p.promo_until is not null and p.promo_until > now()
               then round(greatest(0, p.promo_price), 2)
             else round(p.price * (1 - p.discount_percent::numeric / 100), 2)
           end
      into v_name, v_price
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

  v_delivery_method := case
    when v_has_retirada and v_has_entrega then 'misto'
    when v_has_retirada then 'retirada'
    else 'entrega'
  end;

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
    origin, customer_cpf, customer_note
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
    v_note
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
    'total', v_total,
    'status', v_status,
    'origin', v_origin,
    'delivery_method', v_delivery_method,
    'items', v_resolved
  );
end $$;

revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text) from public;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text) to anon, authenticated;

-- 4) lookup: o CPF digitado no checkout de VISITANTE já tem conta?
--    Devolve só o primeiro nome (suficiente para "Olá, Maria!") e nada mais.
create or replace function public.lookup_cpf_account(p_cpf text) returns text
language sql
security definer
set search_path = public
as $$
  select split_part(btrim(coalesce(full_name, '')), ' ', 1)
    from public.profiles
   where btrim(coalesce(cpf, '')) <> ''
     and regexp_replace(cpf, '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
   limit 1
$$;

revoke all on function public.lookup_cpf_account(text) from public;
grant execute on function public.lookup_cpf_account(text) to anon, authenticated;

notify pgrst, 'reload schema';