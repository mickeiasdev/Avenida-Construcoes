import { onlyDigits } from './utils'
import { isFullName, isPhoneBR, isCpf, isCepValid, isUF, isNumber } from './validation'

// ============================================================
// Dados de entrega: constantes e validação compartilhadas pelo
// CheckoutForm (componente) e pelo Carrinho / tela do produto.
// Ficam fora do componente para o Fast Refresh funcionar de verdade
// (arquivo que exporta componente E outras coisas perde o HMR).
// ============================================================

export const EMPTY_FORM = {
  full_name: '', phone: '', cpf: '', street: '', number: '',
  complement: '', district: '', city: '', state: '', zip: '',
  // "pedido em nome de outra pessoa/obra" (só aparece no checkout de entrega)
  on_behalf_of: '', site_note: '',
}

export const REQUIRED = ['full_name', 'phone', 'cpf', 'zip', 'street', 'number', 'district', 'city', 'state']

// Retirada no balcão dispensa endereço: só quem retira precisa se identificar
export const RETIRADA_REQUIRED = ['full_name', 'phone']

// Campos exigidos conforme o modo de recebimento escolhido
export function requiredFieldsFor(deliveryMethod) {
  return deliveryMethod === 'retirada' ? RETIRADA_REQUIRED : REQUIRED
}

// Máscara de CPF enquanto digita: 000.000.000-00 (só dígitos, máx. 11)
export function maskCpf(value) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3)
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6)
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9)
}

export const FIELDS = [
  { key: 'full_name', label: 'Nome completo *', cls: 'col-span-2' },
  { key: 'phone', label: 'Telefone / WhatsApp *' },
  { key: 'cpf', label: 'CPF *' },
  { key: 'zip', label: 'CEP *' },
  { key: 'street', label: 'Rua / Avenida *', cls: 'col-span-2' },
  { key: 'number', label: 'Número *' },
  { key: 'complement', label: 'Complemento' },
  { key: 'district', label: 'Bairro *' },
  { key: 'state', label: 'UF *' },
  { key: 'city', label: 'Cidade *', cls: 'col-span-2' },
]

// Nome e telefone têm campos próprios no PDV; o endereço reaproveita o
// CheckoutForm inteiro só quando há item para entrega. CPF é do checkout de
// ENTREGA do site (não da venda de balcão), então fica fora do PDV.
export const ADDRESS_FIELDS = FIELDS.filter((f) => !['full_name', 'phone', 'cpf'].includes(f.key))
export const ADDRESS_KEYS = REQUIRED.filter((k) => !['full_name', 'phone', 'cpf'].includes(k))

export function fieldLabel(key) {
  return (FIELDS.find((f) => f.key === key)?.label ?? key).replace(' *', '')
}

export function profileToForm(profile) {
  return {
    ...EMPTY_FORM,
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    cpf: profile?.cpf ?? '',
    street: profile?.street ?? '',
    number: profile?.number ?? '',
    complement: profile?.complement ?? '',
    district: profile?.district ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    zip: profile?.zip ?? '',
  }
}

// Mensagem de erro específica por campo — '' se estiver ok
export function fieldError(key, value, required = REQUIRED) {
  const v = String(value ?? '').trim()
  if (required.includes(key) && !v) return 'Campo obrigatório'
  if (!v) return '' // opcionais vazios passam
  switch (key) {
    case 'full_name': return isFullName(v) ? '' : 'Digite nome e sobrenome'
    case 'phone':     return isPhoneBR(v)  ? '' : 'Telefone incompleto — use (11) 99999-9999'
    case 'cpf':       return isCpf(v)      ? '' : 'CPF inválido — confira os 11 dígitos'
    case 'zip':       return isCepValid(v) ? '' : 'CEP incompleto — 8 dígitos'
    case 'state':     return isUF(v)       ? '' : 'UF inválida (só 2 letras)'
    case 'number':    return isNumber(v)   ? '' : 'Número inválido'
    default:          return ''
  }
}

// Campos com erro (vazio OU formato inválido). `keys` permite validar apenas
// o subconjunto exigido pelo modo escolhido (ex.: RETIRADA_REQUIRED).
export function missingFields(form, keys = REQUIRED) {
  return keys.filter((key) => fieldError(key, form?.[key], keys))
}

// Endereço formatado em uma linha (usado na revisão do pedido)
export function formatAddress(form) {
  const parts = []
  parts.push((form.street || '') + ((form.street && form.number) ? ', ' + form.number : (form.number || '')))
  if (form.complement) parts.push(form.complement)
  if (form.district) parts.push(form.district)
  if (form.city) parts.push(form.city + (form.state ? '/' + form.state : ''))
  if (form.zip) parts.push('CEP ' + form.zip)
  return parts.filter(Boolean).join(', ')
}
