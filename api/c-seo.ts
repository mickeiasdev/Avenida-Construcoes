// PRÉ-RENDER SEO DA CATEGORIA — /c/:slug injeta title/OG/JSON-LD da
// categoria e serve o SPA na mesma URL.
export const config = { runtime: 'edge' }

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"')

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = url.pathname.replace(/^\/c\//, '').replace(/\/$/, '')
  const origin = url.origin

  let html = await fetch(origin + '/index.html').then((r) => r.text())

  const SB = process.env.VITE_SUPABASE_URL ?? ''
  const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (SB && KEY && slug) {
    try {
      const r = await fetch(
        SB + '/rest/v1/categories?slug=eq.' + encodeURIComponent(slug) + '&select=name,slug',
        { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } },
      )
      const cat = (await r.json())?.[0]
      if (cat?.name) {
        const metas = [
          '<title>' + esc(cat.name) + ' — produtos</title>',
          '<meta name="description" content="Produtos de ' + esc(cat.name) + ' na nossa loja." />',
          '<meta property="og:title" content="' + esc(cat.name) + '" />',
          '<meta property="og:description" content="Produtos de ' + esc(cat.name) + '" />',
          '<meta property="og:url" content="' + origin + '/c/' + esc(slug) + '" />',
          '<link rel="canonical" href="' + origin + '/c/' + esc(slug) + '" />',
          '<script type="application/ld+json">' + JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: cat.name,
            url: origin + '/c/' + slug,
          }) + '</script>',
        ].join('\n')
        html = html.replace(/<title>[^<]*<\/title>/, '')
        html = html.replace('</head>', '\n  ' + metas + '\n</head>')
      }
    } catch { /* segue o SPA puro */ }
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
