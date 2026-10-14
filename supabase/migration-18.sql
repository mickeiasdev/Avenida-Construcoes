-- ============================================================
-- MIGRATION 18 — permite ao ADMIN apagar imagens do bucket 'store'
-- Rode no Supabase → SQL Editor, UMA VEZ (idempotente).
-- Sem esta policy o Supabase NEGA o delete da imagem (excluir produto,
-- trocar logo/banner) e o arquivo ficaria para sempre no armazenamento.
-- ============================================================
drop policy if exists "admin delete store assets" on storage.objects;
create policy "admin delete store assets" on storage.objects
  for delete using (bucket_id = 'store' and public.is_admin());
