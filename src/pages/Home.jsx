import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Flame, Loader2, Package, SearchX, Tag } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../context/StoreContext'
import { getOpenStatus, formatBusinessHoursText } from '../lib/utils'
import { ProductCard } from '../components/ProductCard'
import { MenuProductRow } from '../components/MenuProductRow'

const PAGE_SIZE = 6
const BEST_LIMIT = 12
const PRODUCT_EMBED = '*, categories!products_category_id_fkey(name, slug)'

// Ranking de mais vendidos (RPC migration-22): produtos com vendas,
// ordenados pela quantidade vendida. Silencioso se a RPC não existir
// ainda (devolve [] e a vitrine segue nas regras de completar).
async function fetchRanked(limit) {
  try {
    const { data: top, error } = await supabase.rpc('top_selling_products', { p_limit: limit })
    if (error || !top?.length) return []
    const ids = top.map((t) => t.product_id)
    const { data: list } = await supabase
      .from('products')
      .select(PRODUCT_EMBED)
      .eq('active', true)
      .in('id', ids)
    if (!list?.length) return []
    const rank = new Map(ids.map((id, i) => [id, i]))
    return [...list].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
  } catch {
    return []
  }
}

// VITRINE: banner + menu "Explorar" (mais vendidos, produtos, categorias e
// ofertas) + busca com debounce (o header escreve ?q=) + paginação.
//
// PADRÃO DA ABERTURA = MAIS VENDIDOS (ranking do banco via RPC migration-22).
// Loja ainda sem vendas? A aba não fica vazia: mostramos os destaques (mais
// vistos) e o título avisa "destaques da loja" — o filtro escolhido pelo
// lojista continua sendo "Mais vendidos".
//
// Modos via URL: (vazio)=mais vendidos · ?cat=todas · ?cat=<slug> ·
// ?cat=ofertas (promoções no ar, funciona mesmo sem a categoria Ofertas) · ?q=
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
  const [totalCount, setTotalCount] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [sort, setSort] = useState('recent')
  const [bestFallback, setBestFallback] = useState(false) // sem vendas → destaques
  const rankedAllRef = useRef(null) // ranking do modo "Todos" (vive entre páginas)

  const activeCat = categories.find((c) => c.slug === catSlug)
  const isBest = !q && !catSlug
  const isOfertas = catSlug === 'ofertas'
  const isAll = catSlug === 'todas'
  const isSearch = Boolean(q)

  // ---------- carregamento ----------
  // Regras da vitrine (val também para "Todos os produtos"):
  //   1. quem TEM vendas vem primeiro, na ordem do ranking;
  //   2. o limite vale para a lista FINAL (não só para os vendidos);
  //   3. completar com os demais produtos da loja até o limite;
  //   4. nunca repetir quem já está no ranking (exclusão direto no banco).
  const fetchProducts = useCallback(async (from, append) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setLoadError(null)

    // ===== MAIS VENDIDOS: ranking + complemento até o limite =====
    if (isBest) {
      setBestFallback(false)
      const ranked = await fetchRanked(BEST_LIMIT)
      let fill = []
      if (ranked.length < BEST_LIMIT) {
        let query = supabase
          .from('products')
          .select(PRODUCT_EMBED)
          .eq('active', true)
          .order('views', { ascending: false })
          .limit(BEST_LIMIT - ranked.length)
        if (ranked.length) query = query.not('id', 'in', '(' + ranked.map((r) => r.id).join(',') + ')')
        const { data, error } = await query
        if (error) {
          setLoadError(error.message ?? 'Falha ao carregar os produtos.')
          setProducts([]); setTotalCount(0); setHasMore(false)
          setLoading(false)
          return
        }
        fill = data ?? []
      }
      const list = [...ranked, ...fill].slice(0, BEST_LIMIT)
      if (!ranked.length) setBestFallback(true)
      setProducts(list)
      setTotalCount(list.length)
      setHasMore(false)
      setLoading(false)
      return
    }

    // ===== TODOS OS PRODUTOS: mais vendidos no topo, resto na sequência =====
    if (isAll && !q) {
      if (from === 0 && !rankedAllRef.current) rankedAllRef.current = await fetchRanked(50)
      const ranked = rankedAllRef.current ?? []
      let query = supabase
        .from('products')
        .select(PRODUCT_EMBED, { count: 'exact' })
        .eq('active', true)
        .order(
          sort === 'views' ? 'views' : (sort === 'price_asc' || sort === 'price_desc') ? 'price' : 'created_at',
          { ascending: sort === 'price_asc' }
        )
      if (ranked.length) query = query.not('id', 'in', '(' + ranked.map((r) => r.id).join(',') + ')')
      const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
      if (!error) {
        const list = data ?? []
        setProducts((prev) => (append ? [...prev, ...list] : [...ranked, ...list]))
        // total da loja = complemento (count já exclui o ranking) + ranking
        setTotalCount((typeof count === 'number' ? count : 0) + ranked.length)
        setHasMore(typeof count === 'number' ? from + list.length < count : list.length === PAGE_SIZE)
      } else {
        console.error('[vitrine] erro ao carregar produtos:', error?.message ?? error)
        setLoadError(error.message ?? 'Falha ao carregar os produtos.')
        if (!append) { setProducts([]); setTotalCount(0); setHasMore(false) }
      }
      if (append) setLoadingMore(false); else setLoading(false)
      return
    }

    // ===== demais modos: categoria (product_categories da migration-11),
    // ofertas (promo no ar) ou busca =====
    let query = supabase
      .from('products')
      .select(
        '*, categories!products_category_id_fkey(name, slug)' +
          (activeCat ? ', product_categories!inner(category_id)' : ''),
        { count: 'exact' },
      )
      .eq('active', true)
      .order(
        sort === 'views' ? 'views' : (sort === 'price_asc' || sort === 'price_desc') ? 'price' : 'created_at',
        { ascending: sort === 'price_asc' }
      )

    if (activeCat) query = query.eq('product_categories.category_id', activeCat.id)
    if (isOfertas) {
      // promoção ATIVA, igual ao preço exibido no card (hasActivePromo)
      query = query.not('promo_price', 'is', null).gt('promo_until', new Date().toISOString())
    }
    if (q) {
      const safe = q.replace(/[%(),]/g, '')
      if (safe) query = query.or('name.ilike.%' + safe + '%,description.ilike.%' + safe + '%')
    }

    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (!error) {
      const list = data ?? []
      setProducts((prev) => (append ? [...prev, ...list] : list))
      if (typeof count === 'number') setTotalCount(count)
      setHasMore(typeof count === 'number' ? from + list.length < count : list.length === PAGE_SIZE)
    } else {
      console.error('[vitrine] erro ao carregar produtos:', error?.message ?? error)
      setLoadError(error.message ?? 'Falha ao carregar os produtos.')
      if (!append) { setProducts([]); setTotalCount(0); setHasMore(false) }
    }
    if (append) setLoadingMore(false); else setLoading(false)
  }, [activeCat, q, sort, isBest, isOfertas, isAll])

  useEffect(() => {
    if (catSlug && catSlug !== 'todas' && catSlug !== 'ofertas' && categories.length === 0) return
    // ranking do modo "Todos" é recalculado a cada entrada no modo
    if (catSlug !== 'todas') rankedAllRef.current = null
    fetchProducts(0, false)
  }, [fetchProducts, catSlug, categories.length])

  // no modo "Todos" a lista exibida carrega o ranking no topo: o offset
  // da próxima página é só da parte complementar
  function loadMore() {
    const rankedCount = isAll ? (rankedAllRef.current?.length ?? 0) : 0
    fetchProducts(Math.max(0, products.length - rankedCount), true)
  }

  function selectFilter(value) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set('cat', value); else params.delete('cat')
    setSearchParams(params, { preventScrollReset: true })
  }

  const isMenu = settings?.layout === 'cardapio'

  // agrupar produtos por categoria para o cardápio
  const productsByCategory = useMemo(() => {
    if (!isMenu || !categories.length) return null
    const map = new Map()
    for (const c of categories) {
      const items = products.filter((p) => {
        const cats = p.categories ? [p.categories] : []
        return cats.some((c2) => c2.slug === c.slug) || (p.category_id && c.id === p.category_id)
      })
      if (items.length > 0) map.set(c, items)
    }
    return map
  }, [isMenu, categories, products])

  // rótulos do modo atual (título + botão do dropdown)
  const currentLabel = isSearch
    ? 'Resultados da busca'
    : isBest ? 'Mais vendidos'
    : isAll ? 'Todos os produtos'
    : isOfertas ? 'Todas as ofertas'
    : (activeCat?.name ?? catSlug)

  return (
    <div className="space-y-6">
      {/* HERO — banner gigante com degradê da marca e conteúdo em destaque */}
      <section className="relative overflow-hidden rounded-3xl">
        {settings.banner_url && (
          <img src={settings.banner_url} alt="" className="h-56 w-full object-cover sm:h-72 md:h-96" />
        )}
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

      {/* EXPLORAR — dropdown (padrão: Mais vendidos) */}
      <ExploreMenu
        label={currentLabel}
        onSelect={selectFilter}
        current={catSlug}
        categories={categories}
        searching={isSearch}
      />

      <div id="produtos" className="flex flex-wrap items-center justify-between gap-2 scroll-mt-24">
        <h3 className="text-lg font-bold text-gray-800">
          {currentLabel}
          {bestFallback && <span className="ml-2 text-sm font-normal text-gray-400">· destaques da loja</span>}
          {isBest && !bestFallback && <span className="ml-2 text-sm font-normal text-gray-400">· top {products.length}</span>}
          {q && <span className="ml-2 text-sm font-normal text-gray-500">· busca: “{q}”</span>}
        </h3>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-400 sm:inline">{totalCount} produto(s)</span>
          {/* ordenação não faz sentido no ranking de vendos */}
          {!isBest && (
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
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : loadError ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <p className="font-medium text-gray-700">Não foi possível carregar os produtos</p>
          <p className="text-sm">{loadError}</p>
          <button type="button" className="btn-soft mt-1" onClick={() => fetchProducts(0, false)}>
            Tentar de novo
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <SearchX className="h-8 w-8 text-gray-300" />
          <p className="font-medium">Nenhum produto encontrado</p>
          <p className="text-sm">Tente outra busca ou escolha outro filtro no Explorar.</p>
        </div>
      ) : isMenu && productsByCategory ? (
        /* ===== LAYOUT CARDÁPIO: produtos agrupados por categoria ===== */
        <div className="space-y-6">
          {[...productsByCategory.entries()].map(([cat, items]) => (
            <section key={cat.id} id={'cat-' + cat.slug} className="scroll-mt-24">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-500">
                {cat.name}
                <span className="text-xs font-normal normal-case text-gray-400">({items.length})</span>
              </h3>
              <div className="space-y-2">
                {items.map((p) => <MenuProductRow key={p.id} product={p} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <>
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

// ============ DROPDOWN "EXPLORAR" ============
// Mais vendidos (padrão) · Todos os produtos · CATEGORIAS (lista) · Ofertas.
// Fora-clique e ESC fecham; foco volta ao botão que abriu.
function ExploreMenu({ label, current, categories, onSelect, searching }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(value) {
    setOpen(false)
    onSelect(value)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" ref={wrapRef}>
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Explorar</h2>
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex min-h-11 w-full min-w-[13rem] items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-gray-800 shadow-sm ring-1 ring-gray-200 transition hover:ring-primary/40 sm:w-auto"
        >
          <span className="flex min-w-0 items-center gap-2">
            {current === '' && !searching && <Flame className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate">{searching ? 'Resultados da busca' : label}</span>
          </span>
          <ChevronDown className={'h-4 w-4 shrink-0 text-gray-400 transition ' + (open ? 'rotate-180' : '')} />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Explorar produtos"
            className="toast-in absolute right-0 z-40 mt-2 max-h-[70dvh] w-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-gray-200"
          >
            <MenuItem icon={Flame} label="Mais vendidos" desc="Os preferidos da loja" active={current === '' && !searching} onClick={() => pick('')} />
            <MenuItem icon={Package} label="Todos os produtos" active={current === 'todas'} onClick={() => pick('todas')} />

            <p className="mt-1 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Categorias
            </p>
            {categories.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Nenhuma categoria cadastrada.</p>
            )}
            {categories.map((c) => (
              <MenuItem key={c.id} icon={ChevronRight} label={c.name} active={current === c.slug} onClick={() => pick(c.slug)} />
            ))}

            <div className="my-1.5 h-px bg-gray-100" role="presentation" />
            <MenuItem icon={Tag} label="Todas as ofertas" desc="Promoções no ar" active={current === 'ofertas'} onClick={() => pick('ofertas')} />
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, desc, active, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ' +
        (active ? 'bg-primary/10 font-bold text-primary' : 'font-medium text-gray-700 hover:bg-gray-50')}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {desc && <span className="shrink-0 text-[11px] text-gray-400">{desc}</span>}
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
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
