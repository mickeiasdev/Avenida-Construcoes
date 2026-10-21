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

// ===== CONTRASTE GARANTIDO (WCAG AA) =====
// A cor da marca aparece como TEXTO sobre branco (preços, links) e como
// FUNDO de texto branco (botões .btn-primary). Nas duas direções o WCAG AA
// pede >= 4.5:1 — cor muito clara (ex.: laranja #f97316: 3:1) reprova.
// Aqui escurecemos a cor (mistura com preto, matiz preservado) até passar,
// ANTES de aplicar E de gravar no cache — quem abre a página já vê a cor
// final, e o script inline do index.html pinta o mesmo valor.
const CONTRAST_TARGET = 4.5

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function channelLuminance(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

// luminância relativa do WCAG; branco puro = 1
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

// razão de contraste da cor contra o BRANCO (textos claros sobre a cor e
// a cor usada como texto sobre fundo branco — mesma razão, espelhada)
function contrastWithWhite(hex) {
  return (1 + 0.05) / (luminance(hex) + 0.05)
}

// Escurece a cor (mistura com preto) até contraste >= 4.5:1 contra branco.
// Passa ilesa se já for legível; cor inválida volta como veio (sem surpresa).
export function ensureAccessible(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex.trim())) return hex
  const clean = hex.trim()
  if (contrastWithWhite(clean) >= CONTRAST_TARGET) return clean
  const [r, g, b] = hexToRgb(clean)
  for (let k = 0.05; k <= 0.6; k += 0.05) {
    const mixed = '#' + [r, g, b]
      .map((c) => Math.round(c * (1 - k)).toString(16).padStart(2, '0'))
      .join('')
    if (contrastWithWhite(mixed) >= CONTRAST_TARGET) return mixed
  }
  return '#000000' // caso extremo (cor quase branca): legibilidade acima de tudo
}

// Aplica no <html> (vence o :root do CSS) e na barra do navegador mobile
export function applyBrand(primary, secondary) {
  if (!primary) return
  const safe = ensureAccessible(primary)
  const root = document.documentElement
  root.style.setProperty('--brand-primary', safe)
  if (secondary) root.style.setProperty('--brand-secondary', ensureAccessible(secondary))
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', safe)
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
  // grava a versão ACESSÍVEL: o script inline do index.html aplica este
  // valor antes do primeiro paint — precisa ser o mesmo que o React aplica
  const payload = {
    primary: ensureAccessible(String(primary)),
    secondary: secondary ? ensureAccessible(String(secondary)) : null,
  }
  if (Number.isFinite(fs) && fs >= FONT_SCALE_MIN && fs <= FONT_SCALE_MAX) {
    payload.fontScale = Math.round(fs)
  }
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // sem localStorage o app segue funcionando, só não evita o flash na próxima visita
  }
}
