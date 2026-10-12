-- ============================================================
-- MIGRATION 11 — PROMOÇÕES + MÚLTIPLAS CATEGORIAS POR PRODUTO
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-10.
--
-- O que muda:
--   1) products ganha promo_price (preço FINAL da promoção) e promo_until
--      (quando a promoção expira);
--   2) nova tabela product_categories: um produto pode pertencer a VÁRIAS
--      categorias. A coluna products.category_id CONTINUA existindo e sendo
--      gravada como a categoria PRINCIPAL (compatibilidade com o restante
--      do sistema que ainda lê essa coluna);
--   3) a categoria "Ofertas" (slug 'ofertas') é criada se ainda não existir;
--   4) backfill: todo produto com category_id vira um vínculo em
--      product_categories.
--
-- IMPORTANTE — SEM CRON / pg_cron:
--   Nada aqui agenda job nenhum. Quando promo_until fica no PASSADO a
--   promoção simplesmente deixa de valer: o código da loja
--   (src/lib/utils.js → hasActivePromo / effectivePrice) ignora a promoção
--   vencida e a vitrine volta a mostrar o preço original sozinha, sem
--   nenhuma rotina rodando no banco.
-- ============================================================

-- ============================================================
-- 1) Colunas de promoção em products
--    promo_price = preço FINAL já resolvido (a tela do admin converte
--                  "novo valor" ou "%" nesse valor final);
--    promo_until = timestamp de expiração (null = sem promoção).
-- ============================================================
alter table public.products
  add column if not exists promo_price numeric(10,2);
alter table public.products
  add column if not exists promo_until timestamptz;

-- ============================================================
-- 2) Tabela de vínculo N:N produto x categoria
-- ============================================================
create table if not exists public.product_categories (
  product_id  uuid not null references public.products(id)   on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create index if not exists product_categories_category_idx
  on public.product_categories (category_id);
create index if not exists product_categories_product_idx
  on public.product_categories (product_id);

-- RLS no MESMO padrão de schema.sql: leitura pública, escrita só admin
alter table public.product_categories enable row level security;

drop policy if exists "public read product_categories" on public.product_categories;
create policy "public read product_categories" on public.product_categories for select
  using (true);

drop policy if exists "admin write product_categories" on public.product_categories;
create policy "admin write product_categories" on public.product_categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 3) Backfill do vínculo a partir da categoria principal
--    (idempotente: pode rodar de novo sem duplicar)
-- ============================================================
insert into public.product_categories (product_id, category_id)
select id, category_id
  from public.products
 where category_id is not null
on conflict do nothing;

-- ============================================================
-- 4) Categoria "Ofertas" (vitrine + área de promoções)
--    "on conflict do nothing" sem alvo cobre as duas UNIQUEs da tabela
--    (name e slug), então é seguro rodar mais de uma vez.
-- ============================================================
insert into public.categories (name, slug)
values ('Ofertas', 'ofertas')
on conflict do nothing;

-- avisa o PostgREST para recarregar o cache (coluna e tabela novas)
notify pgrst, 'reload schema';
