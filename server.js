// ============================================================
// SERVIDOR DA LOJA — Oracle Cloud Always Free (ou qualquer VPS Linux)
// Substitui a Vercel: serve o build estático do Vite (dist/) e as
// mesmas 4 rotas dinâmicas que lá eram serverless (api/*.ts):
//   /robots.txt, /sitemap.xml, /c/:slug e /produto/:id
// Zero dependências — só Node 18+. Roda atrás do Caddy (HTTPS grátis
// e automático) via deploy/oracle/Caddyfile, gerenciado pelo systemd
// via deploy/oracle/wls.service. Guia completo: DEPLOY-ORACLE.md
// ============================================================
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT ?? 3000)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- .env (parser próprio, sem dotenv) ----------
async function loadDotEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* sem .env: segue com o que veio do ambiente */ }
}
await loadDotEnv()

// aceita os dois nomes: SUPABASE_URL (servidor) ou VITE_ (mesmo do build)
const SB = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

async function sbGet(query) {
  const r = await fetch(SB + '/rest/v1/' + query, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  })
  return r.json()
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&' + 'amp;')
  .replace(/</g, '&' + 'lt;')
  .replace(/>/g, '&' + 'gt;')
  .replace(/"/g, '&' + 'quot;')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json',
  '.mp4': 'video/mp4',
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, headers)
  res.end(buf)
}

// origem pública: atrás do Caddy vem X-Forwarded-Proto (https)
function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] ?? 'http'
  return proto + '://' + (req.headers.host ?? 'localhost:3000')
}

async function indexHtml() {
  return readFile(join(DIST, 'index.html'), 'utf8')
}

// ---------- rotas dinâmicas de SEO (mesma lógica dos api/*.ts) ----------
async function robotsTxt(origin) {
  return 'User-agent: *' + String.fromCharCode(10) + 'Allow: /' + String.fromCharCode(10) + String.fromCharCode(10) + 'Sitemap: ' + origin + '/sitemap.xml' + String.fromCharCode(10)
}

async function sitemapXml(origin) {
  const NL = String.fromCharCode(10)
  const urls = [{ loc: origin + '/', changefreq: 'daily', priority: '1.0' }]
  if (SB && KEY) {
    try {
      const products = await sbGet('products?select=id&active=eq.true&limit=2000')
      for (const p of products ?? []) urls.push({ loc: origin + '/produto/' + p.id, changefreq: 'weekly', priority: '0.8' })
      const cats = await sbGet('categories?select=slug&limit=200')
      for (const c of cats ?? []) urls.push({ loc: origin + '/c/' + c.slug, changefreq: 'weekly', priority: '0.6' })
    } catch { /* banco fora: só a home */ }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>' + NL +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + NL +
    urls.map((u) => '  <url><loc>' + u.loc + '</loc><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority></url>').join(NL) +
    NL + '</urlset>'
}

async function categoriaSeo(origin, slug) {
  let html = await indexHtml()
  if (SB && KEY && slug) {
    try {
      const cat = (await sbGet('categories?slug=eq.' + encodeURIComponent(slug) + '&select=name,slug'))?.[0]
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
        ].join(String.fromCharCode(10))
        html = html.replace(new RegExp('<title>[^<]*</title>'), '')
        html = html.replace('</head>', String.fromCharCode(10) + '  ' + metas + String.fromCharCode(10) + '</head>')
      }
    } catch { /* segue o SPA puro */ }
  }
  return html
}

async function produtoSeo(origin, id) {
  let html = await indexHtml()
  if (SB && KEY && UUID_RE.test(id)) {
    try {
      const p = (await sbGet('products?id=eq.' + id + '&select=name,description,price,promo_price,promo_until,discount_percent,image_url'))?.[0]
      if (p?.name) {
        const promoAtiva = p.promo_price != null && p.promo_until != null && new Date(p.promo_until).getTime() > Date.now()
        const price = promoAtiva
          ? Number(p.promo_price)
          : Math.round(Number(p.price) * (1 - Number(p.discount_percent ?? 0) / 100) * 100) / 100
        const desc = String(p.description ?? p.name).slice(0, 160)
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
            offers: { '@type': 'Offer', price: price.toFixed(2), priceCurrency: 'BRL', availability: 'https://schema.org/InStock' },
          }) + '</script>',
        ].filter(Boolean).join(String.fromCharCode(10))
        html = html.replace(new RegExp('<title>[^<]*</title>'), '<title>' + esc(p.name) + '</title>')
        html = html.replace('</head>', String.fromCharCode(10) + '  ' + metas + String.fromCharCode(10) + '</head>')
      }
    } catch { /* banco fora: segue o index.html puro */ }
  }
  return html
}

// ---------- servidor ----------
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const origin = originOf(req)
    let path = decodeURIComponent(url.pathname)
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

    // saúde (monitor do systemd/uptime)
    if (path === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' })

    // as 4 rotas dinâmicas
    if (path === '/robots.txt') return send(res, 200, await robotsTxt(origin), { 'Content-Type': 'text/plain; charset=utf-8' })
    if (path === '/sitemap.xml') return send(res, 200, await sitemapXml(origin), { 'Content-Type': 'application/xml; charset=utf-8' })
    if (path.startsWith('/c/')) {
      const html = await categoriaSeo(origin, path.slice(3))
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    }
    if (path.startsWith('/produto/') && UUID_RE.test(path.slice('/produto/'.length))) {
      const html = await produtoSeo(origin, path.slice('/produto/'.length))
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    }

    // arquivos estáticos do build (assets com hash no nome = cache eterno)
    const full = normalize(join(DIST, path))
    if (!full.startsWith(DIST)) return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain; charset=utf-8' })
    try {
      const body = await readFile(full)
      const ext = extname(full).toLowerCase()
      const type = MIME[ext] ?? 'application/octet-stream'
      let cache = 'public, max-age=86400'
      if (path.startsWith('/assets/')) cache = 'public, max-age=31536000, immutable'
      else if (ext === '.html' || ext === '.webmanifest' || path === '/sw.js') cache = 'no-cache'
      return send(res, 200, body, { 'Content-Type': type, 'Cache-Control': cache })
    } catch {
      // rota do SPA (sem extensão) cai no index.html; arquivo com extensão
      // que não existe é 404 de verdade (asset quebrado não vira HTML)
      if (extname(path)) return send(res, 404, 'not found', { 'Content-Type': 'text/plain; charset=utf-8' })
      return send(res, 200, await indexHtml(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    }
  } catch (err) {
    console.error('[server]', err)
    return send(res, 500, 'erro interno', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
})

server.listen(PORT, () => {
  console.log('Loja no ar: http://localhost:' + PORT + ' (Supabase: ' + (SB ? 'configurado' : 'SEM ENV — SEO dinâmico desligado') + ')')
})
