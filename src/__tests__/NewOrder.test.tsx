import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// mock do client: a página consulta products e categories
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { from: fromMock, rpc: vi.fn() } }))

import NewOrderAdmin from '../pages/admin/NewOrder'

const PRODUTOS = [
  { id: 'p1', name: 'Cimento CP-II', price: 40, discount_percent: 0, stock: 10, image_url: null, category_id: 'c1', categories: { name: 'Cimento' } },
  { id: 'p2', name: 'Furadeira 500W', price: 200, discount_percent: 10, stock: 0, image_url: null, category_id: 'c2', categories: { name: 'Ferramentas' } },
]
const CATEGORIAS = [{ id: 'c1', name: 'Cimento' }, { id: 'c2', name: 'Ferramentas' }]

// thenable com a cara das cadeias do supabase-js
function query(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'not', 'is']) q[m] = () => q
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
  return q
}

fromMock.mockImplementation((table: string) =>
  query(table === 'products' ? PRODUTOS : table === 'categories' ? CATEGORIAS : [])
)

describe('PDV — venda na loja (seleção + separação retirada x entrega)', () => {
  it('monta a venda, deixa escolher o destino de cada item e calcula o total', async () => {
    render(
      <MemoryRouter>
        <NewOrderAdmin />
      </MemoryRouter>
    )

    // lista de produtos carregada (preço com desconto aplicado no segundo)
    expect(await screen.findByText('Furadeira 500W')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s*180,00/)).toBeInTheDocument() // 200 - 10%
    // o card do produto é um botão; o nome aparece de novo no painel da venda
    const addCimento = () => screen.getAllByRole('button', { name: /Cimento CP-II/ })[0]

    // dois cliques no mesmo produto = 2 unidades
    fireEvent.click(addCimento())
    fireEvent.click(addCimento())

    // começa tudo como retirada na hora
    expect(await screen.findByText(/Leva agora · 2 un\./)).toBeInTheDocument()
    // 2 × R$ 40,00 no resumo e no total
    expect(screen.getAllByText(/R\$\s*80,00/).length).toBeGreaterThan(0)

    // separa 1 unidade para entrega: o resumo passa a mostrar os dois destinos
    fireEvent.click(screen.getByRole('button', { name: 'Entregar depois' }))
    await waitFor(() => expect(screen.getByText(/Entrega depois · 2 un\./)).toBeInTheDocument())
    expect(screen.getByText(/Leva agora · 0 un\./)).toBeInTheDocument()

    // com entrega, telefone e endereço passam a ser exigidos
    expect(screen.getByText(/Telefone \/ WhatsApp \*/)).toBeInTheDocument()
    expect(screen.getByText('Endereço de entrega')).toBeInTheDocument()

    // finalizar sem preencher aponta os campos que faltam
    fireEvent.click(screen.getAllByRole('button', { name: /Finalizar venda/ })[0])
    expect(await screen.findByText('Informe o nome do cliente')).toBeInTheDocument()
    expect(screen.getByText(/Confira os campos destacados/)).toBeInTheDocument()
  })

  it('venda só de retirada não pede endereço', async () => {
    render(
      <MemoryRouter>
        <NewOrderAdmin />
      </MemoryRouter>
    )
    fireEvent.click((await screen.findAllByRole('button', { name: /Cimento CP-II/ }))[0])
    expect(screen.queryByText('Endereço de entrega')).not.toBeInTheDocument()
    expect(screen.getByText(/Leva agora · 1 un\./)).toBeInTheDocument()
    expect(screen.getByText(/Telefone \/ WhatsApp \(opcional\)/)).toBeInTheDocument()
  })
})
