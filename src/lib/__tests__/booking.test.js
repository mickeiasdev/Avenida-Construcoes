import { describe, expect, it } from 'vitest'
import { hoursForDate, slotsForDate, bookableDays, localISO } from '../booking'

const settings = {
  weekday_open: '08:00', weekday_close: '18:00',
  sat_open: '08:00', sat_close: '12:00',
  sun_closed: true, sun_open: null, sun_close: null,
}

const umDia = (iso) => new Date(iso + 'T12:00:00')

describe('horário de funcionamento por data (hoursForDate)', () => {
  it('segunda a sexta: 08h às 18h', () => {
    expect(hoursForDate(settings, umDia('2026-10-19'))).toEqual(['08:00', '18:00']) // segunda
  })
  it('sábado: 08h às 12h', () => {
    expect(hoursForDate(settings, umDia('2026-10-24'))).toEqual(['08:00', '12:00'])
  })
  it('domingo fechado devolve null', () => {
    expect(hoursForDate(settings, umDia('2026-10-25'))).toBeNull()
  })
  it('domingo aberto quando a loja marca', () => {
    expect(hoursForDate({ ...settings, sun_closed: false, sun_open: '07:00:00', sun_close: '13:00:00' }, umDia('2026-10-25'))).toEqual(['07:00', '13:00'])
  })
})

describe('geração de slots (slotsForDate)', () => {
  it('dia de 08h-18h com serviço de 30min gera 20 slots de 30 em 30', () => {
    const slots = slotsForDate(settings, umDia('2030-10-21'), 30, [])
    expect(slots.length).toBe(20)
    expect(slots[0]).toBe('2030-10-21T08:00:00')
    expect(slots[19]).toBe('2030-10-21T17:30:00')
  })

  it('serviço de 60min não gera slot que estoura o fechamento', () => {
    const slots = slotsForDate(settings, umDia('2030-10-21'), 60, [])
    expect(slots[slots.length - 1]).toBe('2030-10-21T17:00:00') // 17h + 60min = 18h ✓
  })

  it('serviço não cabe no dia: lista vazia (8h de serviço num sábado de 4h)', () => {
    expect(slotsForDate(settings, umDia('2030-10-26'), 480, []).length).toBe(0) // sábado 08h-12h
  })

  it('horário já agendado sai da lista', () => {
    const todos = slotsForDate(settings, umDia('2030-10-21'), 30, [])
    const livres = slotsForDate(settings, umDia('2030-10-21'), 30, ['2030-10-21T09:00:00'])
    expect(livres.length).toBe(todos.length - 1)
    expect(livres).not.toContain('2030-10-21T09:00:00')
  })

  it('dia fechado (domingo) não gera slots', () => {
    expect(slotsForDate(settings, umDia('2030-10-27'), 30, [])).toEqual([])
  })

  it('HOJE só mostra horários com pelo menos 1h de antecedência', () => {
    const agora = new Date()
    const hoje = slotsForDate(settings, new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()), 30, [])
    for (const iso of hoje) {
      expect(new Date(iso).getTime()).toBeGreaterThan(Date.now() - 1000)
    }
  })
})

describe('dias agendáveis (bookableDays)', () => {
  it('pula os domingos quando a loja fecha', () => {
    const days = bookableDays(settings, 21)
    for (const d of days) {
      expect(d.getDay()).not.toBe(0)
    }
  })
})

describe('localISO', () => {
  it('formata data local sem sufixo Z (fuso do projeto)', () => {
    const d = new Date(2030, 9, 21, 14, 30) // out/2030 14h30 local
    expect(localISO(d)).toBe('2030-10-21T14:30:00')
  })
})
