// Regressão do "imagens quebradas na vitrine": o thumb() gerava
// /storage/v1/render/public/... (rota inexistente, 404) em vez da rota
// correta do Supabase /storage/v1/render/image/public/... — a vitrine
// inteira (ProductCard, MenuProductRow, SearchBar, carrinho, quick view)
// quebrava, enquanto admin e página do produto (URL original) funcionavam.
import { describe, it, expect } from 'vitest'
import { thumb } from '../imageUrl'

const OBJECT_URL = 'https://xyz.supabase.co/storage/v1/object/public/store/products/foo.png'

describe('thumb(url, width)', () => {
  it('gera a rota de render CORRETA do Supabase (/render/image/public/)', () => {
    expect(thumb(OBJECT_URL, 500))
      .toBe('https://xyz.supabase.co/storage/v1/render/image/public/store/products/foo.png?width=500&quality=75')
  })

  it('usa a largura pedida e quality=75', () => {
    expect(thumb(OBJECT_URL, 200))
      .toContain('?width=200&quality=75')
  })

  it('URL externa (não-Supabase storage) passa intacta', () => {
    expect(thumb('https://imgs.example.com/foto.jpg')).toBe('https://imgs.example.com/foto.jpg')
  })

  it('URL vazia/nula devolve string vazia sem explodir', () => {
    expect(thumb('')).toBe('')
    expect(thumb(null)).toBe('')
    expect(thumb(undefined)).toBe('')
  })
})
