-- ============================================================
-- SEED — 100 produtos fictícios de depósito de construção + 25 pedidos
-- Rode UMA VEZ no Supabase → SQL Editor (DEPOIS das migrations 1-35).
-- IDEMPOTENTE com guarda: nada é duplicado se rodar de novo.
--
-- v2: corrige o erro "coverage_unit violates not-null constraint" —
-- produtos sem calculadora agora gravam a unidade padrão 'm²' (inofensiva,
-- a calculadora só aparece quando coverage_value > 0).
--
-- v3: corrige o erro "payment_status violates not-null constraint" — a coluna
-- é NOT NULL com check (migration-13); dinheiro/cartão agora gravam 'pending'
-- (pagamento na entrega ainda não recebido) e o pedido cancelado com Pix
-- grava 'cancelled'.
--
-- O que cria:
--  • 8 categorias novas (Cimentos e Argamassas já existem);
--  • 100 produtos com foto, organizados por categoria, TODOS com preço
--    final de R$ 0,01 (avulsos a 0,01; ~34 em PROMOÇÃO com preço maior
--    e promo_price 0,01 — aparecem sozinhos no filtro "Ofertas");
--  • 25 pedidos fictícios variados (status, pagamentos, entrega/retirada,
--    clientes, datas de hoje a 25 dias atrás).
--
-- Para desfazer, descomente o bloco LIMPEZA no fim do arquivo.
-- ============================================================

-- ============ 1) CATEGORIAS ============
insert into public.categories (name, slug)
  select 'Cimentos', 'cimentos'
  where not exists (select 1 from public.categories where slug = 'cimentos');
insert into public.categories (name, slug)
  select 'Argamassas', 'argamassas'
  where not exists (select 1 from public.categories where slug = 'argamassas');
insert into public.categories (name, slug)
  select 'Tijolos e Blocos', 'tijolos-e-blocos'
  where not exists (select 1 from public.categories where slug = 'tijolos-e-blocos');
insert into public.categories (name, slug)
  select 'Areia e Agregados', 'areia-e-agregados'
  where not exists (select 1 from public.categories where slug = 'areia-e-agregados');
insert into public.categories (name, slug)
  select 'Madeiras e Telhas', 'madeiras-e-telhas'
  where not exists (select 1 from public.categories where slug = 'madeiras-e-telhas');
insert into public.categories (name, slug)
  select 'Hidráulica', 'hidraulica'
  where not exists (select 1 from public.categories where slug = 'hidraulica');
insert into public.categories (name, slug)
  select 'Elétrica', 'eletrica'
  where not exists (select 1 from public.categories where slug = 'eletrica');
insert into public.categories (name, slug)
  select 'Tintas e Acabamentos', 'tintas-e-acabamentos'
  where not exists (select 1 from public.categories where slug = 'tintas-e-acabamentos');
insert into public.categories (name, slug)
  select 'Ferramentas', 'ferramentas'
  where not exists (select 1 from public.categories where slug = 'ferramentas');
insert into public.categories (name, slug)
  select 'Louças e Metais', 'loucas-e-metais'
  where not exists (select 1 from public.categories where slug = 'loucas-e-metais');

