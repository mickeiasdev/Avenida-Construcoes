import { beforeEach, describe, expect, it } from 'vitest'
import {
  BRAND_CACHE_KEY, applyBrand, applyFontScale, normalizeFontScale,
  ensureAccessible, readCachedBrand, writeCachedBrand,
} from '../lib/brandTheme'

// O cache da cor/fonte existe para a loja abrir já como o lojista configurou,
// sem piscar o roxo padrão do template enquanto o StoreContext busca
// store_settings.
describe('brandTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = '<meta name="theme-color" content="#475569" />'
  })

  it('grava a cor aplicada em cache e a lê de volta', () => {
    writeCachedBrand('#b45309', '#1e293b')
    expect(readCachedBrand()).toEqual({ primary: '#b45309', secondary: '#1e293b', fontScale: null })
  })

  it('sem cache devolve null (primeira visita)', () => {
    expect(readCachedBrand()).toBeNull()
  })

  it('aplica a cor no theme-color da barra do navegador', () => {
    applyBrand('#b45309', '#1e293b')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#b45309')
  })

  it('ignora cache corrompido ou com valor que não é hex', () => {
    localStorage.setItem(BRAND_CACHE_KEY, '{nao e json}')
    expect(readCachedBrand()).toBeNull()
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ primary: 'red; background: url(x)' }))
    expect(readCachedBrand()).toBeNull()
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ primary: 42 }))
    expect(readCachedBrand()).toBeNull()
  })

  it('não grava valor inválido (evita injetar CSS arbitrário)', () => {
    writeCachedBrand('red; background: url(x)', null)
    expect(localStorage.getItem(BRAND_CACHE_KEY)).toBeNull()
    writeCachedBrand(null, null)
    expect(localStorage.getItem(BRAND_CACHE_KEY)).toBeNull()
  })

  it('aceita hex de 3 dígitos (normalizado p/ 6 no cache, já acessível)', () => {
    writeCachedBrand('#f90', null)
    const cached = readCachedBrand()
    // 3 dígitos vira 6 ao ser escurecido para contraste — e o valor
    // gravado é exatamente o que o ensureAccessible calcula
    expect(cached?.primary).toBe(ensureAccessible('#f90'))
    expect(cached?.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(cached?.secondary).toBeNull()
  })
})

// ===== CONTRASTE AUTOMÁTICO (WCAG AA >= 4.5:1 contra branco) =====
// A cor da marca é texto sobre branco E fundo de texto branco: clara demais
// (laranja #f97316 ≈ 3:1) reprova nas duas direções. O ensureAccessible
// escurece preservando o matiz; já legível volta ilesa.
describe('ensureAccessible — contraste WCAG AA', () => {
  it('escurece cor clara demais até ficar legível', () => {
    const dark = ensureAccessible('#f97316')
    expect(dark).not.toBe('#f97316')
    // idempotente = passou do limite (aplicar de novo não muda mais nada)
    expect(ensureAccessible(dark)).toBe(dark)
  })

  it('escurece o laranja da Avenida (#cc6d2e) mantendo o tom quente', () => {
    const dark = ensureAccessible('#cc6d2e')
    expect(dark).not.toBe('#cc6d2e')
    expect(dark.startsWith('#')).toBe(true)
    // continua quente: canal vermelho dominante preservado
    const r = parseInt(dark.slice(1, 3), 16)
    const b = parseInt(dark.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('cor já acessível volta exatamente como veio', () => {
    expect(ensureAccessible('#b45309')).toBe('#b45309')
    expect(ensureAccessible('#1e293b')).toBe('#1e293b')
    expect(ensureAccessible('#000000')).toBe('#000000')
  })

  it('valor que não é hex volta como veio (sem surpresa)', () => {
    expect(ensureAccessible('red; background: url(x)')).toBe('red; background: url(x)')
    expect(ensureAccessible(null)).toBe(null)
    expect(ensureAccessible(undefined)).toBe(undefined)
  })

  it('applyBrand e cache gravam a MESMA cor acessível (sem flash na 2ª visita)', () => {
    applyBrand('#f97316', '#fef3c7')
    const appliedPrimary = document.documentElement.style.getPropertyValue('--brand-primary')
    const appliedSecondary = document.documentElement.style.getPropertyValue('--brand-secondary')
    writeCachedBrand('#f97316', '#fef3c7')
    const cached = readCachedBrand()
    expect(cached?.primary).toBe(appliedPrimary)
    expect(cached?.secondary).toBe(appliedSecondary)
  })
})

describe('escala de fonte do sistema', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('100% mantém a base rem padrão (16px)', () => {
    applyFontScale(100)
    expect(document.documentElement.style.fontSize).toBe('16px')
  })

  it('aplica a escala no <html> — tudo em rem cresce junto', () => {
    applyFontScale(115)
    expect(document.documentElement.style.fontSize).toBe('18.4px')
    applyFontScale(85)
    expect(document.documentElement.style.fontSize).toBe('13.6px')
  })

  it('grava a escala no cache e lê de volta', () => {
    writeCachedBrand('#b45309', '#1e293b', 115)
    expect(readCachedBrand()).toEqual({ primary: '#b45309', secondary: '#1e293b', fontScale: 115 })
  })

  it('rejeita escala fora dos limites no cache (80–130)', () => {
    writeCachedBrand('#b45309', '#1e293b', 999)
    expect(readCachedBrand()?.fontScale).toBeNull()
    writeCachedBrand('#b45309', '#1e293b', 'abc')
    expect(readCachedBrand()?.fontScale).toBeNull()
  })

  it('normalizeFontScale satura nos limites e cura valores inválidos', () => {
    expect(normalizeFontScale(200)).toBe(130)
    expect(normalizeFontScale(10)).toBe(80)
    expect(normalizeFontScale('115')).toBe(115)
    expect(normalizeFontScale(undefined)).toBe(100)
    expect(normalizeFontScale('não é número')).toBe(100)
  })

  it('aplicação também satura: nunca sai do intervalo seguro', () => {
    applyFontScale(500)
    expect(document.documentElement.style.fontSize).toBe('20.8px') // 130%
    applyFontScale(1)
    expect(document.documentElement.style.fontSize).toBe('12.8px') // 80%
  })
})
