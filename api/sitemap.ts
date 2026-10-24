// SITEMAP dinâmico — produtos ativos + home, para o Google indexar a loja.
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  let urls: { loc: string, changefreq: string, priority: string }[] = [
    { loc: origin + '/', changefreq: 'daily', priority: '1.0' },
  ]

  const SB = process.env.VITE_SUPABASE_URL ?? ''
  const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (SB && KEY) {
    try {
      const r = await fetch(SB + '/rest/v1/products?select=id&active=eq.true&limit=2000', {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      })
      const list = await r.json()
      for (const p of list ?? []) {
        urls.push({ loc: origin + '/produto/' + p.id, changefreq: 'weekly', priority: '0.8' })
      }
      // categorias também viram páginas indexáveis (/c/:slug)
      const rc = await fetch(SB + '/rest/v1/categories?select=slug&limit=200', {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      })
      const cats = await rc.json()
      for (const c of cats ?? []) {
        urls.push({ loc: origin + '/c/' + c.slug, changefreq: 'weekly', priority: '0.6' })
      }
    } catch { /* banco fora: só a home */ }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + u.loc + '</loc><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority></url>').join('\n') +
    '\n</urlset>'

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
