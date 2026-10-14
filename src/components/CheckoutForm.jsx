import { Fragment, useState } from 'react'
import { HardHat } from 'lucide-react'
import { maskCep, maskPhone, onlyDigits } from '../lib/utils'
import { FIELDS, fieldError, maskCpf } from '../lib/checkout'

// Formulário de dados de entrega compartilhado entre o Carrinho (wizard)
// e a finalização direta da tela do produto.
// Extras: máscara de telefone/CPF/CEP, preenchimento automático do endereço
// via ViaCEP (gratuito, sem chave) ao completar o CEP e o bloco opcional
// "em nome de outra pessoa/obra".
// As constantes/validações puras vivem em src/lib/checkout.js.
const INPUT_MODE = { phone: 'tel', cpf: 'numeric', zip: 'numeric', number: 'numeric' }

// `fields` deixa o PDV do admin reaproveitar só o bloco de endereço
// (nome/telefone ficam em campos próprios do painel de venda). O bloco de
// "em nome de outra pessoa" só existe quando o campo full_name está na tela.
export function CheckoutForm({ form, set, missing, fields = FIELDS }) {
  const [touched, setTouched] = useState({})
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState(false)
  const [showReceiver, setShowReceiver] = useState(() => String(form?.on_behalf_of ?? '').trim() !== '')

  const canOnBehalf = fields.some((f) => f.key === 'full_name')

  function showError(key) {
    return (touched[key] || missing?.includes(key)) ? fieldError(key, form?.[key]) : ''
  }

  function handleChange(key, value) {
    if (key === 'phone') { set(key, maskPhone(value)); return }
    if (key === 'cpf') { set(key, maskCpf(value)); return }
    if (key === 'zip') { set(key, maskCep(value)); setCepError(false); return }
    if (key === 'state') { set(key, String(value).toUpperCase().slice(0, 2)); return }
    set(key, value)
  }

  function removeReceiver() {
    setShowReceiver(false)
    set('on_behalf_of', '')
    set('site_note', '')
  }

  // Preenche rua/bairro/cidade/UF automaticamente via ViaCEP. Se o CEP não
  // existir (data.erro) ou a consulta falhar, avisa e NÃO preenche nada.
  async function lookupCep() {
    const cep = onlyDigits(form?.zip)
    if (cep.length !== 8) { setCepError(false); return }
    setCepLoading(true)
    setCepError(false)
    try {
      const res = await fetch('https://viacep.com.br/ws/' + cep + '/json/')
      if (!res.ok) { setCepError(true); return }
      const data = await res.json()
      if (!data || data.erro) { setCepError(true); return }
      if (data.logradouro) set('street', data.logradouro)
      if (data.bairro) set('district', data.bairro)
      if (data.localidade) set('city', data.localidade)
      if (data.uf) set('state', String(data.uf).toUpperCase())
    } catch {
      setCepError(true) // offline ou CEP inválido — o usuário preenche manualmente
    } finally {
      setCepLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, label, cls }) => {
        const err = showError(key)
        return (
          <Fragment key={key}>
            <div className={cls}>
              <label
                htmlFor={'f_' + key}
                className={'mb-1 block text-xs font-medium ' + (err ? 'text-red-500' : 'text-gray-600')}
              >
                {label}
              </label>
              <input
                aria-invalid={!!err}
                aria-describedby={err ? 'e_' + key : undefined}
                id={'f_' + key}
                type="text"
                inputMode={INPUT_MODE[key]}
                maxLength={key === 'state' ? 2 : key === 'phone' ? 15 : key === 'cpf' ? 14 : undefined}
                placeholder={key === 'zip' ? '00000-000' : key === 'phone' ? '(11) 99999-9999' : key === 'cpf' ? '000.000.000-00' : undefined}
                className={'input ' + (key === 'state' ? 'uppercase ' : '') + (err ? 'border-red-400 ring-2 ring-red-100' : '')}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, [key]: true }))
                  if (key === 'zip') lookupCep()
                }}
                autoComplete="off"
              />
              {err && <p role="alert" id={'e_' + key} className="mt-1 text-xs font-medium text-red-600">{err}</p>}
              {key === 'zip' && cepLoading && (
                <p className="mt-1 text-[11px] font-medium text-primary">Buscando endereço…</p>
              )}
              {key === 'zip' && cepError && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600">CEP não encontrado — confira os números</p>
              )}
            </div>

            {key === 'full_name' && canOnBehalf && (
              showReceiver ? (
                <div className="col-span-2 space-y-3 rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200">
                  <div>
                    <label htmlFor="f_on_behalf_of" className="field-label">Nome de quem vai receber</label>
                    <input
                      id="f_on_behalf_of"
                      className="input"
                      placeholder="Ex.: João da Silva"
                      value={form?.on_behalf_of ?? ''}
                      onChange={(e) => set('on_behalf_of', e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="f_site_note" className="field-label">Obra / empresa (opcional)</label>
                    <input
                      id="f_site_note"
                      className="input"
                      placeholder="Ex.: Construtora X"
                      value={form?.site_note ?? ''}
                      onChange={(e) => set('site_note', e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <button type="button" className="btn-soft btn-sm min-h-11" onClick={removeReceiver}>
                    Remover
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary ring-1 ring-primary/40 transition hover:bg-primary/15 hover:ring-primary"
                  onClick={() => setShowReceiver(true)}
                >
                  <HardHat className="h-4 w-4" />
                  É para uma obra ou empresa? Toque aqui
                </button>
              )
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
