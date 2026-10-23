-- ============================================================
-- TESTE DO place_order (v7) — cole no SQL Editor e confira a aba
-- "Messages": cada cenário imprime ✅ ou ❌ com o motivo.
-- Requisito: migrations 8 a 37 aplicadas. Re-executável (limpa os
-- artefatos de teste "ZZ-TESTE" no começo e no fim).
-- ============================================================

-- ============ LIMPEZA (idempotente) ============
delete from public.order_items where order_id::text like '10000000-0000-4000-8000-%';
delete from public.orders      where id::text like '10000000-0000-4000-8000-%';
delete from public.products    where name like 'ZZ-TESTE%';
delete from public.coupons     where code like 'ZZTESTE%';
delete from public.delivery_zones     where name = 'ZZ-TESTE-ZONA';
delete from public.delivery_cep_ranges where label = 'ZZ-TESTE-CEP';
delete from public.professionals where name like 'ZZ-TESTE%';

-- ============ CENÁRIOS DE PREÇO ============

do $$ -- 1. promoção ATIVA tem prioridade sobre o desconto percentual
declare v_res jsonb; v_ok boolean := true;
begin
  insert into public.products (id, name, price, discount_percent, promo_price, promo_until, active)
  values ('10000000-0000-4000-8000-000000000001', 'ZZ-TESTE promo', 100, 10, 70, now() + interval '30 days', true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000101',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      p_customer_phone => '5599900000001', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'total')::numeric <> 70 then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 1. promo ativa vence o desconto (total 70)'; else raise notice '❌ 1. esperava total 70 — veio %', coalesce(v_res->>'total','ERRO'); end if;
end $$;

do $$ -- 2. sem promoção: desconto percentual comum aplica (10% de 100 = 90)
declare v_res jsonb; v_ok boolean := true;
begin
  insert into public.products (id, name, price, discount_percent, active)
  values ('10000000-0000-4000-8000-000000000002', 'ZZ-TESTE desconto', 100, 10, true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000102',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000002","quantity":1}]'::jsonb,
      p_customer_phone => '5599900000002', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'total')::numeric <> 90 then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 2. desconto comum aplica (total 90)'; else raise notice '❌ 2. esperava 90 — veio %', coalesce(v_res->>'total','ERRO'); end if;
end $$;

-- ============ CENÁRIOS DE CUPOM ============

do $$ -- 3. cupom com compra mínima bloqueia pedido pequeno
declare v_err text; v_ok boolean := false;
begin
  insert into public.coupons (code, kind, value, min_total, active)
  values ('ZZTESTE50', 'percent', 50, 500, true);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000003', 'ZZ-TESTE barato', 100, true);
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000103',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
      p_coupon_code => 'ZZTESTE50',
      p_customer_phone => '5599900000003', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('compra mínima' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 3. cupom com mínimo bloqueia (compra mínima)'; else raise notice '❌ 3. deveria bloquear por compra mínima — %', coalesce(v_err, 'passou!'); end if;
end $$;

do $$ -- 4. cupom vencido é recusado
declare v_err text; v_ok boolean := false;
begin
  insert into public.coupons (code, kind, value, active, valid_from, valid_until)
  values ('ZZTESTEV', 'fixed', 10, true, now() - interval '10 days', now() - interval '1 day');
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000004', 'ZZ-TESTE venc', 100, true);
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000104',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000004","quantity":1}]'::jsonb,
      p_coupon_code => 'ZZTESTEV',
      p_customer_phone => '5599900000004', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('venceu' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 4. cupom vencido recusado (venceu)'; else raise notice '❌ 4. deveria recusar cupom vencido — %', coalesce(v_err, 'passou!'); end if;
end $$;

do $$ -- 5. cupom de PRIMEIRA compra recusa cliente que já pediu (mesmo CPF)
declare v_err text; v_ok boolean := false;
begin
  insert into public.coupons (code, kind, value, active, first_purchase_only)
  values ('ZZTESTE1A', 'fixed', 10, true, true);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000005', 'ZZ-TESTE 1a', 100, true);
  -- pedido anterior do mesmo CPF
  insert into public.orders (id, is_guest, status, total, customer_phone, customer_cpf, origin)
  values ('10000000-0000-4000-8000-000000000105', true, 'delivered', 100, '5599900000005', '11122233344', 'site');
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000115',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000005","quantity":1}]'::jsonb,
      p_coupon_code => 'ZZTESTE1A',
      p_customer_cpf => '11122233344',
      p_customer_phone => '5599900000015', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('primeira compra' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 5. cupom 1ª compra recusa CPF com histórico'; else raise notice '❌ 5. deveria recusar (primeira compra) — %', coalesce(v_err, 'passou!'); end if;
end $$;

do $$ -- 6. cupom por categoria recusa sacola sem item da categoria
declare v_err text; v_ok boolean := false; v_cat uuid;
begin
  insert into public.categories (name, slug) values ('ZZ-TESTE cat', 'zz-teste-cat') on conflict (slug) do nothing;
  select id into v_cat from public.categories where slug = 'zz-teste-cat';
  insert into public.coupons (code, kind, value, active, category_id)
  values ('ZZTESTECAT', 'percent', 20, true, v_cat);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000006', 'ZZ-TESTE fora-cat', 100, true);
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000106',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000006","quantity":1}]'::jsonb,
      p_coupon_code => 'ZZTESTECAT',
      p_customer_phone => '5599900000006', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('categoria' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 6. cupom por categoria exige item da categoria'; else raise notice '❌ 6. deveria recusar por categoria — %', coalesce(v_err, 'passou!'); end if;
end $$;

do $$ -- 7. cupom percentual aplica no total (10% de 200 = 180)
declare v_res jsonb; v_ok boolean := true;
begin
  insert into public.coupons (code, kind, value, active) values ('ZZTESTE10', 'percent', 10, true);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000007', 'ZZ-TESTE cupom', 200, true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000107',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000007","quantity":1}]'::jsonb,
      p_coupon_code => 'ZZTESTE10',
      p_customer_phone => '5599900000007', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'total')::numeric <> 180 then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 7. cupom 10% aplica (total 180)'; else raise notice '❌ 7. esperava 180 — veio %', coalesce(v_res->>'total','ERRO'); end if;
end $$;

-- ============ CENÁRIOS DE FRETE ============

do $$ -- 8. frete por zona: taxa relida da tabela (não do cliente)
declare v_res jsonb; v_ok boolean := true;
begin
  insert into public.delivery_zones (name, fee, active) values ('ZZ-TESTE-ZONA', 10, true);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000008', 'ZZ-TESTE zona', 100, true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000108',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000008","quantity":1}]'::jsonb,
      p_delivery_method => 'entrega', p_delivery_zone => 'zz-teste-zona', p_delivery_mode => 'zona',
      p_delivery_fee => 999, -- cliente tentando mentir: servidor ignora
      p_customer_phone => '5599900000008', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'delivery_fee')::numeric <> 10 or (v_res->>'total')::numeric <> 110 then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 8. frete por zona: servidor cobra os 10 da tabela (ignora os 999 do cliente)'; else raise notice '❌ 8. frete zona deveria ser 10 — veio %', coalesce(v_res->>'delivery_fee','ERRO'); end if;
end $$;

do $$ -- 9. frete por faixa de CEP: taxa da faixa mais barata que contém o CEP
declare v_res jsonb; v_ok boolean := true;
begin
  insert into public.delivery_cep_ranges (label, cep_start, cep_end, fee, active)
  values ('ZZ-TESTE-CEP', '60000000', '60999999', 20, true);
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000009', 'ZZ-TESTE cep', 100, true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000109',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000009","quantity":1}]'::jsonb,
      p_delivery_method => 'entrega', p_delivery_cep => '60123456', p_delivery_mode => 'cep',
      p_customer_phone => '5599900000009', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'delivery_fee')::numeric <> 20 or (v_res->>'total')::numeric <> 120 then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 9. frete por CEP: 20 da faixa (total 120)'; else raise notice '❌ 9. frete CEP deveria ser 20 — veio %', coalesce(v_res->>'delivery_fee','ERRO'); end if;
end $$;

-- ============ CENÁRIOS DE AGENDAMENTO E ANTI-SPAM ============

do $$ -- 10. agendamento no passado é recusado
declare v_err text; v_ok boolean := false;
begin
  insert into public.products (id, name, price, is_service, active)
  values ('10000000-0000-4000-8000-000000000010', 'ZZ-TESTE servico', 50, true, true);
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000110',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000010","quantity":1}]'::jsonb,
      p_delivery_method => 'retirada',
      p_scheduled_at => now() - interval '2 days',
      p_customer_phone => '5599900000010', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('agendamento inválido' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 10. agendamento no passado recusado'; else raise notice '❌ 10. deveria recusar agendamento no passado — %', coalesce(v_err, 'passou!'); end if;
end $$;

do $$ -- 11. agendamento com PROFISSIONAL grave o id dele no pedido
declare v_res jsonb; v_pro uuid; v_ok boolean := true;
begin
  insert into public.professionals (name, active) values ('ZZ-TESTE Pro', true) returning id into v_pro;
  insert into public.products (id, name, price, is_service, active)
  values ('10000000-0000-4000-8000-000000000011', 'ZZ-TESTE servico2', 50, true, true);
  begin
    select public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000111',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000011","quantity":1}]'::jsonb,
      p_delivery_method => 'retirada',
      p_scheduled_at => now() + interval '2 days',
      p_professional_id => v_pro,
      p_customer_phone => '5599900000011', p_is_guest => true
    ) into v_res;
    if v_res is null or (v_res->>'professional_id')::uuid is distinct from v_pro then v_ok := false; end if;
  exception when others then v_ok := false;
  end;
  if v_ok then raise notice '✅ 11. agendamento com profissional gravado'; else raise notice '❌ 11. profissional deveria ir no pedido — %', coalesce(v_res->>'professional_id','ERRO'); end if;
end $$;

do $$ -- 12. ANTI-SPAM: terceiro pedido do mesmo telefone em 2 min é recusado
declare v_err text; v_ok boolean := false;
begin
  insert into public.products (id, name, price, active)
  values ('10000000-0000-4000-8000-000000000012', 'ZZ-TESTE spam', 10, true);
  perform public.place_order(
    p_order_id => '10000000-0000-4000-8000-000000000112',
    p_items => '[{"product_id":"10000000-0000-4000-8000-000000000012","quantity":1}]'::jsonb,
    p_customer_phone => '5599900000012', p_is_guest => true
  );
  perform public.place_order(
    p_order_id => '10000000-0000-4000-8000-000000000113',
    p_items => '[{"product_id":"10000000-0000-4000-8000-000000000012","quantity":1}]'::jsonb,
    p_customer_phone => '5599900000012', p_is_guest => true
  );
  begin
    perform public.place_order(
      p_order_id => '10000000-0000-4000-8000-000000000114',
      p_items => '[{"product_id":"10000000-0000-4000-8000-000000000012","quantity":1}]'::jsonb,
      p_customer_phone => '5599900000012', p_is_guest => true
    );
  exception when others then
    v_err := sqlerrm;
    if position('Muitos pedidos' in v_err) > 0 then v_ok := true; end if;
  end;
  if v_ok then raise notice '✅ 12. anti-spam: 3º pedido seguido do mesmo telefone recusado'; else raise notice '❌ 12. anti-spam deveria recusar o 3º pedido — %', coalesce(v_err, 'passou!'); end if;
end $$;

-- ============ LIMPEZA FINAL ============
delete from public.order_items where order_id::text like '10000000-0000-4000-8000-%';
delete from public.orders      where id::text like '10000000-0000-4000-8000-%';
delete from public.products    where name like 'ZZ-TESTE%';
delete from public.coupons     where code like 'ZZTESTE%';
delete from public.delivery_zones     where name = 'ZZ-TESTE-ZONA';
delete from public.delivery_cep_ranges where label = 'ZZ-TESTE-CEP';
delete from public.professionals where name like 'ZZ-TESTE%';
delete from public.categories where slug = 'zz-teste-cat';

do $$
begin
  raise notice '========== FIM: 12 cenários — confira acima se algum ❌ apareceu ==========';
end $$;
