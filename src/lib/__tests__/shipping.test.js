import { describe, expect, it } from 'vitest'
import { feeFromCepRanges } from '../shipping'

const ranges = [
  { label: 'Centro', cep_start: '60000000', cep_end: '60499999', fee: 5, eta: 'hoje', active: true },
  { label: 'Interior', cep_start: '61000000', cep_end: '62999999', fee: 15, eta: '3 dias', active: true },
]

describe('frete por faixa de CEP (feeFromCepRanges)', () => {
  it('encontra a faixa e devolve a taxa', () => {
    expect(feeFromCepRanges(ranges, '60123456')).toEqual({ label: 'Centro', fee: 5, eta: 'hoje' })
    expect(feeFromCepRanges(ranges, '61850-000')).toEqual({ label: 'Interior', fee: 15, eta: '3 dias' })
  })

  it('entre faixas SOBREPOSTAS escolhe a mais BARATA (a menor taxa vence)', () => {
    const overlap = [
      ...ranges,
      { label: 'Promo região', cep_start: '60100000', cep_end: '60200000', fee: 2, active: true },
    ]
    expect(feeFromCepRanges(overlap, '60150000')?.fee).toBe(2)
  })

  it('CEP fora de todas as faixas devolve null (vira Melhor Envio)', () => {
    expect(feeFromCepRanges(ranges, '70000000')).toBeNull()
  })

  it('faixa inativa é ignorada mesmo com CEP dentro', () => {
    const r = [{ label: 'X', cep_start: '60000000', cep_end: '60999999', fee: 9, active: false }]
    expect(feeFromCepRanges(r, '60500000')).toBeNull()
  })

  it('CEP incomum (menos de 8 dígitos) não devolve taxa', () => {
    expect(feeFromCepRanges(ranges, '600')).toBeNull()
    expect(feeFromCepRanges(ranges, '')).toBeNull()
    expect(feeFromCepRanges(ranges, null)).toBeNull()
  })

  it('sem faixas cadastradas: null (frete por zona assume)', () => {
    expect(feeFromCepRanges([], '60000000')).toBeNull()
    expect(feeFromCepRanges(undefined, '60000000')).toBeNull()
  })

  it('faixa grátis (fee 0) devolve 0, não null', () => {
    const r = [{ label: 'Grátis', cep_start: '60000000', cep_end: '60999999', fee: 0, active: true }]
    expect(feeFromCepRanges(r, '60100000')?.fee).toBe(0)
  })
})
