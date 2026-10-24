// Smoke test do bundle principal. O bug da "tela branca" (ReferenceError:
// UserCheck is not defined, commit 01c8e08) aconteceu no nível de MÓDULO —
// const ITEMS do AdminLayout avaliada antes do React montar qualquer coisa.
// oxlint/tsc não pegam identificador não importado em JSX/objetos, e o build
// passa feliz. Este teste avalia o grafo estático inteiro do App (o mesmo
// código do index-*.js) e falha se QUALQUER módulo explodir ao ser carregado.
import { describe, it, expect } from 'vitest'

describe('smoke: grafo estático do bundle principal', () => {
  it('App.jsx avalia todos os módulos importados estaticamente sem ReferenceError', async () => {
    const mod = await import('../App.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('AdminLayout carrega (UserCheck precisa estar importado — bug da tela branca)', async () => {
    const mod = await import('../layouts/AdminLayout.jsx')
    expect(typeof mod.default).toBe('function')
  })
})
