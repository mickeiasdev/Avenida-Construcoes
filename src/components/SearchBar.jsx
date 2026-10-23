import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { effectivePrice, formatBRL } from '../lib/utils'
import { thumb } from '../lib/imageUrl'

// Barra de pesquisa global com DEBOUNCE (400ms) + SUGESTÕES instantâneas:
// enquanto digita, um dropdown mostra até 5 produtos (nome + preço) e o
// clique vai direto para a página do produto — quem sabe o que quer não
// precisa esperar a lista filtrada carregar.
export function SearchBar({ value, onChange, placeholder, delay = 400 }) {
  const [internal, setInternal] = useState(value ?? '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const sugTimer = useRef(null)
  const wrapRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { setInternal(value ?? '') }, [value])

  // fecha o dropdown ao clicar fora
  useEffect(() => {
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (sugTimer.current) clearTimeout(sugTimer.current)
  }, [])

  function handleChange(e) {
    const v = e.target.value
    setInternal(v)
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), delay)

    // sugestões: 2+ caracteres, busca com o próprio debounce (mais curto)
    if (sugTimer.current) clearTimeout(sugTimer.current)
    if (v.trim().length < 2) { setSuggestions([]); return }
    sugTimer.current = setTimeout(async () => {
      const safe = v.trim().replace(/[%(),]/g, '')
      if (!safe) return
      const { data } = await supabase
        .from('products')
        .select('id, name, price, discount_percent, promo_price, promo_until, image_url')
        .eq('active', true)
        .ilike('name', '%' + safe + '%')
        .limit(5)
      setSuggestions(data ?? [])
    }, 250)
  }

  function pick(id) {
    setOpen(false)
    setSuggestions([])
    navigate('/produto/' + id)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' && open && suggestions.length > 0 && !e.defaultPrevented) {
      // com sugestões na tela, Enter vai para o primeiro produto
      // (o debounce do filtro continua se o usuário não quiser clicar)
      if (e.target.tagName === 'INPUT') {
        e.preventDefault()
        pick(suggestions[0].id)
      }
    }
  }

  return (
    <div className="relative w-full" ref={wrapRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        className="input pl-10"
        type="search"
        value={internal}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder ?? 'Buscar produtos...'}
        aria-label={placeholder ?? 'Buscar produtos'}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        aria-controls="search-suggestions"
      />

      {open && suggestions.length > 0 && (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label="Sugestões de produtos"
          className="toast-in absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-gray-200"
        >
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(p.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-gray-50"
            >
              {p.image_url ? (
                <img src={thumb(p.image_url, 80)} alt="" className="h-9 w-9 shrink-0 rounded-md bg-gray-100 object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-md bg-gray-100" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{p.name}</span>
              <span className="shrink-0 text-sm font-bold text-primary">{formatBRL(effectivePrice(p))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
