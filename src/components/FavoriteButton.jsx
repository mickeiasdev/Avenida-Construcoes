import { Heart } from 'lucide-react'
import { useFavorites } from '../context/FavoritesContext'

// Coracaozinho de favorito — funciona em cards (imagem) e na pagina do produto
export function FavoriteButton({ productId, className = '', iconClass = 'h-4 w-4', inactiveIcon = 'text-white' }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const active = isFavorite(productId)

  return (
    <button
      type="button"
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={className + ' transition active:scale-75'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFavorite(productId)
      }}
    >
      <Heart
        className={iconClass + (active ? ' fill-red-500 text-red-500' : ' ' + inactiveIcon)}
        aria-hidden="true"
      />
    </button>
  )
}
