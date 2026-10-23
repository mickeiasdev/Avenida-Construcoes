// Thumbnail automático: o Storage do Supabase consegue redimensionar na
// borda (/render). Card de 400px não precisa baixar a foto de 3MB da câmera
// — a vitrine carrega ~10x mais rápido. URL externa: devolve como veio.
export function thumb(url, width = 400) {
  const u = String(url ?? '')
  if (!u) return ''
  if (!u.includes('/storage/v1/object/public/')) return u
  return u
    .replace('/storage/v1/object/public/', '/storage/v1/render/public/')
    + '?width=' + width + '&quality=75'
}
