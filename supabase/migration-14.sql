-- ============================================================
-- MIGRATION 14 — Agregações do painel feitas NO BANCO
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-13.
--
-- OPCIONAL: o app funciona sem ela (cai no cálculo local). Mas o PostgREST
-- do Supabase responde no máximo 1000 linhas por requisição e está com
-- agregados desabilitados ("Use of aggregate functions is not allowed"),
-- então, em loja com muitos pedidos, os cartões do Dashboard e a coluna
-- "total gasto" de /admin/clientes ficariam silenciosamente errados.
--
-- security invoker + RLS: a função enxerga só o que o chamador já pode ler
-- (a policy de orders/profiles libera tudo para is_admin()), então apenas o
-- admin recebe números — ninguém ganha acesso novo por causa disso.
-- ============================================================

create or replace function public.store_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sales_total', coalesce((select sum(total) from public.orders where status = 'delivered'), 0),
    'delivered_count', (select count(*) from public.orders where status = 'delivered'),
    'in_progress_count', (select count(*) from public.orders where status not in ('delivered','cancelled')),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(dia, 'DD/MM'), 'total', total) order by dia)
      from (
        select date_trunc('day', created_at) as dia, sum(total) as total
        from public.orders
        where status = 'delivered'
          and created_at >= now() - interval '7 days'
        group by 1
      ) d
    ), '[]'::jsonb),
    'top_sold', coalesce((
      select jsonb_agg(jsonb_build_object('name', product_name, 'qty', qty, 'revenue', revenue) order by qty desc)
      from (
        select product_name, sum(quantity) as qty, sum(quantity * unit_price) as revenue
        from public.order_items
        group by product_name
        order by 2 desc
        limit 5
      ) t
    ), '[]'::jsonb)
  );
$$;

-- Estatísticas por cliente (usadas em /admin/clientes)
create or replace function public.store_client_stats()
returns table (user_id uuid, orders_count bigint, open_count bigint, spent numeric, last_order timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select o.user_id,
         count(*) as orders_count,
         count(*) filter (where o.status not in ('delivered','cancelled')) as open_count,
         coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as spent,
         max(o.created_at) as last_order
  from public.orders o
  where o.user_id is not null
  group by o.user_id;
$$;

revoke all on function public.store_dashboard_stats() from public;
revoke all on function public.store_client_stats() from public;
grant execute on function public.store_dashboard_stats() to authenticated;
grant execute on function public.store_client_stats() to authenticated;

notify pgrst, 'reload schema';
