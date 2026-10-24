-- ============================================================
-- MIGRATION 38 — REMOVE o feature "Profissionais" (migration-37):
-- não faz sentido no modelo de negócio desta loja. Roda DEPOIS da
-- migration-37. IDEMPOTENTE.
--
-- O que faz:
--   1) place_order v8: recriada SEM a lógica de profissional — some a
--      validação, a coluna no INSERT e o campo na resposta.
--      ATENÇÃO: o parâmetro p_professional_id CONTINUA na assinatura, mas
--      é ACEITO E IGNORADO. Motivo: bundles antigos em abas abertas enviam
--      esse argumento em TODO pedido (CartContext chamava com ele); sem o
--      parâmetro, o PostgREST não acharia a função e clientes com a loja
--      aberta levariam erro ao finalizar pedido. Quando não houver mais
--      bundle antigo em circulação, remova o parâmetro numa migration
--      futura (drop + create sem ele).
--   2) remove a coluna orders.professional_id
--   3) apaga a tabela professionals (as policies caem junto)
--   4) registra a versão 38 no schema_migrations
-- ============================================================

-- 1) place_order v8
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
  p_delivery_zone text default null,
  p_delivery_cep text default null,
  p_delivery_mode text default null,
  p_delivery_fee numeric default null,
  p_scheduled_at timestamptz default null,
  p_professional_id uuid default null  -- DEPRECATED (migration-38): aceito e IGNORADO
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
  v_cep_range public.delivery_cep_ranges%rowtype;
  v_has_category_item boolean := false;
  v_mode text := case when p_delivery_mode in ('zona','cep','melhor_envio') then p_delivery_mode end;
  v_scheduled timestamptz := null;
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_recent int;
begin
  if p_order_id is null then
    raise exception 'Pedido sem identificador.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item no pedido.';
  end if;
  if v_cpf is not null and length(v_cpf) <> 11 then
    v_cpf := null;
  end if;

  -- ANTI-SPAM: mesmo telefone não pode metralhar a loja (2 pedidos em 2 min
  -- ou 4 em 10 min). Venda no balcão (admin) não passa por aqui.
  v_origin := case when p_origin = 'loja' then 'loja' else 'site' end;
  if v_origin = 'site' and v_phone is not null then
    select count(*) into v_recent
      from public.orders o
     where o.customer_phone = v_phone
       and o.origin = 'site'
       and o.created_at > now() - interval '2 minutes';
    if v_recent >= 2 then
      raise exception 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.';
    end if;
    select count(*) into v_recent
      from public.orders o
     where o.customer_phone = v_phone
       and o.origin = 'site'
       and o.created_at > now() - interval '10 minutes';
    if v_recent >= 4 then
      raise exception 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.';
    end if;
  end if;

  if p_scheduled_at is not null then
    v_scheduled := p_scheduled_at;
    if v_scheduled < now() - interval '15 minutes' or v_scheduled > now() + interval '90 days' then
      raise exception 'Horário de agendamento inválido.';
    end if;
  end if;

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

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := nullif(v_item->>'product_id', '')::uuid;
    v_qty := greatest(1, least(999, coalesce((v_item->>'quantity')::int, 1)));

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

  v_delivery_method := case
    when v_has_retirada and v_has_entrega then 'misto'
    when v_has_retirada then 'retirada'
    else 'entrega'
  end;

  if v_delivery_method = 'entrega' then
    if v_mode = 'zona' and nullif(btrim(coalesce(p_delivery_zone, '')), '') is not null then
      select * into v_zone from public.delivery_zones
       where lower(name) = lower(btrim(p_delivery_zone)) and active = true
       limit 1;
      if found then v_fee := v_zone.fee; end if;
    elsif v_mode = 'cep' and nullif(regexp_replace(coalesce(p_delivery_cep, ''), '\D', '', 'g'), '') is not null then
      select * into v_cep_range from public.delivery_cep_ranges
       where active = true
         and regexp_replace(coalesce(p_delivery_cep, ''), '\D', '', 'g') between cep_start and cep_end
       order by fee asc
       limit 1;
      if found then v_fee := v_cep_range.fee; end if;
    elsif v_mode = 'melhor_envio' and p_delivery_fee is not null and p_delivery_fee >= 0 then
      v_fee := least(p_delivery_fee, 500);
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
    origin, customer_cpf, customer_note, delivery_fee, delivery_zone,
    scheduled_at
  ) values (
    p_order_id,
    v_user_id,
    v_is_guest,
    v_status,
    v_total,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    v_phone,
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    v_delivery_method,
    case when p_payment_method in ('pix', 'dinheiro', 'cartao') then p_payment_method else 'pix' end,
    v_code,
    v_discount,
    v_origin,
    v_cpf,
    v_note,
    v_fee,
    case when v_fee > 0 and v_mode = 'zona' then lower(btrim(p_delivery_zone)) else null end,
    v_scheduled
  );

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

  if v_user_id is not null and v_cpf is not null then
    begin
      update public.profiles
         set cpf = v_cpf
       where id = v_user_id
         and (cpf is null or regexp_replace(cpf, '\D', '', 'g') <> v_cpf);
    exception when unique_violation then
      null;
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
    'scheduled_at', v_scheduled,
    'items', v_resolved
  );
end $$;

revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text, text, text, text, numeric, timestamptz, uuid) from public;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, uuid, boolean, text, text, text, text, text, text, text, numeric, timestamptz, uuid) to anon, authenticated;

-- 2) coluna do pedido some (pedidos existentes perdem o valor — feature
--    desligada de propósito; agendamento por horário continua normal)
alter table public.orders
  drop column if exists professional_id;

-- 3) tabela de profissionais some com as policies
drop table if exists public.professionals;

-- 4) versão do banco
insert into public.schema_migrations (version, name)
values (38, 'remove-profissionais')
on conflict (version) do update set name = excluded.name, applied_at = now();

notify pgrst, 'reload schema';
