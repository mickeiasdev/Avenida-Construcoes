import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { bookableDays, humanDayLabel, humanHourLabel, slotsForDate } from '../lib/booking'

// SELETOR DE HORÁRIO — usado no agendamento de serviços e na retirada
// com hora marcada. Gera os slots a partir do funcionamento da loja e
// remove os horários que já têm pedido agendado.
//   title      → rótulo do bloco ("Escolha o horário do serviço")
//   durationMin → duração (serviços) ou 30 (retirada)
//   productId   → null na retirada (considera TODOS os agendamentos)
//   value/onChange → ISO do slot escolhido
export function BookingSlotPicker({ settings, title, durationMin = 30, productId = null, value, onChange, compact = false }) {
  const days = useMemo(() => bookableDays(settings), [settings])
  const [day, setDay] = useState(0)
  const [taken, setTaken] = useState(null)

  const date = days[day] ?? days[0]
  const dayKey = date ? date.toDateString() : null

  // horários ocupados: pedidos agendados no dia (do serviço OU de qualquer
  // origem na retirada — um horário só atende um cliente por vez, v1)
  useEffect(() => {
    if (!dayKey) return undefined
    const from = new Date(dayKey + 'T00:00:00')
    const to = new Date(from.getTime() + 24 * 3600 * 1000)
    const q = supabase
      .from('orders')
      .select('scheduled_at, order_items(product_id)')
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', from.toISOString())
      .lt('scheduled_at', to.toISOString())
    let cancelled = false
    q.then(({ data }) => {
      if (cancelled) return
      const list = (data ?? [])
        .filter((o) => productId == null || (o.order_items ?? []).some((it) => it.product_id === productId))
        .map((o) => o.scheduled_at)
      setTaken(list)
    }, () => { if (!cancelled) setTaken([]) })
    return () => { cancelled = true }
  }, [dayKey, productId])

  const slots = useMemo(
    () => (date && taken ? slotsForDate(settings, date, durationMin, taken) : []),
    [settings, date, durationMin, taken],
  )

  if (!date) return null

  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
        <CalendarDays className="h-3.5 w-3.5" /> {title ?? 'Escolha o horário'}
      </p>

      {/* dias (próximos 14 abertos) */}
      <div className={compact ? 'flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex flex-wrap gap-1.5'}>
        {days.map((d, i) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => setDay(i)}
            className={
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ring-1 transition ' +
              (i === day ? 'bg-primary text-white ring-primary shadow-sm' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')
            }
          >
            {humanDayLabel(d)}
          </button>
        ))}
      </div>

      {/* horários */}
      <div className="rounded-xl bg-gray-50 p-2.5 ring-1 ring-gray-100">
        {taken === null ? (
          <p className="flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> carregando horários…
          </p>
        ) : slots.length === 0 ? (
          <p className="py-2 text-center text-sm text-gray-400">Sem horários livres neste dia — escolha outra data.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((iso) => (
              <button
                key={iso}
                type="button"
                onClick={() => onChange?.(iso)}
                aria-pressed={value === iso}
                className={
                  'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition ' +
                  (value === iso
                    ? 'bg-primary text-white ring-primary shadow-sm'
                    : 'bg-white text-gray-700 ring-gray-200 hover:ring-primary/40')
                }
              >
                <Clock className="h-3 w-3 opacity-70" />
                {humanHourLabel(iso)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
