import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { maskCep, maskPhone } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

const FIELDS = [
  ['full_name', 'Nome completo', 'text', 'sm:col-span-2'],
  ['phone', 'Telefone / WhatsApp', 'tel', ''],
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

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? '',
        phone: profile.phone ?? '',
        street: profile.street ?? '',
        number: profile.number ?? '',
        complement: profile.complement ?? '',
        district: profile.district ?? '',
        city: profile.city ?? '',
        state: profile.state ?? '',
        zip: profile.zip ?? '',
      })
    }
  }, [profile])

  if (!form) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('profiles').update(form).eq('id', user.id)
    if (error) setMsg({ type: 'err', text: 'Erro ao salvar: ' + error.message })
    else {
      setMsg({ type: 'ok', text: 'Dados salvos com sucesso!' })
      await refreshProfile(user.id)
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Meu perfil</h1>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      <form onSubmit={handleSave} className="card grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label, type, cls]) => (
          <div key={key} className={cls}>
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <input
              className={'input ' + (key === 'state' ? 'uppercase ' : '')}
              type={type}
              inputMode={key === 'phone' ? 'tel' : key === 'zip' ? 'numeric' : undefined}
              maxLength={key === 'state' ? 2 : key === 'phone' ? 15 : undefined}
              value={form[key]}
              onChange={(e) =>
                set(key, key === 'phone'
                  ? maskPhone(e.target.value)
                  : key === 'zip'
                    ? maskCep(e.target.value)
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
