import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, SearchX } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../context/StoreContext'
import { getOpenStatus, formatBusinessHoursText } from '../lib/utils'
import { ProductCard } from '../components/ProductCard'

const PAGE_SIZE = 6

// VITRINE: banner + filtro por categoria (chips) + busca com debounce
// (o header escreve ?q=) + paginação "Carregar mais".
// A barra de categorias do header só aparece quando o usuário rola
// a página até aqui — por isso os chips existem sempre no topo.
export default function Home() {
  const { settings, categories } = useStore()
  const openStatus = getOpenStatus(settings)
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const catSlug = searchParams.get('cat') ?? ''

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [sort, setSort] = useState('recent')

  const activeCat = categories.find((c) => c.slug === catSlug)

  const fetchProducts = useCallback(async (from, append) => {
    if (append) setLoadingMore(true); else setLoading(true)

    let query = supabase
      .from('products')
      .select('*, categories(name, slug)')
      .eq('active', true)
      .order(
        sort === 'views' ? 'views' : (sort === 'price_asc' || sort === 'price_desc') ? 'price' : 'created_at',
        { ascending: sort === 'price_asc' }
      )

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
  }, [activeCat, q, sort])

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
      {/* HERO — banner gigante com degradê da marca e conteúdo em destaque */}
      <section className="relative overflow-hidden rounded-3xl">
        <img src={settings.banner_url} alt="" className="h-56 w-full object-cover sm:h-72 md:h-96" />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(100deg, color-mix(in srgb, var(--brand-secondary) 92%, transparent) 15%, color-mix(in srgb, var(--brand-primary) 35%, transparent) 70%, transparent)' }}
        />
        <div className="absolute inset-0 flex flex-col justify-center gap-3 p-6 text-white sm:p-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest backdrop-blur-sm">
            <span className={'h-2 w-2 rounded-full ' + (openStatus.open ? 'bg-green-400' : 'bg-red-400')} />
            {openStatus.label}
          </span>
          <h1 className="max-w-lg text-2xl font-extrabold leading-tight tracking-tight drop-shadow-lg sm:text-4xl md:text-5xl">
            {settings.store_name}
          </h1>
          <p className="max-w-md text-sm text-white/90 sm:text-base md:text-lg">{settings.about}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a href="#produtos" className="btn-primary shadow-lg">Ver ofertas</a>
            <span className="text-xs font-medium text-white/70">{formatBusinessHoursText(settings) || settings.business_hours}</span>
          </div>
        </div>
      </section>

      {/* FILTROS POR CATEGORIA (todos os tamanhos de tela) */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Explorar categorias</h2>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chips active={!catSlug} onClick={() => selectCategory('')} label="Todas" />
          {categories.map((c) => (
            <Chips key={c.id} active={catSlug === c.slug} onClick={() => selectCategory(c.slug)} label={c.name} />
          ))}
        </div>
      </div>

      <div id="produtos" className="flex flex-wrap items-center justify-between gap-2 scroll-mt-24">
        <h3 className="text-lg font-bold text-gray-800">
          {activeCat ? activeCat.name : 'Todos os produtos'}
          {q && <span className="ml-2 text-sm font-normal text-gray-500">· busca: “{q}”</span>}
        </h3>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-400 sm:inline">{products.length} produto(s)</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input w-36 py-1.5 text-xs"
            aria-label="Ordenar produtos"
          >
            <option value="recent">Mais recentes</option>
            <option value="views">Mais vistos</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
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

// Skeleton: sensação de velocidade no mobile (sem spinner solitário)
function SkeletonCard() {
  return (
    <div className="card overflow-hidden p-0">
      <div className="aspect-square w-full animate-pulse bg-gray-200" />
      <div className="space-y-2 p-3 sm:p-4">
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  )
}

function Chips({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ring-1 transition duration-200 active:scale-95 ' +
        (active
          ? 'bg-secondary text-white ring-secondary shadow-md'
          : 'bg-white text-gray-600 ring-violet-100 hover:-translate-y-0.5 hover:text-gray-900 hover:shadow-md hover:ring-primary/30')}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      {label}
    </button>
  )
}
