import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, SearchX } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../context/StoreContext'
import { ProductCard } from '../components/ProductCard'

const PAGE_SIZE = 6

// VITRINE: banner + filtro por categoria (chips) + busca com debounce
// (o header escreve ?q=) + paginação "Carregar mais".
// A barra de categorias do header só aparece quando o usuário rola
// a página até aqui — por isso os chips existem sempre no topo.
export default function Home() {
  const { settings, categories } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const catSlug = searchParams.get('cat') ?? ''

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const activeCat = categories.find((c) => c.slug === catSlug)

  const fetchProducts = useCallback(async (from, append) => {
    if (append) setLoadingMore(true); else setLoading(true)

    let query = supabase
      .from('products')
      .select('*, categories(name, slug)')
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (activeCat) query = query.eq('category_id', activeCat.id)
    if (q) {
      const safe = q.replace(/[%(),]/g, '')
      if (safe) query = query.or('name.ilike.%' + safe + '%,description.ilike.%' + safe + '%')
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (!error) {
      const list = data ?? []
      setProducts((prev) => (append ? [...prev, ...list] : list))
      setHasMore(list.length === PAGE_SIZE)
    }
    if (append) setLoadingMore(false); else setLoading(false)
  }, [activeCat, q])

  useEffect(() => {
    if (catSlug && categories.length === 0) return
    fetchProducts(0, false)
  }, [fetchProducts, catSlug, categories.length])

  function loadMore() { fetchProducts(products.length, true) }

  function selectCategory(slug) {
    const params = new URLSearchParams(searchParams)
    if (slug) params.set('cat', slug); else params.delete('cat')
    setSearchParams(params)
  }

  return (
    <div className="space-y-6">
      {/* BANNER PRINCIPAL */}
      <section className="relative overflow-hidden rounded-2xl">
        <img src={settings.banner_url} alt="" className="h-48 w-full object-cover sm:h-56 md:h-72" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center gap-2 p-6 text-white sm:p-8">
          <h1 className="max-w-md text-xl font-extrabold drop-shadow sm:text-2xl md:text-4xl">{settings.store_name}</h1>
          <p className="max-w-md text-xs text-white/85 sm:text-sm md:text-base">{settings.about}</p>
        </div>
      </section>

      {/* FILTROS POR CATEGORIA (todos os tamanhos de tela) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Categorias</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chips active={!catSlug} onClick={() => selectCategory('')} label="Todas" />
          {categories.map((c) => (
            <Chips key={c.id} active={catSlug === c.slug} onClick={() => selectCategory(c.slug)} label={c.name} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-800">
          {activeCat ? activeCat.name : 'Todos os produtos'}
          {q && <span className="ml-2 text-sm font-normal text-gray-500">· busca: “{q}”</span>}
        </h3>
        <span className="text-xs text-gray-400">{products.length} produto(s)</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : products.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <SearchX className="h-8 w-8 text-gray-300" />
          <p className="font-medium">Nenhum produto encontrado</p>
          <p className="text-sm">Tente outra busca ou remova os filtros de categoria.</p>
        </div>
      ) : (
        <>
          {/* 2 colunas no mobile para exibir mais itens por vez */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <button type="button" className="btn-primary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Chips({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'shrink-0 rounded-full px-3.5 py-1.5 text-xs ring-1 transition ' +
        (active ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
    >
      {label}
    </button>
  )
}