-- ============ 2) PRODUTOS (100) ============
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cimento CP-II-Z 32 saco 50kg', 'Cimento Portland composto para assentamento e revestimento em geral.', 2.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 240, 30, 0.5, 'm²', true, 225
  where not exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cimento CP-III 40 RS saco 50kg', 'Alta resistência inicial, ideal para pisos e estruturas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 180, 20, 0.5, 'm²', true, 88
  where not exists (select 1 from public.products where name = 'Cimento CP-III 40 RS saco 50kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cimento CP-I saco 25kg', 'Cimento comum para pequenos reparos e acabamentos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 90, 10, 0.25, 'm²', true, 255
  where not exists (select 1 from public.products where name = 'Cimento CP-I saco 25kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cimento branco 20kg', 'Para rejunte, decoração e acabamentos claros.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 45, 8, null, 'm²', true, 22
  where not exists (select 1 from public.products where name = 'Cimento branco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cal hidratada CH-III 20kg', 'Para reboco, assentamento e pintura a cal.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 120, 15, 5, 'm²', true, 118
  where not exists (select 1 from public.products where name = 'Cal hidratada CH-III 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Concreto usinado seco 50kg', 'Mistura pronta: basta adicionar água na obra.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 60, 10, 0.4, 'm²', true, 105
  where not exists (select 1 from public.products where name = 'Concreto usinado seco 50kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Gesso para construção 40kg', 'Para forro, molduras e revestimento interno.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 75, 10, 2, 'm²', true, 355
  where not exists (select 1 from public.products where name = 'Gesso para construção 40kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Aditivo plastificante 1L', 'Aumenta a trabalhabilidade da argamassa.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 40, 5, null, 'm²', true, 23
  where not exists (select 1 from public.products where name = 'Aditivo plastificante 1L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Aditivo impermeabilizante 18L', 'Aditivo hidrofugante para concretos e rebocos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 25, 5, null, 'm²', true, 257
  where not exists (select 1 from public.products where name = 'Aditivo impermeabilizante 18L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'cimentos'), 'Cimento refratário 25kg', 'Resiste a altas temperaturas: churrasqueiras e lareiras.', 3.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 20, 4, null, 'm²', true, 360
  where not exists (select 1 from public.products where name = 'Cimento refratário 25kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Argamassa AC-2 saco 20kg', 'Colante para piso e azulejo em áreas internas.', 1.50, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 200, 25, 2, 'm²', true, 345
  where not exists (select 1 from public.products where name = 'Argamassa AC-2 saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Argamassa AC-3 saco 20kg', 'Colante premium para áreas externas e porcelanato.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 150, 20, 2, 'm²', true, 248
  where not exists (select 1 from public.products where name = 'Argamassa AC-3 saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Argamassa de assentamento 20kg', 'Para blocos e tijolos cerâmicos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 170, 20, 1.5, 'm²', true, 335
  where not exists (select 1 from public.products where name = 'Argamassa de assentamento 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Rejunte cinza 5kg', 'Acabamento de juntas em cerâmicas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 100, 12, 8, 'm²', true, 364
  where not exists (select 1 from public.products where name = 'Rejunte cinza 5kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Rejunte branco premium 5kg', 'Alta resistência a manchas e umidade.', 0.50, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 80, 10, 8, 'm²', true, 329
  where not exists (select 1 from public.products where name = 'Rejunte branco premium 5kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Reboco interno pronto 20kg', 'Massa única para parede interna.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 90, 10, 2.5, 'm²', true, 323
  where not exists (select 1 from public.products where name = 'Reboco interno pronto 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Contrapiso auto nivelante 20kg', 'Base nivelada para pisos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 60, 8, 2, 'm²', true, 212
  where not exists (select 1 from public.products where name = 'Contrapiso auto nivelante 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Argamassa estrutural 20kg', 'Alta resistência para alvenaria estrutural.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 70, 8, null, 'm²', true, 76
  where not exists (select 1 from public.products where name = 'Argamassa estrutural 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Nivelante fluido 20kg', 'Auto nivelante para contrapiso e reparos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 40, 5, 10, 'm²', true, 198
  where not exists (select 1 from public.products where name = 'Nivelante fluido 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'argamassas'), 'Massa única AC-I 20kg', 'Regularização de paredes e tetos.', 0.75, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 55, 6, null, 'm²', true, 300
  where not exists (select 1 from public.products where name = 'Massa única AC-I 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Bloco cerâmico 9x19x39', 'Bloco estrutural para alvenaria.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 400, 50, 0.08, 'm²', true, 218
  where not exists (select 1 from public.products where name = 'Bloco cerâmico 9x19x39');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Bloco cerâmico 11,5x19x39', 'Bloco para vedação e divisórias.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 350, 40, 0.105, 'm²', true, 219
  where not exists (select 1 from public.products where name = 'Bloco cerâmico 11,5x19x39');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Tijolo baiano 8 furos', 'Leve e ótimo isolante térmico.', 0.10, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 500, 60, 0.08, 'm²', true, 29
  where not exists (select 1 from public.products where name = 'Tijolo baiano 8 furos');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Tijolo baiano 6 furos', 'Para muros e fechamentos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 420, 50, 0.065, 'm²', true, 129
  where not exists (select 1 from public.products where name = 'Tijolo baiano 6 furos');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Bloco de concreto 14x19x39', 'Alta resistência para estruturas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 280, 30, null, 'm²', true, 355
  where not exists (select 1 from public.products where name = 'Bloco de concreto 14x19x39');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Bloco de concreto 9x19x39', 'Vedação estrutural de concreto.', 0.15, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 300, 35, null, 'm²', true, 488
  where not exists (select 1 from public.products where name = 'Bloco de concreto 9x19x39');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Tijolo de vidro 20x20', 'Iluminação natural com privacidade.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 48, 6, null, 'm²', true, 413
  where not exists (select 1 from public.products where name = 'Tijolo de vidro 20x20');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Lajota para piso 20x20', 'Piso rústico para calçadas e áreas externas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 250, 30, 0.04, 'm²', true, 447
  where not exists (select 1 from public.products where name = 'Lajota para piso 20x20');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Bloco canal 14x19x39', 'Para vergas e contravergas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 180, 20, null, 'm²', true, 368
  where not exists (select 1 from public.products where name = 'Bloco canal 14x19x39');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tijolos-e-blocos'), 'Meio-fio 15x30', 'Contenção de calçadas e canteiros.', 0.25, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 160, 20, null, 'm²', true, 280
  where not exists (select 1 from public.products where name = 'Meio-fio 15x30');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Areia média saco 20kg', 'Para concreto e argamassa em geral.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 300, 40, 0.25, 'm²', true, 274
  where not exists (select 1 from public.products where name = 'Areia média saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Areia fina saco 20kg', 'Acabamentos e rebocos finos.', 0.10, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 260, 30, 0.25, 'm²', true, 206
  where not exists (select 1 from public.products where name = 'Areia fina saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Areia lavada saco 20kg', 'Limpa, ideal para contrapiso.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 280, 30, null, 'm²', true, 276
  where not exists (select 1 from public.products where name = 'Areia lavada saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Brita 1 saco 20kg', 'Agregado para concreto estrutural.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 320, 40, 0.2, 'm²', true, 300
  where not exists (select 1 from public.products where name = 'Brita 1 saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Brita 2 saco 20kg', 'Base de pisos e drenagem.', 0.10, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 240, 30, null, 'm²', true, 267
  where not exists (select 1 from public.products where name = 'Brita 2 saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Pó de pedra saco 20kg', 'Base para assentamento de pisos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 200, 25, null, 'm²', true, 220
  where not exists (select 1 from public.products where name = 'Pó de pedra saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Pedrisco saco 20kg', 'Para rejunte decorativo e drenos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 90, 10, null, 'm²', true, 116
  where not exists (select 1 from public.products where name = 'Pedrisco saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Saibro saco 20kg', 'Aterro e nivelamento de terrenos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 150, 20, null, 'm²', true, 15
  where not exists (select 1 from public.products where name = 'Saibro saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Seixo rolado 5kg', 'Decoração de jardins e vasos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 60, 6, null, 'm²', true, 152
  where not exists (select 1 from public.products where name = 'Seixo rolado 5kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'areia-e-agregados'), 'Cascalho saco 20kg', 'Calçadas rústicas e canteiros.', 0.08, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 110, 12, null, 'm²', true, 474
  where not exists (select 1 from public.products where name = 'Cascalho saco 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Telha fibrocimento 2,44m', 'Cobertura ondulada de grande rendimento.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 120, 15, 0.55, 'm²', true, 220
  where not exists (select 1 from public.products where name = 'Telha fibrocimento 2,44m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Telha ondulada 1,22m', 'Telha menor para coberturas e reservatórios.', 0.50, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 100, 12, 0.28, 'm²', true, 460
  where not exists (select 1 from public.products where name = 'Telha ondulada 1,22m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Ripa de madeira 2,5x5cm', 'Para telhado e estrutura leve.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 400, 40, null, 'm²', true, 466
  where not exists (select 1 from public.products where name = 'Ripa de madeira 2,5x5cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Sarrafo 2,5x10cm 3m', 'Andaimes, fôrmas e estruturas.', 0.12, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 300, 30, null, 'm²', true, 11
  where not exists (select 1 from public.products where name = 'Sarrafo 2,5x10cm 3m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Caibro 5x6cm 3m', 'Estrutura de telhado.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 200, 20, null, 'm²', true, 41
  where not exists (select 1 from public.products where name = 'Caibro 5x6cm 3m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Compensado 6mm 2,2x1,1m', 'Fôrmas e forros.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 80, 10, null, 'm²', true, 189
  where not exists (select 1 from public.products where name = 'Compensado 6mm 2,2x1,1m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'MDF 15mm 2,75x1,85m', 'Móveis e marcenaria.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 40, 5, null, 'm²', true, 99
  where not exists (select 1 from public.products where name = 'MDF 15mm 2,75x1,85m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Forro PVC 10cm peça 6m', 'Forro lavável para ambientes internos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 150, 15, null, 'm²', true, 395
  where not exists (select 1 from public.products where name = 'Forro PVC 10cm peça 6m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Telha romana cimentícia', 'Acabamento clássico para residências.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 90, 10, 0.11, 'm²', true, 76
  where not exists (select 1 from public.products where name = 'Telha romana cimentícia');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'madeiras-e-telhas'), 'Verga de madeira 3x4cm', 'Esquadrias e pequenas estruturas.', 0.06, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 250, 25, null, 'm²', true, 52
  where not exists (select 1 from public.products where name = 'Verga de madeira 3x4cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Tubo PVC 25mm barra 6m', 'Ramal hidráulico e esgoto.', 0.30, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 180, 20, 6, 'm', true, 357
  where not exists (select 1 from public.products where name = 'Tubo PVC 25mm barra 6m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Tubo PVC 32mm barra 6m', 'Esgoto e águas pluviais.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 150, 15, 6, 'm', true, 484
  where not exists (select 1 from public.products where name = 'Tubo PVC 32mm barra 6m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Tubo PVC 50mm barra 6m', 'Águas pluviais e esgoto maior.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 120, 12, 6, 'm', true, 173
  where not exists (select 1 from public.products where name = 'Tubo PVC 50mm barra 6m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Joelho 90 graus 25mm', 'Curva para tubo de 25mm.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 300, 30, null, 'm²', true, 394
  where not exists (select 1 from public.products where name = 'Joelho 90 graus 25mm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Tee 25mm', 'Derivação em tubulação de 25mm.', 0.02, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 280, 25, null, 'm²', true, 423
  where not exists (select 1 from public.products where name = 'Tee 25mm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Registro gaveta 3/4', 'Registro geral e pontos hidráulicos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 60, 8, null, 'm²', true, 127
  where not exists (select 1 from public.products where name = 'Registro gaveta 3/4');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Caixa d''água 500L', 'Reservatório de polietileno com tampa.', 5.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 15, 3, null, 'm²', true, 24
  where not exists (select 1 from public.products where name = 'Caixa d''água 500L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Vaso sanitário com caixa acoplada', 'Porcelana branca com assento padrão.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 18, 2, null, 'm²', true, 156
  where not exists (select 1 from public.products where name = 'Vaso sanitário com caixa acoplada');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Torneira de pia inox', 'Metal cromado com arejador.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 35, 4, null, 'm²', true, 494
  where not exists (select 1 from public.products where name = 'Torneira de pia inox');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'hidraulica'), 'Flexível de chuveiro 40cm', 'Ligação flexível metálica.', 0.10, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 90, 10, null, 'm²', true, 270
  where not exists (select 1 from public.products where name = 'Flexível de chuveiro 40cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Fio flexível 1,5mm rolo 100m', 'Iluminação e pontos simples.', 1.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 80, 10, 100, 'm', true, 341
  where not exists (select 1 from public.products where name = 'Fio flexível 1,5mm rolo 100m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Fio flexível 2,5mm rolo 100m', 'Tomadas e pontos de força.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 70, 8, 100, 'm', true, 66
  where not exists (select 1 from public.products where name = 'Fio flexível 2,5mm rolo 100m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Cabo 4mm rolo 100m', 'Chuveiros e ar-condicionado.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 50, 6, 100, 'm', true, 235
  where not exists (select 1 from public.products where name = 'Cabo 4mm rolo 100m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Disjuntor 25A', 'Proteção do circuito de tomadas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 100, 12, null, 'm²', true, 469
  where not exists (select 1 from public.products where name = 'Disjuntor 25A');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Tomada 2P+T 10A', 'Tomada com aterramento, padrão NBR.', 0.03, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 200, 20, null, 'm²', true, 335
  where not exists (select 1 from public.products where name = 'Tomada 2P+T 10A');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Interruptor simples', 'Acendimento de ponto de luz.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 180, 18, null, 'm²', true, 303
  where not exists (select 1 from public.products where name = 'Interruptor simples');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Lâmpada LED 9W', 'Luz branca, economia de energia.', 0.05, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 250, 30, null, 'm²', true, 159
  where not exists (select 1 from public.products where name = 'Lâmpada LED 9W');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Luminária de embutir LED 12W', 'Painel de teto sobrepor.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 60, 8, null, 'm²', true, 395
  where not exists (select 1 from public.products where name = 'Luminária de embutir LED 12W');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Eletroduto 3/4 barra 3m', 'Passagem de fiação aparente ou embutida.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 140, 15, 3, 'm', true, 178
  where not exists (select 1 from public.products where name = 'Eletroduto 3/4 barra 3m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'eletrica'), 'Caixa de passagem 4x4', 'Ponto elétrico e derivações.', 0.04, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 220, 25, null, 'm²', true, 41
  where not exists (select 1 from public.products where name = 'Caixa de passagem 4x4');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Tinta acrílica premium 18L', 'Pintura externa lavável de alta cobertura.', 4.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 30, 4, 90, 'm²', true, 250
  where not exists (select 1 from public.products where name = 'Tinta acrílica premium 18L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Tinta acrílica 3,6L', 'Acabamento acetinado lavável.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 55, 6, 18, 'm²', true, 116
  where not exists (select 1 from public.products where name = 'Tinta acrílica 3,6L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Massa corrida 25kg', 'Correção de paredes internas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 45, 5, 20, 'm²', true, 338
  where not exists (select 1 from public.products where name = 'Massa corrida 25kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Selador acrílico 18L', 'Fundo preparador para tinta.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 25, 3, 25, 'm²', true, 409
  where not exists (select 1 from public.products where name = 'Selador acrílico 18L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Primer industrial 3,6L', 'Base para metais e madeiras.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 20, 3, null, 'm²', true, 238
  where not exists (select 1 from public.products where name = 'Primer industrial 3,6L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Textura efeito 18L', 'Acabamento decorativo externo.', 3.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 15, 2, 12, 'm²', true, 57
  where not exists (select 1 from public.products where name = 'Textura efeito 18L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Cal para pintura 20kg', 'Pintura econômica de muros e fachadas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 40, 5, 5, 'm²', true, 272
  where not exists (select 1 from public.products where name = 'Cal para pintura 20kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Esmalte sintético 3,6L', 'Pintura de portas e metais.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 35, 4, 15, 'm²', true, 166
  where not exists (select 1 from public.products where name = 'Esmalte sintético 3,6L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Verniz acetinado 3,6L', 'Proteção de madeiras expostas.', 2.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 25, 3, null, 'm²', true, 39
  where not exists (select 1 from public.products where name = 'Verniz acetinado 3,6L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'tintas-e-acabamentos'), 'Rolo de lã 23cm', 'Rolo para tinta acrílica.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 150, 15, null, 'm²', true, 123
  where not exists (select 1 from public.products where name = 'Rolo de lã 23cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Colher de pedreiro 8 polegadas', 'Assentamento e recolhimento de argamassa.', 0.20, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 90, 10, null, 'm²', true, 21
  where not exists (select 1 from public.products where name = 'Colher de pedreiro 8 polegadas');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Desempenadeira dentada', 'Aplicação de argamassa colante.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 70, 8, null, 'm²', true, 267
  where not exists (select 1 from public.products where name = 'Desempenadeira dentada');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Desempenadeira de espuma 20cm', 'Acabamento fino de reboco.', 0.15, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 60, 6, null, 'm²', true, 60
  where not exists (select 1 from public.products where name = 'Desempenadeira de espuma 20cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Nível de bolha 60cm', 'Alinhamento de obras e móveis.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 80, 8, null, 'm²', true, 121
  where not exists (select 1 from public.products where name = 'Nível de bolha 60cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Trena 5m', 'Medição com travamento e clip.', 0.10, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 120, 12, null, 'm²', true, 497
  where not exists (select 1 from public.products where name = 'Trena 5m');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Marreta 1kg', 'Demolição e ajustes de alvenaria.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 50, 5, null, 'm²', true, 416
  where not exists (select 1 from public.products where name = 'Marreta 1kg');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Enxada com cabo', 'Movimentação de terra e agregados.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 45, 5, null, 'm²', true, 150
  where not exists (select 1 from public.products where name = 'Enxada com cabo');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Pá quadrada com cabo', 'Carga de areia e brita.', 0.25, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 55, 6, null, 'm²', true, 234
  where not exists (select 1 from public.products where name = 'Pá quadrada com cabo');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Balde graduado 18L', 'Medição de água e misturas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 100, 10, null, 'm²', true, 300
  where not exists (select 1 from public.products where name = 'Balde graduado 18L');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'ferramentas'), 'Disco de corte 4 e meia', 'Corte de alvenaria e concreto.', 0.05, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 200, 20, null, 'm²', true, 60
  where not exists (select 1 from public.products where name = 'Disco de corte 4 e meia');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Misturador monocomando', 'Torneira de cozinha articulada.', 2.50, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 20, 2, null, 'm²', true, 89
  where not exists (select 1 from public.products where name = 'Misturador monocomando');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Chuveiro elétrico 5500W', 'Aquecimento instantâneo, 4 temperaturas.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 22, 3, null, 'm²', true, 449
  where not exists (select 1 from public.products where name = 'Chuveiro elétrico 5500W');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Cuba de louça para banheiro', 'Sobrepor ou embutir.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 16, 2, null, 'm²', true, 483
  where not exists (select 1 from public.products where name = 'Cuba de louça para banheiro');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Ralo linear inox 60cm', 'Ralo de chuveiro moderno.', 4.00, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 14, 2, null, 'm²', true, 62
  where not exists (select 1 from public.products where name = 'Ralo linear inox 60cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Duchinha higiênica', 'Higienização com registro de pressão.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 30, 4, null, 'm²', true, 171
  where not exists (select 1 from public.products where name = 'Duchinha higiênica');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Barra de apoio alumínio 40cm', 'Acessibilidade em banheiros.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 18, 2, null, 'm²', true, 433
  where not exists (select 1 from public.products where name = 'Barra de apoio alumínio 40cm');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Papelheiro de louça', 'Acompanha parafusos de fixação.', 0.30, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 25, 3, null, 'm²', true, 466
  where not exists (select 1 from public.products where name = 'Papelheiro de louça');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Suporte de papel duplo', 'Para rolos grandes e pequenos.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020010777-YA5P_xLLju.png', 28, 3, null, 'm²', true, 406
  where not exists (select 1 from public.products where name = 'Suporte de papel duplo');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Saboneteira de louça', 'Para embutir em parede.', 0.01, 0, null, null, 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1791952864975-nhtrOwSlJ4.png', 20, 2, null, 'm²', true, 60
  where not exists (select 1 from public.products where name = 'Saboneteira de louça');
insert into public.products (category_id, name, description, price, discount_percent, promo_price, promo_until, image_url, stock, min_stock, coverage_value, coverage_unit, active, views)
  select (select id from public.categories where slug = 'loucas-e-metais'), 'Espelho com moldura 60x80', 'Espelho moldurado para banheiro.', 3.50, 0, 0.01, '2027-12-31 23:59:59', 'https://hvbknnwzhjnvyrewfkqo.supabase.co/storage/v1/object/public/store/products/1792020046744-mkrUwvEfOr.png', 12, 2, null, 'm²', true, 479
  where not exists (select 1 from public.products where name = 'Espelho com moldura 60x80');

-- ============ 3) PEDIDOS (25) + ITENS ============
-- pedido 1: João Ferreira da Silva (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '04987b6a-5784-4084-b4bd-017f238884de', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'João Ferreira da Silva', '5585947698437', null, 'Rua das Acácias, 120 - Caponga, Cascavel/CE', 1.30, 0, '2026-10-03 09:19:00-03'
  where not exists (select 1 from public.orders where customer_name = 'João Ferreira da Silva' and total = 1.30);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '04987b6a-5784-4084-b4bd-017f238884de', (select id from public.products where name = 'Cimento CP-II-Z 32 saco 50kg'), 'Cimento CP-II-Z 32 saco 50kg', 20, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '04987b6a-5784-4084-b4bd-017f238884de' and oi.product_name = 'Cimento CP-II-Z 32 saco 50kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '04987b6a-5784-4084-b4bd-017f238884de', (select id from public.products where name = 'Areia média saco 20kg'), 'Areia média saco 20kg', 10, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Areia média saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '04987b6a-5784-4084-b4bd-017f238884de' and oi.product_name = 'Areia média saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '04987b6a-5784-4084-b4bd-017f238884de', (select id from public.products where name = 'Bloco cerâmico 9x19x39'), 'Bloco cerâmico 9x19x39', 100, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Bloco cerâmico 9x19x39')
    and not exists (select 1 from public.order_items oi where oi.order_id = '04987b6a-5784-4084-b4bd-017f238884de' and oi.product_name = 'Bloco cerâmico 9x19x39');
-- pedido 2: Maria das Dores Bezerra (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Maria das Dores Bezerra', '5585961199577', '91649766990', 'Av. Central, 455 - Centro, Cascavel/CE', 0.12, 0, '2026-10-05 14:59:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Maria das Dores Bezerra' and total = 0.12);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1', (select id from public.products where name = 'Argamassa AC-2 saco 20kg'), 'Argamassa AC-2 saco 20kg', 8, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Argamassa AC-2 saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1' and oi.product_name = 'Argamassa AC-2 saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1', (select id from public.products where name = 'Rejunte cinza 5kg'), 'Rejunte cinza 5kg', 4, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Rejunte cinza 5kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1' and oi.product_name = 'Rejunte cinza 5kg');
-- pedido 3: Antônio Bezerra Lima (delivered, dinheiro)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '6ecc1694-bf04-43d6-8637-2414cfe62569', 'delivered', 'entrega', 'site', 'dinheiro', 'pending', true, 'Antônio Bezerra Lima', '5585916510094', null, 'Rua São Francisco, 88 - Caponga, Cascavel/CE', 2.10, 0, '2026-10-06 11:19:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Antônio Bezerra Lima' and total = 2.10);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '6ecc1694-bf04-43d6-8637-2414cfe62569', (select id from public.products where name = 'Tijolo baiano 8 furos'), 'Tijolo baiano 8 furos', 200, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Tijolo baiano 8 furos')
    and not exists (select 1 from public.order_items oi where oi.order_id = '6ecc1694-bf04-43d6-8637-2414cfe62569' and oi.product_name = 'Tijolo baiano 8 furos');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '6ecc1694-bf04-43d6-8637-2414cfe62569', (select id from public.products where name = 'Cimento CP-III 40 RS saco 50kg'), 'Cimento CP-III 40 RS saco 50kg', 10, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-III 40 RS saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '6ecc1694-bf04-43d6-8637-2414cfe62569' and oi.product_name = 'Cimento CP-III 40 RS saco 50kg');
-- pedido 4: Francisca Lima Nunes (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '0fef486e-2128-44d3-8c77-2b7c497d9464', 'delivered', 'retirada', 'site', 'pix', 'approved', true, 'Francisca Lima Nunes', '5585905385025', '21744199860', null, 0.05, 0, '2026-10-07 16:57:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Francisca Lima Nunes' and total = 0.05);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '0fef486e-2128-44d3-8c77-2b7c497d9464', (select id from public.products where name = 'Tinta acrílica premium 18L'), 'Tinta acrílica premium 18L', 2, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Tinta acrílica premium 18L')
    and not exists (select 1 from public.order_items oi where oi.order_id = '0fef486e-2128-44d3-8c77-2b7c497d9464' and oi.product_name = 'Tinta acrílica premium 18L');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '0fef486e-2128-44d3-8c77-2b7c497d9464', (select id from public.products where name = 'Rolo de lã 23cm'), 'Rolo de lã 23cm', 3, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Rolo de lã 23cm')
    and not exists (select 1 from public.order_items oi where oi.order_id = '0fef486e-2128-44d3-8c77-2b7c497d9464' and oi.product_name = 'Rolo de lã 23cm');
-- pedido 5: José Carlos Almeida (delivered, cartao)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '77fe0a61-7b65-4103-b80d-2955fd9c28e1', 'delivered', 'entrega', 'site', 'cartao', 'pending', true, 'José Carlos Almeida', '5585933688783', '82064160769', 'Rua do Sítio, 22 - Coqueiro, Cascavel/CE', 0.18, 0, '2026-10-09 10:52:00-03'
  where not exists (select 1 from public.orders where customer_name = 'José Carlos Almeida' and total = 0.18);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '77fe0a61-7b65-4103-b80d-2955fd9c28e1', (select id from public.products where name = 'Brita 1 saco 20kg'), 'Brita 1 saco 20kg', 12, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Brita 1 saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '77fe0a61-7b65-4103-b80d-2955fd9c28e1' and oi.product_name = 'Brita 1 saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '77fe0a61-7b65-4103-b80d-2955fd9c28e1', (select id from public.products where name = 'Cimento CP-II-Z 32 saco 50kg'), 'Cimento CP-II-Z 32 saco 50kg', 6, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '77fe0a61-7b65-4103-b80d-2955fd9c28e1' and oi.product_name = 'Cimento CP-II-Z 32 saco 50kg');
-- pedido 6: Ana Beatriz Rocha (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Ana Beatriz Rocha', '5585952485166', null, 'Rua das Flores, 310 - Centro, Cascavel/CE', 0.14, 0, '2026-10-10 15:48:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Ana Beatriz Rocha' and total = 0.14);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b', (select id from public.products where name = 'Tubo PVC 25mm barra 6m'), 'Tubo PVC 25mm barra 6m', 4, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Tubo PVC 25mm barra 6m')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b' and oi.product_name = 'Tubo PVC 25mm barra 6m');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b', (select id from public.products where name = 'Joelho 90 graus 25mm'), 'Joelho 90 graus 25mm', 10, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Joelho 90 graus 25mm')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b' and oi.product_name = 'Joelho 90 graus 25mm');
-- pedido 7: Pedro Henrique Nunes (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'be866e4d-5632-4893-a2a8-cc193ebd0352', 'delivered', 'retirada', 'site', 'pix', 'approved', true, 'Pedro Henrique Nunes', '5585902450822', null, null, 0.04, 0, '2026-10-11 08:49:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Pedro Henrique Nunes' and total = 0.04);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'be866e4d-5632-4893-a2a8-cc193ebd0352', (select id from public.products where name = 'Colher de pedreiro 8 polegadas'), 'Colher de pedreiro 8 polegadas', 2, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Colher de pedreiro 8 polegadas')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'be866e4d-5632-4893-a2a8-cc193ebd0352' and oi.product_name = 'Colher de pedreiro 8 polegadas');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'be866e4d-5632-4893-a2a8-cc193ebd0352', (select id from public.products where name = 'Desempenadeira dentada'), 'Desempenadeira dentada', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Desempenadeira dentada')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'be866e4d-5632-4893-a2a8-cc193ebd0352' and oi.product_name = 'Desempenadeira dentada');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'be866e4d-5632-4893-a2a8-cc193ebd0352', (select id from public.products where name = 'Nível de bolha 60cm'), 'Nível de bolha 60cm', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Nível de bolha 60cm')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'be866e4d-5632-4893-a2a8-cc193ebd0352' and oi.product_name = 'Nível de bolha 60cm');
-- pedido 8: Raimunda Sousa (delivered, dinheiro)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '1179b00d-babf-42aa-a9c0-f5752382452c', 'delivered', 'entrega', 'site', 'dinheiro', 'pending', true, 'Raimunda Sousa', '5585920851972', '34271240769', 'Vila Nova, 77 - Caponga, Cascavel/CE', 0.05, 0, '2026-10-13 13:05:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Raimunda Sousa' and total = 0.05);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '1179b00d-babf-42aa-a9c0-f5752382452c', (select id from public.products where name = 'Tinta acrílica 3,6L'), 'Tinta acrílica 3,6L', 3, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Tinta acrílica 3,6L')
    and not exists (select 1 from public.order_items oi where oi.order_id = '1179b00d-babf-42aa-a9c0-f5752382452c' and oi.product_name = 'Tinta acrílica 3,6L');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '1179b00d-babf-42aa-a9c0-f5752382452c', (select id from public.products where name = 'Massa corrida 25kg'), 'Massa corrida 25kg', 2, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Massa corrida 25kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '1179b00d-babf-42aa-a9c0-f5752382452c' and oi.product_name = 'Massa corrida 25kg');
-- pedido 9: Carlos Eduardo Melo (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '5d607470-3dd2-49f4-a980-a5f710fa6783', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Carlos Eduardo Melo', '5585979754756', '68637996376', 'Rua Santa Luzia, 555 - Centro, Cascavel/CE', 0.55, 0, '2026-10-15 17:41:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Carlos Eduardo Melo' and total = 0.55);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '5d607470-3dd2-49f4-a980-a5f710fa6783', (select id from public.products where name = 'Cimento CP-II-Z 32 saco 50kg'), 'Cimento CP-II-Z 32 saco 50kg', 30, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '5d607470-3dd2-49f4-a980-a5f710fa6783' and oi.product_name = 'Cimento CP-II-Z 32 saco 50kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '5d607470-3dd2-49f4-a980-a5f710fa6783', (select id from public.products where name = 'Areia lavada saco 20kg'), 'Areia lavada saco 20kg', 15, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Areia lavada saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '5d607470-3dd2-49f4-a980-a5f710fa6783' and oi.product_name = 'Areia lavada saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '5d607470-3dd2-49f4-a980-a5f710fa6783', (select id from public.products where name = 'Brita 1 saco 20kg'), 'Brita 1 saco 20kg', 10, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Brita 1 saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '5d607470-3dd2-49f4-a980-a5f710fa6783' and oi.product_name = 'Brita 1 saco 20kg');
-- pedido 10: Luciana Freitas (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'ab0cc52a-e417-49e9-b7af-53c3e148ab43', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Luciana Freitas', '5585905835679', '55705944630', 'Av. Dom Manuel, 210 - Caponga, Cascavel/CE', 0.42, 0, '2026-10-16 09:59:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Luciana Freitas' and total = 0.42);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'ab0cc52a-e417-49e9-b7af-53c3e148ab43', (select id from public.products where name = 'Telha fibrocimento 2,44m'), 'Telha fibrocimento 2,44m', 12, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Telha fibrocimento 2,44m')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'ab0cc52a-e417-49e9-b7af-53c3e148ab43' and oi.product_name = 'Telha fibrocimento 2,44m');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'ab0cc52a-e417-49e9-b7af-53c3e148ab43', (select id from public.products where name = 'Ripa de madeira 2,5x5cm'), 'Ripa de madeira 2,5x5cm', 30, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Ripa de madeira 2,5x5cm')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'ab0cc52a-e417-49e9-b7af-53c3e148ab43' and oi.product_name = 'Ripa de madeira 2,5x5cm');
-- pedido 11: Marcos Vinícius Peixoto (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'd92cf43b-5d4a-4649-85d3-018365d61526', 'delivered', 'retirada', 'site', 'pix', 'approved', true, 'Marcos Vinícius Peixoto', '5585901611223', '23395915781', null, 0.16, 0, '2026-10-17 14:58:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Marcos Vinícius Peixoto' and total = 0.16);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd92cf43b-5d4a-4649-85d3-018365d61526', (select id from public.products where name = 'Fio flexível 2,5mm rolo 100m'), 'Fio flexível 2,5mm rolo 100m', 2, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Fio flexível 2,5mm rolo 100m')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd92cf43b-5d4a-4649-85d3-018365d61526' and oi.product_name = 'Fio flexível 2,5mm rolo 100m');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd92cf43b-5d4a-4649-85d3-018365d61526', (select id from public.products where name = 'Disjuntor 25A'), 'Disjuntor 25A', 4, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Disjuntor 25A')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd92cf43b-5d4a-4649-85d3-018365d61526' and oi.product_name = 'Disjuntor 25A');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd92cf43b-5d4a-4649-85d3-018365d61526', (select id from public.products where name = 'Tomada 2P+T 10A'), 'Tomada 2P+T 10A', 10, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Tomada 2P+T 10A')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd92cf43b-5d4a-4649-85d3-018365d61526' and oi.product_name = 'Tomada 2P+T 10A');
-- pedido 12: Fernanda Cavalcante (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'dc117f3c-3b86-4648-b637-591e1f646f6a', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Fernanda Cavalcante', '5585904597340', '19727197415', 'Rua do Amor, 33 - Coqueiro, Cascavel/CE', 1.60, 0, '2026-10-18 10:03:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Fernanda Cavalcante' and total = 1.60);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'dc117f3c-3b86-4648-b637-591e1f646f6a', (select id from public.products where name = 'Argamassa de assentamento 20kg'), 'Argamassa de assentamento 20kg', 10, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Argamassa de assentamento 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'dc117f3c-3b86-4648-b637-591e1f646f6a' and oi.product_name = 'Argamassa de assentamento 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'dc117f3c-3b86-4648-b637-591e1f646f6a', (select id from public.products where name = 'Tijolo baiano 6 furos'), 'Tijolo baiano 6 furos', 150, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Tijolo baiano 6 furos')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'dc117f3c-3b86-4648-b637-591e1f646f6a' and oi.product_name = 'Tijolo baiano 6 furos');
-- pedido 13: Paulo Roberto Gomes (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd', 'delivered', 'retirada', 'site', 'pix', 'approved', true, 'Paulo Roberto Gomes', '5585980650509', '61868437775', null, 0.02, 0, '2026-10-19 16:35:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Paulo Roberto Gomes' and total = 0.02);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd', (select id from public.products where name = 'Caixa d''água 500L'), 'Caixa d''água 500L', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Caixa d''água 500L')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd' and oi.product_name = 'Caixa d''água 500L');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd', (select id from public.products where name = 'Vaso sanitário com caixa acoplada'), 'Vaso sanitário com caixa acoplada', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Vaso sanitário com caixa acoplada')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd' and oi.product_name = 'Vaso sanitário com caixa acoplada');
-- pedido 14: Sandra Regina Torres (shipping, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'bb4f24a7-dac5-4ed1-a320-efcee78a5311', 'shipping', 'entrega', 'site', 'pix', 'pending', true, 'Sandra Regina Torres', '5585975609587', null, 'Rua Grande, 900 - Centro, Cascavel/CE', 0.33, 0, '2026-10-20 12:21:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Sandra Regina Torres' and total = 0.33);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'bb4f24a7-dac5-4ed1-a320-efcee78a5311', (select id from public.products where name = 'Cimento CP-II-Z 32 saco 50kg'), 'Cimento CP-II-Z 32 saco 50kg', 25, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'bb4f24a7-dac5-4ed1-a320-efcee78a5311' and oi.product_name = 'Cimento CP-II-Z 32 saco 50kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'bb4f24a7-dac5-4ed1-a320-efcee78a5311', (select id from public.products where name = 'Brita 2 saco 20kg'), 'Brita 2 saco 20kg', 8, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Brita 2 saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'bb4f24a7-dac5-4ed1-a320-efcee78a5311' and oi.product_name = 'Brita 2 saco 20kg');
-- pedido 15: Márcio José Andrade (shipping, dinheiro)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '27f566aa-3aba-4e6e-b3f3-5da95c745938', 'shipping', 'entrega', 'site', 'dinheiro', 'pending', true, 'Márcio José Andrade', '5585993379175', null, 'Rua Bela Vista, 40 - Caponga, Cascavel/CE', 1.32, 0, '2026-10-20 15:26:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Márcio José Andrade' and total = 1.32);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '27f566aa-3aba-4e6e-b3f3-5da95c745938', (select id from public.products where name = 'Bloco de concreto 14x19x39'), 'Bloco de concreto 14x19x39', 120, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Bloco de concreto 14x19x39')
    and not exists (select 1 from public.order_items oi where oi.order_id = '27f566aa-3aba-4e6e-b3f3-5da95c745938' and oi.product_name = 'Bloco de concreto 14x19x39');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '27f566aa-3aba-4e6e-b3f3-5da95c745938', (select id from public.products where name = 'Areia média saco 20kg'), 'Areia média saco 20kg', 12, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Areia média saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '27f566aa-3aba-4e6e-b3f3-5da95c745938' and oi.product_name = 'Areia média saco 20kg');
-- pedido 16: Telma Barbosa (shipping, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '4cd8b18d-c453-4f0f-aef1-82fc73795bdd', 'shipping', 'retirada', 'site', 'pix', 'pending', true, 'Telma Barbosa', '5585921867397', '19872390711', null, 0.02, 0, '2026-10-21 08:21:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Telma Barbosa' and total = 0.02);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '4cd8b18d-c453-4f0f-aef1-82fc73795bdd', (select id from public.products where name = 'Tinta acrílica premium 18L'), 'Tinta acrílica premium 18L', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Tinta acrílica premium 18L')
    and not exists (select 1 from public.order_items oi where oi.order_id = '4cd8b18d-c453-4f0f-aef1-82fc73795bdd' and oi.product_name = 'Tinta acrílica premium 18L');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '4cd8b18d-c453-4f0f-aef1-82fc73795bdd', (select id from public.products where name = 'Selador acrílico 18L'), 'Selador acrílico 18L', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Selador acrílico 18L')
    and not exists (select 1 from public.order_items oi where oi.order_id = '4cd8b18d-c453-4f0f-aef1-82fc73795bdd' and oi.product_name = 'Selador acrílico 18L');
-- pedido 17: Roberto de Souza Holanda (preparing, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '162d512e-5313-48cc-ac69-b1e7e6812250', 'preparing', 'entrega', 'site', 'pix', 'pending', true, 'Roberto de Souza Holanda', '5585958072178', '14677410256', 'Rua Nova, 250 - Coqueiro, Cascavel/CE', 0.07, 0, '2026-10-21 09:38:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Roberto de Souza Holanda' and total = 0.07);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '162d512e-5313-48cc-ac69-b1e7e6812250', (select id from public.products where name = 'Gesso para construção 40kg'), 'Gesso para construção 40kg', 6, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Gesso para construção 40kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = '162d512e-5313-48cc-ac69-b1e7e6812250' and oi.product_name = 'Gesso para construção 40kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '162d512e-5313-48cc-ac69-b1e7e6812250', (select id from public.products where name = 'Fio flexível 1,5mm rolo 100m'), 'Fio flexível 1,5mm rolo 100m', 1, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Fio flexível 1,5mm rolo 100m')
    and not exists (select 1 from public.order_items oi where oi.order_id = '162d512e-5313-48cc-ac69-b1e7e6812250' and oi.product_name = 'Fio flexível 1,5mm rolo 100m');
-- pedido 18: Juliana Maria Cardoso (preparing, cartao)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', 'preparing', 'retirada', 'site', 'cartao', 'pending', true, 'Juliana Maria Cardoso', '5585909678580', null, null, 0.04, 0, '2026-10-21 10:07:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Juliana Maria Cardoso' and total = 0.04);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', (select id from public.products where name = 'Misturador monocomando'), 'Misturador monocomando', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Misturador monocomando')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4' and oi.product_name = 'Misturador monocomando');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', (select id from public.products where name = 'Duchinha higiênica'), 'Duchinha higiênica', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Duchinha higiênica')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4' and oi.product_name = 'Duchinha higiênica');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', (select id from public.products where name = 'Flexível de chuveiro 40cm'), 'Flexível de chuveiro 40cm', 2, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Flexível de chuveiro 40cm')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4' and oi.product_name = 'Flexível de chuveiro 40cm');
-- pedido 19: Eduardo Lopes (confirmed, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'b2e03b49-993f-4931-b719-673321200323', 'confirmed', 'entrega', 'site', 'pix', 'pending', true, 'Eduardo Lopes', '5585916942385', '42854611680', 'Av. Beira Mar, 1000 - Centro, Cascavel/CE', 0.34, 0, '2026-10-21 11:09:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Eduardo Lopes' and total = 0.34);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b2e03b49-993f-4931-b719-673321200323', (select id from public.products where name = 'Lâmpada LED 9W'), 'Lâmpada LED 9W', 20, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Lâmpada LED 9W')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b2e03b49-993f-4931-b719-673321200323' and oi.product_name = 'Lâmpada LED 9W');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b2e03b49-993f-4931-b719-673321200323', (select id from public.products where name = 'Interruptor simples'), 'Interruptor simples', 6, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Interruptor simples')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b2e03b49-993f-4931-b719-673321200323' and oi.product_name = 'Interruptor simples');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b2e03b49-993f-4931-b719-673321200323', (select id from public.products where name = 'Caixa de passagem 4x4'), 'Caixa de passagem 4x4', 8, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Caixa de passagem 4x4')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b2e03b49-993f-4931-b719-673321200323' and oi.product_name = 'Caixa de passagem 4x4');
-- pedido 20: Patrícia Nogueira (pending, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', 'pending', 'retirada', 'site', 'pix', 'pending', true, 'Patrícia Nogueira', '5585950316834', '74724667558', null, 0.03, 0, '2026-10-21 12:59:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Patrícia Nogueira' and total = 0.03);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', (select id from public.products where name = 'Chuveiro elétrico 5500W'), 'Chuveiro elétrico 5500W', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Chuveiro elétrico 5500W')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b6751fa6-c492-4a7b-8e64-9138a23ec37e' and oi.product_name = 'Chuveiro elétrico 5500W');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', (select id from public.products where name = 'Cabo 4mm rolo 100m'), 'Cabo 4mm rolo 100m', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Cabo 4mm rolo 100m')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b6751fa6-c492-4a7b-8e64-9138a23ec37e' and oi.product_name = 'Cabo 4mm rolo 100m');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', (select id from public.products where name = 'Disjuntor 25A'), 'Disjuntor 25A', 1, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Disjuntor 25A')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'b6751fa6-c492-4a7b-8e64-9138a23ec37e' and oi.product_name = 'Disjuntor 25A');
-- pedido 21: Geraldo Pereira Neto (pending, dinheiro)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'd15e2297-cb45-44aa-a636-9e98d77ba771', 'pending', 'entrega', 'site', 'dinheiro', 'pending', true, 'Geraldo Pereira Neto', '5585946910569', '99992188338', 'Rua dos Tapuias, 65 - Caponga, Cascavel/CE', 0.48, 0, '2026-10-21 13:45:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Geraldo Pereira Neto' and total = 0.48);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd15e2297-cb45-44aa-a636-9e98d77ba771', (select id from public.products where name = 'Meio-fio 15x30'), 'Meio-fio 15x30', 40, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Meio-fio 15x30')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd15e2297-cb45-44aa-a636-9e98d77ba771' and oi.product_name = 'Meio-fio 15x30');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd15e2297-cb45-44aa-a636-9e98d77ba771', (select id from public.products where name = 'Pó de pedra saco 20kg'), 'Pó de pedra saco 20kg', 8, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Pó de pedra saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd15e2297-cb45-44aa-a636-9e98d77ba771' and oi.product_name = 'Pó de pedra saco 20kg');
-- pedido 22: Vanessa Araújo (cancelled, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '9f40522a-5cab-4810-af2f-846d33979977', 'cancelled', 'entrega', 'site', 'pix', 'cancelled', true, 'Vanessa Araújo', '5585909406301', '50308158306', 'Rua das Palmeiras, 77 - Centro, Cascavel/CE', 0.02, 0, '2026-10-15 18:25:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Vanessa Araújo' and total = 0.02);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '9f40522a-5cab-4810-af2f-846d33979977', (select id from public.products where name = 'Vaso sanitário com caixa acoplada'), 'Vaso sanitário com caixa acoplada', 1, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Vaso sanitário com caixa acoplada')
    and not exists (select 1 from public.order_items oi where oi.order_id = '9f40522a-5cab-4810-af2f-846d33979977' and oi.product_name = 'Vaso sanitário com caixa acoplada');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '9f40522a-5cab-4810-af2f-846d33979977', (select id from public.products where name = 'Ralo linear inox 60cm'), 'Ralo linear inox 60cm', 1, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Ralo linear inox 60cm')
    and not exists (select 1 from public.order_items oi where oi.order_id = '9f40522a-5cab-4810-af2f-846d33979977' and oi.product_name = 'Ralo linear inox 60cm');
-- pedido 23: Igor Monteiro (cancelled, dinheiro)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '4edbdc32-cadc-4684-83cd-bd3b23c7635a', 'cancelled', 'retirada', 'site', 'dinheiro', 'pending', true, 'Igor Monteiro', '5585973079893', '75328360639', null, 0.07, 0, '2026-10-17 19:07:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Igor Monteiro' and total = 0.07);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '4edbdc32-cadc-4684-83cd-bd3b23c7635a', (select id from public.products where name = 'MDF 15mm 2,75x1,85m'), 'MDF 15mm 2,75x1,85m', 3, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'MDF 15mm 2,75x1,85m')
    and not exists (select 1 from public.order_items oi where oi.order_id = '4edbdc32-cadc-4684-83cd-bd3b23c7635a' and oi.product_name = 'MDF 15mm 2,75x1,85m');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '4edbdc32-cadc-4684-83cd-bd3b23c7635a', (select id from public.products where name = 'Compensado 6mm 2,2x1,1m'), 'Compensado 6mm 2,2x1,1m', 4, 0.01, 'retirada'
  where exists (select 1 from public.products where name = 'Compensado 6mm 2,2x1,1m')
    and not exists (select 1 from public.order_items oi where oi.order_id = '4edbdc32-cadc-4684-83cd-bd3b23c7635a' and oi.product_name = 'Compensado 6mm 2,2x1,1m');
-- pedido 24: Débora Prado (cancelled, cartao)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select '547ea6b9-8746-4d11-b6e7-28f30ee8fcda', 'cancelled', 'entrega', 'site', 'cartao', 'pending', true, 'Débora Prado', '5585953023267', null, 'Rua Serrote, 15 - Coqueiro, Cascavel/CE', 0.50, 0, '2026-10-01 17:39:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Débora Prado' and total = 0.50);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select '547ea6b9-8746-4d11-b6e7-28f30ee8fcda', (select id from public.products where name = 'Telha romana cimentícia'), 'Telha romana cimentícia', 50, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Telha romana cimentícia')
    and not exists (select 1 from public.order_items oi where oi.order_id = '547ea6b9-8746-4d11-b6e7-28f30ee8fcda' and oi.product_name = 'Telha romana cimentícia');
-- pedido 25: Sebastião Ribeiro (delivered, pix)
insert into public.orders (id, status, delivery_method, origin, payment_method, payment_status, is_guest, customer_name, customer_phone, customer_cpf, delivery_address, total, discount, created_at)
  select 'd80e33e8-bb95-48ad-88f5-9b705c90fff5', 'delivered', 'entrega', 'site', 'pix', 'approved', true, 'Sebastião Ribeiro', '5585944358024', null, 'Sítio Malhada, s/n - Zona Rural, Cascavel/CE', 3.90, 0, '2026-09-26 09:47:00-03'
  where not exists (select 1 from public.orders where customer_name = 'Sebastião Ribeiro' and total = 3.90);
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd80e33e8-bb95-48ad-88f5-9b705c90fff5', (select id from public.products where name = 'Cimento CP-II-Z 32 saco 50kg'), 'Cimento CP-II-Z 32 saco 50kg', 50, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Cimento CP-II-Z 32 saco 50kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd80e33e8-bb95-48ad-88f5-9b705c90fff5' and oi.product_name = 'Cimento CP-II-Z 32 saco 50kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd80e33e8-bb95-48ad-88f5-9b705c90fff5', (select id from public.products where name = 'Areia média saco 20kg'), 'Areia média saco 20kg', 25, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Areia média saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd80e33e8-bb95-48ad-88f5-9b705c90fff5' and oi.product_name = 'Areia média saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd80e33e8-bb95-48ad-88f5-9b705c90fff5', (select id from public.products where name = 'Brita 1 saco 20kg'), 'Brita 1 saco 20kg', 15, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Brita 1 saco 20kg')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd80e33e8-bb95-48ad-88f5-9b705c90fff5' and oi.product_name = 'Brita 1 saco 20kg');
insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, fulfillment)
  select 'd80e33e8-bb95-48ad-88f5-9b705c90fff5', (select id from public.products where name = 'Tijolo baiano 8 furos'), 'Tijolo baiano 8 furos', 300, 0.01, 'entrega'
  where exists (select 1 from public.products where name = 'Tijolo baiano 8 furos')
    and not exists (select 1 from public.order_items oi where oi.order_id = 'd80e33e8-bb95-48ad-88f5-9b705c90fff5' and oi.product_name = 'Tijolo baiano 8 furos');

-- ============ LIMPEZA (descomente para desfazer tudo) ============
-- delete from public.order_items where order_id in ('04987b6a-5784-4084-b4bd-017f238884de', '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1', '6ecc1694-bf04-43d6-8637-2414cfe62569', '0fef486e-2128-44d3-8c77-2b7c497d9464', '77fe0a61-7b65-4103-b80d-2955fd9c28e1', 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b', 'be866e4d-5632-4893-a2a8-cc193ebd0352', '1179b00d-babf-42aa-a9c0-f5752382452c', '5d607470-3dd2-49f4-a980-a5f710fa6783', 'ab0cc52a-e417-49e9-b7af-53c3e148ab43', 'd92cf43b-5d4a-4649-85d3-018365d61526', 'dc117f3c-3b86-4648-b637-591e1f646f6a', 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd', 'bb4f24a7-dac5-4ed1-a320-efcee78a5311', '27f566aa-3aba-4e6e-b3f3-5da95c745938', '4cd8b18d-c453-4f0f-aef1-82fc73795bdd', '162d512e-5313-48cc-ac69-b1e7e6812250', 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', 'b2e03b49-993f-4931-b719-673321200323', 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', 'd15e2297-cb45-44aa-a636-9e98d77ba771', '9f40522a-5cab-4810-af2f-846d33979977', '4edbdc32-cadc-4684-83cd-bd3b23c7635a', '547ea6b9-8746-4d11-b6e7-28f30ee8fcda', 'd80e33e8-bb95-48ad-88f5-9b705c90fff5');
-- delete from public.orders where id in ('04987b6a-5784-4084-b4bd-017f238884de', '5d03c2ef-d6c8-4ac3-8e3f-9e4b56c246a1', '6ecc1694-bf04-43d6-8637-2414cfe62569', '0fef486e-2128-44d3-8c77-2b7c497d9464', '77fe0a61-7b65-4103-b80d-2955fd9c28e1', 'cb0ca2ed-6fd0-473b-a8ef-a90527a68c0b', 'be866e4d-5632-4893-a2a8-cc193ebd0352', '1179b00d-babf-42aa-a9c0-f5752382452c', '5d607470-3dd2-49f4-a980-a5f710fa6783', 'ab0cc52a-e417-49e9-b7af-53c3e148ab43', 'd92cf43b-5d4a-4649-85d3-018365d61526', 'dc117f3c-3b86-4648-b637-591e1f646f6a', 'b9a1aba8-f2d3-4d71-824b-29f815a0cadd', 'bb4f24a7-dac5-4ed1-a320-efcee78a5311', '27f566aa-3aba-4e6e-b3f3-5da95c745938', '4cd8b18d-c453-4f0f-aef1-82fc73795bdd', '162d512e-5313-48cc-ac69-b1e7e6812250', 'c42d7ab1-55a3-4392-8fbc-8e7e7da38dd4', 'b2e03b49-993f-4931-b719-673321200323', 'b6751fa6-c492-4a7b-8e64-9138a23ec37e', 'd15e2297-cb45-44aa-a636-9e98d77ba771', '9f40522a-5cab-4810-af2f-846d33979977', '4edbdc32-cadc-4684-83cd-bd3b23c7635a', '547ea6b9-8746-4d11-b6e7-28f30ee8fcda', 'd80e33e8-bb95-48ad-88f5-9b705c90fff5');
-- delete from public.products where name in ('Cimento CP-II-Z 32 saco 50kg', 'Cimento CP-III 40 RS saco 50kg', 'Cimento CP-I saco 25kg', 'Cimento branco 20kg', 'Cal hidratada CH-III 20kg', 'Concreto usinado seco 50kg', 'Gesso para construção 40kg', 'Aditivo plastificante 1L', 'Aditivo impermeabilizante 18L', 'Cimento refratário 25kg', 'Argamassa AC-2 saco 20kg', 'Argamassa AC-3 saco 20kg', 'Argamassa de assentamento 20kg', 'Rejunte cinza 5kg', 'Rejunte branco premium 5kg', 'Reboco interno pronto 20kg', 'Contrapiso auto nivelante 20kg', 'Argamassa estrutural 20kg', 'Nivelante fluido 20kg', 'Massa única AC-I 20kg', 'Bloco cerâmico 9x19x39', 'Bloco cerâmico 11,5x19x39', 'Tijolo baiano 8 furos', 'Tijolo baiano 6 furos', 'Bloco de concreto 14x19x39', 'Bloco de concreto 9x19x39', 'Tijolo de vidro 20x20', 'Lajota para piso 20x20', 'Bloco canal 14x19x39', 'Meio-fio 15x30', 'Areia média saco 20kg', 'Areia fina saco 20kg', 'Areia lavada saco 20kg', 'Brita 1 saco 20kg', 'Brita 2 saco 20kg', 'Pó de pedra saco 20kg', 'Pedrisco saco 20kg', 'Saibro saco 20kg', 'Seixo rolado 5kg', 'Cascalho saco 20kg', 'Telha fibrocimento 2,44m', 'Telha ondulada 1,22m', 'Ripa de madeira 2,5x5cm', 'Sarrafo 2,5x10cm 3m', 'Caibro 5x6cm 3m', 'Compensado 6mm 2,2x1,1m', 'MDF 15mm 2,75x1,85m', 'Forro PVC 10cm peça 6m', 'Telha romana cimentícia', 'Verga de madeira 3x4cm', 'Tubo PVC 25mm barra 6m', 'Tubo PVC 32mm barra 6m', 'Tubo PVC 50mm barra 6m', 'Joelho 90 graus 25mm', 'Tee 25mm', 'Registro gaveta 3/4', 'Caixa d''água 500L', 'Vaso sanitário com caixa acoplada', 'Torneira de pia inox', 'Flexível de chuveiro 40cm', 'Fio flexível 1,5mm rolo 100m', 'Fio flexível 2,5mm rolo 100m', 'Cabo 4mm rolo 100m', 'Disjuntor 25A', 'Tomada 2P+T 10A', 'Interruptor simples', 'Lâmpada LED 9W', 'Luminária de embutir LED 12W', 'Eletroduto 3/4 barra 3m', 'Caixa de passagem 4x4', 'Tinta acrílica premium 18L', 'Tinta acrílica 3,6L', 'Massa corrida 25kg', 'Selador acrílico 18L', 'Primer industrial 3,6L', 'Textura efeito 18L', 'Cal para pintura 20kg', 'Esmalte sintético 3,6L', 'Verniz acetinado 3,6L', 'Rolo de lã 23cm', 'Colher de pedreiro 8 polegadas', 'Desempenadeira dentada', 'Desempenadeira de espuma 20cm', 'Nível de bolha 60cm', 'Trena 5m', 'Marreta 1kg', 'Enxada com cabo', 'Pá quadrada com cabo', 'Balde graduado 18L', 'Disco de corte 4 e meia', 'Misturador monocomando', 'Chuveiro elétrico 5500W', 'Cuba de louça para banheiro', 'Ralo linear inox 60cm', 'Duchinha higiênica', 'Barra de apoio alumínio 40cm', 'Papelheiro de louça', 'Suporte de papel duplo', 'Saboneteira de louça', 'Espelho com moldura 60x80');
-- delete from public.categories c where c.slug in ('tijolos-e-blocos', 'areia-e-agregados', 'madeiras-e-telhas', 'hidraulica', 'eletrica', 'tintas-e-acabamentos', 'ferramentas', 'loucas-e-metais') and not exists (select 1 from public.products p where p.category_id = c.id);
