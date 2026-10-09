import { useState } from 'react'
import { maskCep, maskPhone, onlyDigits } from '../lib/utils'
import { isFullName, isPhoneBR, isCepValid, isUF, isNumber } from '../lib/validation'

// Formulário de dados de entrega compartilhado entre o Carrinho (wizard)
// e a finalização direta da tela do produto.
// Extras: máscara de telefone/CEP e preenchimento automático do
// endereço via ViaCEP (gratuito, sem chave) ao completar o CEP.
export const EMPTY_FORM = {
  full_name: '', phone: '', street: '', number: '',
  complement: '', district: '', city: '', state: '', zip: '',
}

export const REQUIRED = ['full_name', 'phone', 'street', 'number', 'district', 'city', 'state']

export const FIELDS = [
  { key: 'full_name', label: 'Nome completo *', cls: 'col-span-2' },
  { key: 'phone', label: 'Telefone / WhatsApp *' },
  { key: 'zip', label: 'CEP *' },
  { key: 'street', label: 'Rua / Avenida *', cls: 'col-span-2' },
  { key: 'number', label: 'Número *' },
  { key: 'complement', label: 'Complemento' },
  { key: 'district', label: 'Bairro *' },
  { key: 'state', label: 'UF *' },
  { key: 'city', label: 'Cidade *', cls: 'col-span-2' },
]

const INPUT_MODE = { phone: 'tel', zip: 'numeric', number: 'numeric' }

export function fieldLabel(key) {
  return (FIELDS.find((f) => f.key === key)?.label ?? key).replace(' *', '')
}

export function profileToForm(profile) {
  return {
    ...EMPTY_FORM,
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
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
export function fieldError(key, value) {
  const v = String(value ?? '').trim()
  if (REQUIRED.includes(key) && !v) return 'Campo obrigatório'
  if (!v) return '' // opcionais vazios passam
  switch (key) {
    case 'full_name': return isFullName(v) ? '' : 'Digite nome e sobrenome'
    case 'phone':     return isPhoneBR(v)  ? '' : 'Telefone incompleto — use (11) 99999-9999'
    case 'zip':       return isCepValid(v) ? '' : 'CEP incompleto — 8 dígitos'
    case 'state':     return isUF(v)       ? '' : 'UF inválida (só 2 letras)'
    case 'number':    return isNumber(v)   ? '' : 'Número inválido'
    default:          return ''
  }
}

// Campos com erro (vazio OU formato inválido) — mesma assinatura de antes
export function missingFields(form) {
  return FIELDS.filter(({ key }) => fieldError(key, form?.[key])).map(({ key }) => key)
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

export function CheckoutForm({ form, set, missing }) {
  const [touched, setTouched] = useState({})
  const [cepLoading, setCepLoading] = useState(false)

  function showError(key) {
    return (touched[key] || missing?.includes(key)) ? fieldError(key, form?.[key]) : ''
  }

  function handleChange(key, value) {
    if (key === 'phone') { set(key, maskPhone(value)); return }
    if (key === 'zip') { set(key, maskCep(value)); return }
    if (key === 'state') { set(key, String(value).toUpperCase().slice(0, 2)); return }
    set(key, value)
  }

  // Preenche rua/bairro/cidade/UF automaticamente via ViaCEP
  async function lookupCep() {
    const cep = onlyDigits(form.zip)
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch('https://viacep.com.br/ws/' + cep + '/json/')
      const data = await res.json()
      if (data && !data.erro) {
        if (data.logradouro) set('street', data.logradouro)
        if (data.bairro) set('district', data.bairro)
        if (data.localidade) set('city', data.localidade)
        if (data.uf) set('state', String(data.uf).toUpperCase())
      }
    } catch {
      // offline ou CEP invalido — o usuario preenche manualmente
    } finally {
      setCepLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map(({ key, label, cls }) => {
        const err = showError(key)
        const errMsg = err
        return (
          <div key={key} className={cls}>
            <label
              htmlFor={'f_' + key}
              className={'mb-1 block text-xs font-medium ' + (err ? 'text-red-500' : 'text-gray-600')}
            >
              {label}
            </label>
            <input
              id={'f_' + key}
              type="text"
              inputMode={INPUT_MODE[key]}
              maxLength={key === 'state' ? 2 : key === 'phone' ? 15 : undefined}
              placeholder={key === 'zip' ? '00000-000' : key === 'phone' ? '(11) 99999-9999' : undefined}
              className={'input ' + (key === 'state' ? 'uppercase ' : '') + (err ? 'border-red-400 ring-2 ring-red-100' : '')}
              value={form[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              onBlur={() => {
                setTouched((t) => ({ ...t, [key]: true }))
                if (key === 'zip') lookupCep()
              }}
              autoComplete="off"
            />
            {err && <p className="mt-1 text-[11px] font-medium text-red-500">{errMsg}</p>}
            {key === 'zip' && cepLoading && (
              <p className="mt-1 text-[11px] font-medium text-primary">Buscando endereço…</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
