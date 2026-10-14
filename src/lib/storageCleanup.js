import { supabase, getPublicUrl, STORAGE_BUCKET } from './supabaseClient'

// Faxina de imagens órfãs do bucket 'store'.
//
// Órfão = arquivo no Storage que NENHUM produto (foto principal + galeria) e
// NENHUMA configuração (logo/banner) referencia mais. Acontece quando alguém
// sobe uma foto dentro do modal e fecha sem salvar, ou dá erro no meio do
// upload. O delete exige admin (migration-18), então a faxina roda do painel —
// quem abre o Dashboard é admin por definição.
//
// É idempotente e sem pressa: roda em segundo plano e erra para o lado de NÃO
// apagar (qualquer dúvida, o arquivo fica).
export async function sweepOrphanImages() {
  // 1) URLs vivas
  const [prodRes, setRes] = await Promise.all([
    supabase.from('products').select('image_url, images').limit(1000),
    supabase.from('store_settings').select('logo_url, banner_url').eq('id', 1).maybeSingle(),
  ])
  const referenced = new Set()
  ;(prodRes.data ?? []).forEach((p) => {
    if (p.image_url) referenced.add(p.image_url)
    ;(Array.isArray(p.images) ? p.images : []).forEach((u) => referenced.add(u))
  })
  if (setRes.data?.logo_url) referenced.add(setRes.data.logo_url)
  if (setRes.data?.banner_url) referenced.add(setRes.data.banner_url)

  // 2) varre as pastas conhecidas do bucket (paginado)
  let removed = 0
  for (const folder of ['products', 'branding']) {
    let offset = 0
    for (;;) {
      const { data: files, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder, { limit: 100, offset, sortBy: { column: 'created_at', order: 'asc' } })
      if (error || !files?.length) break

      for (const f of files) {
        if (!f.id) continue // subpasta, não arquivo
        const path = folder + '/' + f.name
        const url = getPublicUrl(path)
        if (!referenced.has(url)) {
          const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([path])
          if (!rmErr) removed++
        }
      }
      if (files.length < 100) break
      offset += 100
    }
  }
  return removed
}
