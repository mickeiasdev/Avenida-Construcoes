import { useState } from 'react'

// Formulário de dados de entrega compartilhado entre o Carrinho e a
// finalização direta da tela do produto — mesma fonte de verdade para
// campos, obrigatórios e pré-preenchimento do perfil.
export const EMPTY_FORM = {
  full_name: '', phone: '', street: '', number: '',
  complement: '', district: '', city: '', state: '', zip: '',
}

export const REQUIRED = ['full_name', 'phone', 'street', 'number', 'district', 'city', 'state']

export const FIELDS = [
  { key: 'full_name', label: 'Nome completo *', cls: 'sm:col-span-2' },
  { key: 'phone', label: 'Telefone / WhatsApp *' },
  { key: 'zip', label: 'CEP' },
  { key: 'street', label: 'Rua / Avenida *', cls: 'sm:col-span-2' },
  { key: 'number', label: 'Número *' },
  { key: 'complement', label: 'Complemento (opcional)' },
  { key: 'district', label: 'Bairro *' },
  { key: 'city', label: 'Cidade *' },
  { key: 'state', label: 'UF *' },
]

export function fieldLabel(key) {
  return (FIELDS.find((f) => f.key === key)?.label ?? key).replace(' *', '')
}

// Carrega os dados direto do usuário; se não houver nada salvo,
// devolve o form vazio (sem forçar nada)
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

export function missingFields(form) {
  return REQUIRED.filter((k) => !String(form?.[k] ?? '').trim())
}

// Validação visível: campo obrigatório vazio fica com borda vermelha e
// mensagem "Campo obrigatório" — ao digitar, o erro sai na hora.
export function CheckoutForm({ form, set, missing }) {
  const [touched, setTouched] = useState({})

  function showError(key) {
    return REQUIRED.includes(key)
      && !String(form?.[key] ?? '').trim()
      && (touched[key] || missing?.includes(key))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map(({ key, label, cls }) => {
        const err = showError(key)
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
              className={'input ' + (err ? 'border-red-400 ring-2 ring-red-100' : '')}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
              autoComplete="off"
            />
            {err && <p className="mt-1 text-[11px] font-medium text-red-500">Campo obrigatório</p>}
          </div>
        )
      })}
    </div>
  )
}
