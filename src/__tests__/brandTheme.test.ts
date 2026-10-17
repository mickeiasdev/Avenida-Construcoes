import { beforeEach, describe, expect, it } from 'vitest'
import {
  BRAND_CACHE_KEY, applyBrand, applyFontScale, normalizeFontScale,
  readCachedBrand, writeCachedBrand,
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
    writeCachedBrand('#f97316', '#1e293b')
    expect(readCachedBrand()).toEqual({ primary: '#f97316', secondary: '#1e293b', fontScale: null })
  })

  it('sem cache devolve null (primeira visita)', () => {
    expect(readCachedBrand()).toBeNull()
  })

  it('aplica a cor no theme-color da barra do navegador', () => {
    applyBrand('#f97316', '#1e293b')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe('#f97316')
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

  it('aceita hex de 3 dígitos', () => {
    writeCachedBrand('#f90', null)
    expect(readCachedBrand()).toEqual({ primary: '#f90', secondary: null, fontScale: null })
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
    writeCachedBrand('#f97316', '#1e293b', 115)
    expect(readCachedBrand()).toEqual({ primary: '#f97316', secondary: '#1e293b', fontScale: 115 })
  })

  it('rejeita escala fora dos limites no cache (80–130)', () => {
    writeCachedBrand('#f97316', '#1e293b', 999)
    expect(readCachedBrand()?.fontScale).toBeNull()
    writeCachedBrand('#f97316', '#1e293b', 'abc')
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
