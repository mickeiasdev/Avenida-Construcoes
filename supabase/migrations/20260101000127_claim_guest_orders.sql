-- ============================================================
-- MIGRATION 27 — Histórico completo do cliente + refazer compra
-- claim_guest_orders: quando o cliente ENTRA na conta, a loja adota
-- os pedidos feitos como VISITANTE com o mesmo CPF ou telefone do
-- perfil — o histórico fica completo em /pedidos (e a leitura passa
-- a valer pela RLS normal, que exige user_id).
-- Idempotente: pedidos já adotados têm user_id preenchido.
-- ============================================================

create or replace function public.claim_guest_orders(p_cpf text, p_phone text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cpf   text;
  v_phone text;
  v_count int;
begin
  if v_uid is null then
    return 0;
  end if;
  v_cpf   := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if v_cpf = '' and length(v_phone) < 10 then
    return 0;
  end if;

  update public.orders o
     set user_id = v_uid,
         is_guest = false
   where o.user_id is null
     and o.is_guest = true
     and (
       (v_cpf <> '' and coalesce(o.customer_cpf, '') = v_cpf)
       or (length(v_phone) >= 10 and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8))
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.claim_guest_orders(text, text) from public;
grant execute on function public.claim_guest_orders(text, text) to authenticated;

notify pgrst, 'reload schema';