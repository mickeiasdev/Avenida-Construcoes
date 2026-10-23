// PRÉ-RENDER SEO DA PÁGINA DE PRODUTO — pega o index.html do SPA e injeta
// <title>, description, Open Graph e JSON-LD (Product) do produto REAL.
// Bots (Google/WhatsApp) veem as metas; humanos abrem o SPA normal — a
// mesma URL serve os dois, sem mudar o app.
export const config = { runtime: 'edge' }

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"')

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const id = url.pathname.replace(/^\/produto\//, '').replace(/\/$/, '')
  const origin = url.origin

  let html = await fetch(origin + '/index.html').then((r) => r.text())

  // tenta enriquecer com o produto do banco (sem env configurado segue SPA puro)
  const SB = process.env.VITE_SUPABASE_URL ?? ''
  const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (SB && KEY && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    try {
      const r = await fetch(
        SB + '/rest/v1/products?id=eq.' + id + '&select=name,description,price,promo_price,promo_until,discount_percent,image_url',
        { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } },
      )
      const p = (await r.json())?.[0]
      if (p?.name) {
        const promoAtiva = p.promo_price != null && p.promo_until != null && new Date(p.promo_until).getTime() > Date.now()
        const price = promoAtiva ? Number(p.promo_price) : Math.round(Number(p.price) * (1 - Number(p.discount_percent ?? 0) / 100) * 100) / 100
        const desc = (p.description ?? p.name).slice(0, 160)
        const metas = [
          '<meta property="og:title" content="' + esc(p.name) + '" />',
          '<meta property="og:description" content="' + esc(desc) + '" />',
          p.image_url ? '<meta property="og:image" content="' + esc(p.image_url) + '" />' : '',
          '<meta name="twitter:card" content="summary_large_image" />',
          '<meta property="og:url" content="' + origin + '/produto/' + id + '" />',
          '<link rel="canonical" href="' + origin + '/produto/' + id + '" />',
          '<script type="application/ld+json">' + JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name,
            description: p.description ?? undefined,
            image: p.image_url ? [p.image_url] : undefined,
            offers: { '@type': 'Offer', price: String(price.toFixed(2)), priceCurrency: 'BRL', availability: 'https://schema.org/InStock' },
          }) + '</script>',
        ].filter(Boolean).join('\n')
        html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(p.name) + '</title>')
        html = html.replace('</head>', '\n  ' + metas + '\n</head>')
      }
    } catch { /* banco fora: segue o index.html puro */ }
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
