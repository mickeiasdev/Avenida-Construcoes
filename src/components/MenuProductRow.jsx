import { useRef } from 'react'
import { Minus, Plus } from 'lucide-react'
import { effectivePrice, formatBRL, hasActivePromo } from '../lib/utils'
import { thumb } from '../lib/imageUrl'
import { useCart } from '../context/CartContext'
import { useConfirmDialog } from './ConfirmDialog'

// Linha de produto estilo CARDÁPIO (restaurante/menu delivery):
// foto + nome + descrição + preço à esquerda; STEPPER de quantidade à direita.
//
// • Fora da sacola: botão "+" adiciona 1 (com trava de 350ms — clique em
//   rajada não empilha itens sem o usuário ver);
// • Na sacola: vira "- 1 +" — o número reflete a sacola AO VIVO;
// • "-" na última unidade pede CONFIRMAÇÃO antes de remover;
// • Clique na foto/nome abre o modal de amostragem (onOpen).
export function MenuProductRow({ product, onOpen }) {
  const { items, addItem, updateQuantity, removeItem } = useCart()
  const confirm = useConfirmDialog()
  const lastAddRef = useRef(0)

  const inCart = items.find((i) => i.product_id === product.id)
  const qty = inCart?.quantity ?? 0
  const price = effectivePrice(product)
  const promo = hasActivePromo(product)
  const soldOut = product.stock != null && Number(product.stock) <= 0
  const maxQty = product.stock != null ? Math.max(1, Number(product.stock)) : 999

  // "+" com trava de 350ms: a rajada de cliques não soma infinito
  function handleAdd() {
    if (soldOut || qty >= maxQty) return
    const now = Date.now()
    if (now - lastAddRef.current < 350) return
    lastAddRef.current = now
    if (!inCart) addItem(product)
    else updateQuantity(product.id, Math.min(maxQty, qty + 1))
  }

  // "-": da 2+ para 1 só diminui; da última unidade pergunta antes de remover
  async function handleMinus() {
    if (!inCart) return
    if (inCart.quantity > 1) {
      updateQuantity(product.id, inCart.quantity - 1)
      return
    }
    const ok = await confirm.ask({
      title: 'Remover "' + product.name + '" da sacola?',
      message: 'Este é o último item do produto na sacola.',
      confirmLabel: 'Remover',
      danger: true,
    })
    if (ok) removeItem(product.id)
  }

  // área de toque generosa: o "+" sozinho tem 44px (padrão mobile);
  // os botões do stepper ficam um pouco menores (36px) mas confortáveis
  const btnBase = 'flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40'

  return (
    <div
      className={
        'flex w-full items-center gap-3 rounded-xl bg-white p-3 ring-1 transition ' +
        (soldOut
          ? 'opacity-50 ring-gray-100'
          : 'ring-gray-100 hover:ring-primary/30')
      }
    >
      {/* área clicável: abre a amostragem do produto (modal) */}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => !soldOut && onOpen?.(product)}
        aria-label={'Ver detalhes de ' + product.name}
      >
        {product.image_url ? (
          <img
            src={thumb(product.image_url, 200)}
            alt={product.name}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-2xl">
            🍽️
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-800">{product.name}</p>
          {product.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{product.description}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-bold text-primary">{formatBRL(price)}</span>
            {promo && (
              <span className="text-xs text-gray-400 line-through">{formatBRL(Number(product.price))}</span>
            )}
            {soldOut && (
              <span className="rounded-lg bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                Esgotado
              </span>
            )}
          </div>
        </div>
      </button>

      {/* stepper: "+" sozinho fora da sacola · "- 1 +" quando já tem */}
      {!inCart ? (
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={'Adicionar ' + product.name + ' à sacola'}
          className={btnBase + ' h-11 w-11 shrink-0 bg-primary text-white shadow-md shadow-primary/25 hover:brightness-110'}
        >
          <Plus className="h-5 w-5" />
        </button>
      ) : (
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary p-1 text-white shadow-sm"
          role="group"
          aria-label={'Quantidade de ' + product.name + ' na sacola'}
        >
          <button
            type="button"
            onClick={handleMinus}
            className={btnBase + ' h-9 w-9 hover:bg-white/20'}
            aria-label="Diminuir quantidade"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-7 text-center text-sm font-bold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={qty >= maxQty}
            className={btnBase + ' h-9 w-9 hover:bg-white/20'}
            aria-label="Aumentar quantidade"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* confirmação de remoção (última unidade) */}
      {confirm.dialog}
    </div>
  )
}
