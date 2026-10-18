import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle2, AlertCircle, MailWarning, Send } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { maskCep, maskPhone, onlyDigits } from '../lib/utils'
import { maskCpf } from '../lib/checkout'
import { isCepValid, isCpf, isFullName, isPhoneBR, isUF } from '../lib/validation'
import { useAuth } from '../context/AuthContext'

const FIELDS = [
  ['full_name', 'Nome completo', 'text', 'sm:col-span-2'],
  ['phone', 'Telefone / WhatsApp', 'tel', ''],
  ['cpf', 'CPF', 'text', ''],
  ['zip', 'CEP', 'text', ''],
  ['street', 'Rua / Avenida', 'text', 'sm:col-span-2'],
  ['number', 'Número', 'text', ''],
  ['complement', 'Complemento', 'text', ''],
  ['district', 'Bairro', 'text', ''],
  ['city', 'Cidade', 'text', ''],
  ['state', 'UF', 'text', ''],
]

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [resendBusy, setResendBusy] = useState(false)
  const [resendMsg, setResendMsg] = useState(null)
  // confirmação de e-mail ligada: o Supabase deixa o usuário entrar, mas
  // email_confirmed_at/confirmed_at continuam vazios até clicar no link
  const emailConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at)

  useEffect(() => {
    // profile pode ser null (conta nova sem linha em profiles ainda):
    // o form abre VAZIO em vez de ficar carregando para sempre
    const p = profile ?? {}
    setForm({
      full_name: p.full_name ?? '',
      phone: p.phone ?? '',
      // CPF volta a aparecer preenchido (antes o campo existia mas nunca
      // carregava — parecia que o sistema "não salvava" o CPF)
      cpf: p.cpf ? maskCpf(p.cpf) : '',
      street: p.street ?? '',
      number: p.number ?? '',
      complement: p.complement ?? '',
      district: p.district ?? '',
      city: p.city ?? '',
      state: p.state ?? '',
      zip: p.zip ?? '',
    })
  }, [profile])

  if (!form) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)

    // validações de formato
    if (!isFullName(form.full_name)) {
      setMsg({ type: 'err', text: 'Digite seu nome completo (nome + sobrenome).' })
      setBusy(false); return
    }
    if (form.phone && !isPhoneBR(form.phone)) {
      setMsg({ type: 'err', text: 'Telefone incompleto — use o formato (11) 99999-9999.' })
      setBusy(false); return
    }
    if (form.zip && !isCepValid(form.zip)) {
      setMsg({ type: 'err', text: 'CEP incompleto — deve ter 8 dígitos.' })
      setBusy(false); return
    }
    if (form.cpf && !isCpf(form.cpf)) {
      setMsg({ type: 'err', text: 'CPF inválido — confira os 11 dígitos.' })
      setBusy(false); return
    }
    if (form.state && !isUF(form.state)) {
      setMsg({ type: 'err', text: 'UF inválida — use 2 letras (ex.: SP).' })
      setBusy(false); return
    }

    // CPF gravado em DÍGITOS (formato único — o checkout compara os dígitos)
    const payload = { ...form, cpf: onlyDigits(form.cpf) || null }
    const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
    if (error) setMsg({
      type: 'err',
      text: error.code === '23505' || /profiles_cpf_unique|duplicate key/i.test(error.message)
        ? 'Este CPF já está cadastrado em outra conta. Confira o número ou fale com a loja.'
        : 'Erro ao salvar: ' + error.message,
    })
    else {
      setMsg({ type: 'ok', text: 'Dados salvos com sucesso!' })
      await refreshProfile(user.id)
    }
    setBusy(false)
  }

  async function handleResendConfirmation() {
    setResendBusy(true)
    setResendMsg(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
    setResendMsg(error
      ? { type: 'err', text: 'Não foi possível reenviar: ' + error.message }
      : { type: 'ok', text: 'Link reenviado! Confira sua caixa de entrada (e o spam).' })
    setResendBusy(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Meu perfil</h1>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      {!emailConfirmed && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-start">
          <MailWarning className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold text-gray-800">Confirme seu e-mail</p>
            <p className="text-sm text-gray-500">
              Enviamos um link de confirmação para <b className="text-gray-700">{user.email}</b>.
              Você já pode usar a loja normalmente — confirmar só garante a recuperação da conta.
            </p>
            {resendMsg && (
              <p className={'text-xs font-medium ' + (resendMsg.type === 'err' ? 'text-red-600' : 'text-green-700')}>
                {resendMsg.text}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-soft min-h-11 shrink-0"
            onClick={handleResendConfirmation}
            disabled={resendBusy}
          >
            {resendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Reenviar e-mail
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="card grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label, type, cls]) => (
          <div key={key} className={cls}>
            <label htmlFor={'f_' + key} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <input
              id={'f_' + key}
              className={'input ' + (key === 'state' ? 'uppercase ' : '')}
              type={type}
              inputMode={key === 'phone' ? 'tel' : ['zip', 'cpf'].includes(key) ? 'numeric' : undefined}
              maxLength={key === 'state' ? 2 : key === 'phone' ? 15 : key === 'cpf' ? 14 : undefined}
              value={form[key]}
              onChange={(e) =>
                set(key, key === 'phone'
                  ? maskPhone(e.target.value)
                  : key === 'zip'
                    ? maskCep(e.target.value)
                    : key === 'cpf'
                      ? maskCpf(e.target.value)
                      : key === 'state'
                        ? e.target.value.toUpperCase()
                        : e.target.value)
              }
            />
          </div>
        ))}

        {msg && (
          <div className={'flex items-start gap-2 rounded-lg p-3 text-sm sm:col-span-2 ' +
            (msg.type === 'ok' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
            {msg.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="flex justify-end sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar dados
          </button>
        </div>
      </form>
    </div>
  )
}
