import { beforeEach, describe, expect, it } from 'vitest'
import { BRAND_CACHE_KEY, applyBrand, readCachedBrand, writeCachedBrand } from '../lib/brandTheme'

// O cache da cor existe para a loja abrir já na cor configurada, sem piscar o
// roxo padrão do template enquanto o StoreContext busca store_settings.
describe('brandTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = '<meta name="theme-color" content="#475569" />'
  })

  it('grava a cor aplicada em cache e a lê de volta', () => {
    writeCachedBrand('#f97316', '#1e293b')
    expect(readCachedBrand()).toEqual({ primary: '#f97316', secondary: '#1e293b' })
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
    expect(readCachedBrand()).toEqual({ primary: '#f90', secondary: null })
  })
})
