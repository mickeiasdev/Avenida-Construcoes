import { Truck } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { formatBRL } from '../lib/utils'

// Seletor de zona de entrega (migration-31): o cliente vê a TAXA e o PRAZO
// antes de finalizar — e o valor cobrado vem sempre da tabela no servidor.
// Sem zonas cadastradas não renderiza nada (entrega "a combinar", taxa zero).
export function DeliveryZonePicker({ value, onChange }) {
  const { zones } = useStore()
  if (!zones.length) return null
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
        <Truck className="h-3.5 w-3.5" /> Zona de entrega
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Zona de entrega">
        {zones.map((z) => {
          const active = value === z.name
          return (
            <button
              key={z.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(z.name)}
              className={'flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left ring-1 transition ' +
                (active
                  ? 'bg-primary/5 ring-2 ring-primary shadow-sm'
                  : 'bg-white ring-gray-200 hover:ring-primary/40')}
            >
              <span className={'min-w-0 truncate text-sm font-bold ' + (active ? 'text-primary' : 'text-gray-700')}>
                {z.name}
              </span>
              <span className="shrink-0 text-right">
                <span className={'block text-xs font-bold ' + (active ? 'text-primary' : 'text-gray-600')}>
                  {Number(z.fee) > 0 ? formatBRL(z.fee) : 'Grátis'}
                </span>
                {z.eta && <span className="block text-[10px] leading-tight text-gray-400">{z.eta}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {!value && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-600">
          Escolha a sua zona para calcular a taxa de entrega.
        </p>
      )}
    </div>
  )
}

// Taxa da zona escolhida (0 quando nada escolhido / zona não encontrada)
export function zoneFee(zones, name) {
  if (!name) return 0
  const z = (zones ?? []).find((x) => x.name === name)
  return z ? Math.max(0, Number(z.fee) || 0) : 0
}
