// Cor da marca: cache local + aplicação nas variáveis CSS.
//
// Por que existe: o CSS nasce com a cor padrão do template (roxo) e a cor que o
// lojista escolheu só chega depois que o StoreContext busca store_settings no
// Supabase. Sem este cache a loja piscava roxo e só então ia para a cor certa.
// Aqui guardamos a última cor conhecida para o script inline do index.html
// pintar a página já correta, antes do primeiro paint e antes do React montar.

export const BRAND_CACHE_KEY = 'wls.brand.v1'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Aplica no <html> (vence o :root do CSS) e na barra do navegador mobile
export function applyBrand(primary, secondary) {
  if (!primary) return
  const root = document.documentElement
  root.style.setProperty('--brand-primary', primary)
  if (secondary) root.style.setProperty('--brand-secondary', secondary)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', primary)
}

export function readCachedBrand() {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const primary = String(parsed?.primary ?? '')
    if (!HEX.test(primary)) return null
    const secondary = String(parsed?.secondary ?? '')
    return { primary, secondary: HEX.test(secondary) ? secondary : null }
  } catch {
    return null // localStorage bloqueado (modo privado/iframe) ou JSON corrompido
  }
}

export function writeCachedBrand(primary, secondary) {
  if (!HEX.test(String(primary ?? ''))) return
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ primary, secondary: secondary ?? null }))
  } catch {
    // sem localStorage o app segue funcionando, só não evita o flash na próxima visita
  }
}
