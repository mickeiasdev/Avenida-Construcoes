import { describe, expect, it } from 'vitest'
import {
  effectivePrice, hasActivePromo, promoPercent, formatBRL,
  slugify, onlyDigits, waNumber, maskCep, maskPhone,
} from '../utils'

describe('preço efetivo (effectivePrice)', () => {
  const base = { price: 100, discount_percent: 0 }

  it('sem promoção e sem desconto: preço cheio', () => {
    expect(effectivePrice({ ...base })).toBe(100)
  })

  it('desconto percentual simples: 10% de 100 = 90', () => {
    expect(effectivePrice({ ...base, discount_percent: 10 })).toBe(90)
  })

  it('desconto limitado a 95% nunca dá zero por erro de digitação do lojista', () => {
    expect(effectivePrice({ price: 100, discount_percent: 95 })).toBe(5)
  })

  it('arredonda para 2 casas (89.991 vira 89.99)', () => {
    expect(effectivePrice({ price: 99.99, discount_percent: 10 })).toBe(89.99)
  })

  it('promoção ATIVA tem prioridade sobre o desconto comum', () => {
    const amanha = new Date(Date.now() + 86400000).toISOString()
    expect(effectivePrice({ ...base, discount_percent: 50, promo_price: 70, promo_until: amanha })).toBe(70)
  })

  it('promoção VENCIDA é ignorada — vale o desconto comum', () => {
    const ontem = new Date(Date.now() - 86400000).toISOString()
    expect(effectivePrice({ ...base, discount_percent: 50, promo_price: 70, promo_until: ontem })).toBe(50)
  })

  it('promoção sem prazo não vale (as duas datas são obrigatórias)', () => {
    expect(effectivePrice({ ...base, promo_price: 70 })).toBe(100)
  })

  it('produto sem preço não explode', () => {
    expect(effectivePrice(null)).toBe(0)
    expect(effectivePrice({})).toBe(0)
  })
})

describe('hasActivePromo', () => {
  it('vale só com preço E prazo futuro', () => {
    const futuro = new Date(Date.now() + 3600000).toISOString()
    expect(hasActivePromo({ promo_price: 10, promo_until: futuro })).toBe(true)
    expect(hasActivePromo({ promo_price: 10, promo_until: '2020-01-01' })).toBe(false)
    expect(hasActivePromo({ promo_until: futuro })).toBe(false)
    expect(hasActivePromo(null)).toBe(false)
  })
})

describe('promoPercent', () => {
  it('calcula o % da promo sobre o preço base, inteiro', () => {
    const futuro = new Date(Date.now() + 3600000).toISOString()
    expect(promoPercent({ price: 200, promo_price: 100, promo_until: futuro })).toBe(50)
    expect(promoPercent({ price: 100, promo_price: 97, promo_until: futuro })).toBe(3)
  })
  it('promo mais caro que o base devolve 0 (não exibe -X% mentiroso)', () => {
    const futuro = new Date(Date.now() + 3600000).toISOString()
    expect(promoPercent({ price: 50, promo_price: 100, promo_until: futuro })).toBe(0)
  })
})

describe('formatação e máscaras', () => {
  it('formatBRL em real brasileiro (Intl usa espaço inseparável)', () => {
    const brl = (v) => formatBRL(v).replace(/\u00A0/g, ' ')
    expect(brl(10)).toBe('R$ 10,00')
    expect(brl(0.01)).toBe('R$ 0,01')
    expect(brl(null)).toBe('R$ 0,00')
  })
  it('slugify tira acentos e espaços', () => {
    expect(slugify('Tijolos e Blocos')).toBe('tijolos-e-blocos')
    expect(slugify('Água & Sabão!')).toBe('agua-sabao')
  })
  it('onlyDigits limpa não-numéricos', () => {
    expect(onlyDigits('(85) 99999-9999')).toBe('85999999999')
  })
  it('waNumber garante o 55 do Brasil', () => {
    expect(waNumber('85999999999')).toBe('5585999999999')
    expect(waNumber('558599999999')).toBe('558599999999')
    expect(waNumber('')).toBe('')
  })
  it('maskCep formata 8 dígitos', () => {
    expect(maskCep('60000000')).toBe('60000-000')
    expect(maskCep('60')).toBe('60')
  })
  it('maskPhone formata DDD + número', () => {
    expect(maskPhone('85999999999')).toBe('(85) 99999-9999')
  })
})
