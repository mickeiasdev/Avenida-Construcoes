-- ============================================================
-- MIGRATION 22 — Mais vendidos da vitrine (RPC pública)
-- Rode via `supabase db push` ou no SQL Editor (idempotente).
-- Soma o que foi vendido por produto (order_items x pedidos não
-- cancelados). A vitrine abre por padrão nos mais vendidos; se a
-- loja ainda não tem vendas, o front mostra destaques (fallback).
-- SECURITY DEFINER: visitante não enxerga order_items via RLS,
-- mas pode pedir o ranking (devolve só id + total vendido).
-- ============================================================

create or replace function public.top_selling_products(p_limit int default 12)
returns table (product_id uuid, sold bigint)
language sql
security definer
set search_path = public
as $$
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

notify pgrst, 'reload schema';