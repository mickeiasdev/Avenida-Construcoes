-- ============================================================
-- MIGRATION 29 — Corrige upload de imagens (RLS do Storage)
--
-- PROBLEMA: upload com upsert:true exige que a policy de UPDATE
-- tenha WITH CHECK além de USING. Sem o WITH CHECK, o PostgreSQL
-- rejeita o INSERT com "new row violates row-level security policy".
--
-- CORREÇÃO: todas as policies agora têm USING + WITH CHECK.
-- Idempotente.
-- ============================================================

-- garante o bucket público
insert into storage.buckets (id, name, public) values ('store','store',true)
on conflict (id) do update set public = true;

-- leitura pública
drop policy if exists "public read store assets" on storage.objects;
create policy "public read store assets" on storage.objects
  for select using (bucket_id = 'store');

-- INSERT: só admin (with check obrigatório)
drop policy if exists "admin upload store assets" on storage.objects;
create policy "admin upload store assets" on storage.objects
  for insert with check (bucket_id = 'store' and public.is_admin());

-- UPDATE: agora com USING + WITH CHECK (necessário para upsert:true)
drop policy if exists "admin update store assets" on storage.objects;
create policy "admin update store assets" on storage.objects
  for update using (bucket_id = 'store' and public.is_admin())
  with check (bucket_id = 'store' and public.is_admin());

-- DELETE: só admin
drop policy if exists "admin delete store assets" on storage.objects;
create policy "admin delete store assets" on storage.objects
  for delete using (bucket_id = 'store' and public.is_admin());

notify pgrst, 'reload schema';