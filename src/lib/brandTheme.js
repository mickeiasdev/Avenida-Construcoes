// Cor da marca + tamanho da fonte: cache local + aplicação no <html>.
//
// Por que existe: o CSS nasce com a cor padrão do template (roxo) e a cor que o
// lojista escolheu só chega depois que o StoreContext busca store_settings do
// Supabase. Sem este cache a loja piscava roxo e só então ia para a cor certa.
// Aqui guardamos a última cor/escala conhecidas para o script inline do
// index.html pintar a página já correta, antes do primeiro paint e antes do
// React montar. A fonte usa o mesmo truque: escala a base rem do <html>.

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

// ===== Escala de fonte do sistema =====
// O app inteiro é medido em rem (Tailwind), então basta mudar a base do
// <html> (16px padrão) para tudo escalar junto: textos, campos, espaços.
// 100 = normal. Limites 80–130 (mesmo range da migration-20, no banco).
export const FONT_SCALE_MIN = 80
export const FONT_SCALE_MAX = 130
export const FONT_BASE_PX = 16

export function normalizeFontScale(scale) {
  const n = Math.round(Number(scale))
  if (!Number.isFinite(n)) return 100
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n))
}

export function applyFontScale(scale) {
  const pct = normalizeFontScale(scale)
  document.documentElement.style.fontSize =
    (FONT_BASE_PX * pct / 100).toFixed(3) + 'px'
  return pct
}

export function readCachedBrand() {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const primary = String(parsed?.primary ?? '')
    if (!HEX.test(primary)) return null
    const secondary = String(parsed?.secondary ?? '')
    const fs = Number(parsed?.fontScale)
    return {
      primary,
      secondary: HEX.test(secondary) ? secondary : null,
      fontScale: Number.isFinite(fs) && fs >= FONT_SCALE_MIN && fs <= FONT_SCALE_MAX ? fs : null,
    }
  } catch {
    return null // localStorage bloqueado (modo privado/iframe) ou JSON corrompido
  }
}

export function writeCachedBrand(primary, secondary, fontScale) {
  if (!HEX.test(String(primary ?? ''))) return
  const fs = Number(fontScale)
  const payload = { primary, secondary: secondary ?? null }
  if (Number.isFinite(fs) && fs >= FONT_SCALE_MIN && fs <= FONT_SCALE_MAX) {
    payload.fontScale = Math.round(fs)
  }
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // sem localStorage o app segue funcionando, só não evita o flash na próxima visita
  }
}
