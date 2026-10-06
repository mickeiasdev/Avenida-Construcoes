import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useFavorites } from '../context/FavoritesContext'
import { ProductCard } from '../components/ProductCard'

// Lista de produtos salvos como favoritos (coração nos cards).
// Os ids ficam no LocalStorage; aqui buscamos os dados atuais no banco.
export default function Favorites() {
  const { ids } = useFavorites()
  const [products, setProducts] = useState(undefined) // undefined = carregando

  useEffect(() => {
    async function load() {
      if (ids.length === 0) {
        setProducts([])
        return
      }
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
        .in('id', ids)
      setProducts(data ?? [])
    }
    load()
  }, [ids])

  if (products === undefined) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  }

  if (products.length === 0) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center text-gray-500">
        <Heart className="h-10 w-10 text-gray-300" />
        <p className="font-medium">Nenhum favorito ainda</p>
        <p className="text-sm">Toque no coração dos produtos que você gostou para salvá-los aqui.</p>
        <Link to="/" className="btn-primary">Explorar produtos</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <Heart className="h-5 w-5 fill-red-500 text-red-500" /> Favoritos
        </h1>
        <span className="text-xs text-gray-400">{products.length} produto(s)</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  )
}
