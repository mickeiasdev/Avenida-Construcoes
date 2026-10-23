// robots.txt dinâmico — injeta a URL absoluta do sitemap na hora.
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  const txt = 'User-agent: *\nAllow: /\n\nSitemap: ' + origin + '/sitemap.xml\n'
  return new Response(txt, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
