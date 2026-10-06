import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

// Autenticação — 100% gratuita via Supabase Auth:
//  - Magic Link por e-mail (sem senha)
//  - E-mail + senha (útil para os usuários de teste criados no painel)
//  - Redefinição de senha por e-mail
// (OTP via WhatsApp foi removido: exigiria provedor pago)
export default function Login() {
  const { signInWithMagicLink, signInWithPassword, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [tab, setTab] = useState('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function handleResetPassword() {
    if (!email) {
      setMsg({ type: 'err', text: 'Digite seu e-mail acima para receber o link de redefinição.' })
      return
    }
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      emailRedirectTo: window.location.origin,
    })
    setMsg(error
      ? { type: 'err', text: error.message }
      : { type: 'ok', text: 'Link de redefinição de senha enviado! Confira seu e-mail (e o spam).' })
    setBusy(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (tab === 'magic') {
        const { error } = await signInWithMagicLink(email)
        setMsg(error
          ? { type: 'err', text: error.message }
          : { type: 'ok', text: 'Magic Link enviado! Confira sua caixa de entrada (e o spam).' })
      } else {
        const { error } = isSignup
          ? await signUp(email, password, fullName)
          : await signInWithPassword(email, password)
        if (error) {
          setMsg({ type: 'err', text: error.message })
        } else if (isSignup) {
          setMsg({ type: 'ok', text: 'Conta criada! Se a confirmação de e-mail estiver ativa no Supabase, verifique seu e-mail antes de entrar.' })
        } else {
          navigate(redirectTo, { replace: true })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const TABS = [
    { id: 'magic', label: 'Magic Link', icon: Mail },
    { id: 'password', label: 'E-mail e Senha', icon: KeyRound },
  ]

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">Entrar</h1>
        <p className="text-sm text-gray-500">Acesse sua conta para acompanhar pedidos e finalizar compras.</p>
      </div>

      <div className="flex overflow-hidden rounded-xl bg-white text-sm shadow-sm ring-1 ring-gray-100">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); setMsg(null) }}
            className={'flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 transition ' +
              (tab === id ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            <Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card space-y-3">
        {tab === 'magic' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
            <p className="mt-2 text-xs text-gray-400">
              Enviaremos um link de acesso sem senha — gratuito via Supabase Auth.
            </p>
          </div>
        )}

        {tab === 'password' && (
          <>
            {isSignup && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome completo</label>
                <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
              <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </>
        )}

        {msg && (
          <div className={'flex items-start gap-2 rounded-lg p-3 text-sm ' +
            (msg.type === 'ok' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
            {msg.type === 'ok'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === 'magic' ? 'Enviar Magic Link' : isSignup ? 'Criar conta' : 'Entrar'}
        </button>

        {tab === 'password' && (
          <>
            <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={() => { setIsSignup((v) => !v); setMsg(null) }}>
              {isSignup ? 'Já tenho conta — fazer login' : 'Não tenho conta — criar agora'}
            </button>
            {!isSignup && (
              <button type="button" className="text-xs text-gray-400 transition hover:text-primary" onClick={handleResetPassword}>
                Esqueci minha senha
              </button>
            )}
          </>
        )}
      </form>
    </div>
  )
}
