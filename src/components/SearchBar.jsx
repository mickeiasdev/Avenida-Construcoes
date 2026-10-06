import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

// Barra de pesquisa global com DEBOUNCE (400ms):
// só dispara a busca depois que o usuário para de digitar
export function SearchBar({ value, onChange, placeholder, delay = 400 }) {
  const [internal, setInternal] = useState(value ?? '')
  const timer = useRef(null)

  useEffect(() => { setInternal(value ?? '') }, [value])

  function handleChange(e) {
    const v = e.target.value
    setInternal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), delay)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className="input pl-10"
        type="search"
        value={internal}
        onChange={handleChange}
        placeholder={placeholder ?? 'Buscar produtos...'}
      />
    </div>
  )
}
