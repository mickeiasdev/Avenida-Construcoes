-- ============================================================
-- MIGRATION 10 — CPF do cliente + observação do pedido + cliente
-- confirma a entrega do próprio pedido
-- Rode no Supabase → SQL Editor, UMA VEZ, DEPOIS da migration-9.
--
-- IMPORTANTE: o app funciona SEM esta migration.
--   • CPF e observação são gravados em updates "best-effort": se a coluna
--     ainda não existir, o erro é ignorado e o pedido continua normal.
--   • Enquanto a policy "own orders update" não existir, o botão
--     "Confirmar entrega" (src/pages/Orders.jsx) não altera nada.
-- Esta migration é ADITIVA e IDEMPOTENTE: pode ser rodada mais de uma vez
-- sem efeito colateral — só cria as colunas que faltam e recria a policy.
--
-- O que muda:
--   1) profiles ganha "cpf" (guardado no checkout de entrega);
--   2) orders ganha "customer_note" (observação: CPF, em nome de quem
--      recebe / obra, troco);
--   3) o cliente passa a poder marcar o PRÓPRIO pedido como "delivered",
--      que é o que o botão "Confirmar entrega" em /pedidos precisa.
-- ============================================================

-- ============================================================
-- 1) Colunas novas (aditivas — só criam se ainda não existirem)
-- ============================================================
alter table public.profiles
  add column if not exists cpf text;

alter table public.orders
  add column if not exists customer_note text;

-- A base (schema.sql) revoga UPDATE de profiles e re-concede coluna a coluna.
-- Sem este grant o update de CPF do checkout seria negado pela permissão de
-- coluna (o erro é ignorado, mas o CPF nunca seria guardado). Idempotente.
grant update (cpf) on table public.profiles to authenticated;

-- ============================================================
-- 2) RLS: o cliente confirma a entrega do pedido dele
--    O USING limita a atualização à própria linha; o WITH CHECK só
--    aceita a transição para "delivered" (o cliente não pode mexer em
--    total, endereço ou em outro status). O admin continua coberto
--    pela policy "admin orders update".
-- ============================================================
drop policy if exists "own orders update" on public.orders;
create policy "own orders update" on public.orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'delivered');

-- avisa o PostgREST para recarregar o cache de schema
notify pgrst, 'reload schema';
