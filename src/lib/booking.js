// AGENDAMENTO — geração de horários a partir do funcionamento da loja
// (store_settings já tem weekday/sat/sun) + duração do serviço.
// Slots de 30 min; horários já agendados são removidos da lista.

const pad = (n) => String(n).padStart(2, '0')

// Abre/fecha da data informada (null = fechado)
export function hoursForDate(settings, date) {
  const day = date.getDay()
  if (day === 0) {
    if (settings.sun_closed) return null
    return settings.sun_open && settings.sun_close
      ? [settings.sun_open.slice(0, 5), settings.sun_close.slice(0, 5)]
      : null
  }
  if (day === 6) {
    return [String(settings.sat_open ?? '08:00').slice(0, 5), String(settings.sat_close ?? '18:00').slice(0, 5)]
  }
  return [String(settings.weekday_open ?? '08:00').slice(0, 5), String(settings.weekday_close ?? '18:00').slice(0, 5)]
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

// Datas agendáveis: hoje (daqui a 1h) até 13 dias à frente, só dias abertos
export function bookableDays(settings, count = 14) {
  const days = []
  const today = new Date()
  for (let i = 0; i < count && days.length < 14; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (!hoursForDate(settings, d)) continue
    days.push(d)
  }
  return days
}

// Slots (ISO local) do dia; taken = array de ISO já agendados
export function slotsForDate(settings, date, durationMin, takenISOs = []) {
  const hours = hoursForDate(settings, date)
  if (!hours) return []
  const dur = Math.max(15, durationMin || 30)
  const step = 30
  const [start, end] = hours.map(toMinutes)
  const minStart = date.getTime() + 60 * 60 * 1000 // 1h de antecedência
  const out = []
  for (let m = start; m + dur <= end; m += step) {
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(m / 60), m % 60)
    if (slot.getTime() < minStart) continue
    const iso = localISO(slot)
    if (takenISOs.some((t) => Math.abs(new Date(t).getTime() - slot.getTime()) < step * 60 * 1000)) continue
    out.push(iso)
  }
  return out
}

// 'YYYY-MM-DDTHH:mm' no fuso LOCAL (sem Z: o banco é timestamptz e o
// Postgres interpreta no fuso do projeto; Brasil = -03)
export function localISO(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':00'
}

export function humanDayLabel(date) {
  const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  return isToday ? 'hoje' : weekdays[date.getDay()] + ' ' + pad(date.getDate()) + '/' + pad(date.getMonth() + 1)
}

export function humanHourLabel(iso) {
  const d = new Date(iso)
  return pad(d.getHours()) + 'h' + pad(d.getMinutes())
}
