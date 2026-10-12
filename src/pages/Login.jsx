import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { isEmail, isFullName, isPasswordStrong } from '../lib/validation'

// Onde retomar depois de entrar/criar conta:
//  1) location.state.from/redirect (checkout, carrinho ou ProtectedRoute);
//  2) página de origem /carrinho ou /produto/... (mesma origem);
//  3) cadastro avulso (sem pedido em andamento) volta para a home.
function isInternalPath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
}
function resolveRedirect(location) {
  const stateFrom = location.state?.from ?? location.state?.redirect
  if (isInternalPath(stateFrom)) return { to: stateFrom, inProgress: true }
  try {
    const ref = new URL(document.referrer)
    const p = ref.pathname
    if (ref.origin === window.location.origin && (p === '/carrinho' || p.startsWith('/produto/'))) {
      return { to: p, inProgress: true }
    }
  } catch { /* sem referrer utilizável: segue para a home */ }
  return { to: '/', inProgress: false }
}

// Autenticação — 100% gratuita via Supabase Auth:
//  - Magic Link por e-mail (sem senha)
//  - E-mail + senha (útil para os usuários de teste criados no painel)
//  - Redefinição de senha por e-mail
// (OTP via WhatsApp foi removido: exigiria provedor pago)
export default function Login() {
  const { signInWithMagicLink, signInWithPassword, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { to: redirectTo, inProgress } = useMemo(() => resolveRedirect(location), [location])

  const [tab, setTab] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  // o modal de checkout manda mode:'signup' ao clicar em "Criar conta grátis"
  const [isSignup, setIsSignup] = useState(location.state?.mode === 'signup')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // volta ao ponto de partida preservando o state (ex.: from=/carrinho)
  function goAfterAuth() {
    navigate(redirectTo, inProgress
      ? { replace: true, state: location.state }
      : { replace: true })
  }

  async function handleResetPassword() {
    if (!isEmail(email)) {
      setMsg({ type: 'err', text: 'Digite um e-mail válido para receber o link de redefinição.' })
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

    // validações de formato antes de chamar o Supabase
    if (!isEmail(email)) {
      setMsg({ type: 'err', text: 'Digite um e-mail válido (ex.: voce@exemplo.com).' })
      setBusy(false)
      return
    }
    if (isSignup && !isFullName(fullName)) {
      setMsg({ type: 'err', text: 'Digite seu nome completo (nome + sobrenome).' })
      setBusy(false)
      return
    }
    if (tab === 'password' && !isPasswordStrong(password)) {
      setMsg({ type: 'err', text: 'A senha precisa de pelo menos 6 caracteres.' })
      setBusy(false)
      return
    }

    try {
      if (tab === 'magic') {
        const { error } = await signInWithMagicLink(email)
        setMsg(error
          ? { type: 'err', text: error.message }
          : { type: 'ok', text: 'Link de confirmação enviado! Confira sua caixa de entrada (e o spam).' })
      } else {
        const { error, session } = isSignup
          ? await signUp(email, password, fullName)
          : await signInWithPassword(email, password)
        if (error) {
          setMsg({ type: 'err', text: error.message })
        } else if (!isSignup || session) {
          // login, ou cadastro com a confirmação de e-mail DESLIGADA:
          // já entra logado e segue direto para onde estava
          goAfterAuth()
        } else {
          // confirmação ligada: avisa sem bloquear — o pedido pode ser
          // finalizado como visitante no checkout
          setMsg({
            type: 'ok',
            text: 'Enviamos um link para confirmar seu e-mail. Você já pode continuar usando a loja.',
            continueTo: redirectTo,
            continueLabel: redirectTo === '/' ? 'Ir para a loja' : 'Continuar para onde eu estava',
          })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const TABS = [
    { id: 'password', label: 'E-mail e Senha', icon: KeyRound },
    { id: 'magic', label: 'Entrar sem senha', icon: Mail },
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
                aria-label={label}
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
            <label htmlFor="l-email-magic" className="field-label">E-mail</label>
            <input
              id="l-email-magic" className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
            <p className="mt-2 text-xs text-gray-500">
              Enviamos um link de acesso para o seu e-mail — sem senha.
            </p>
          </div>
        )}

        {tab === 'password' && (
          <>
            {isSignup && (
              <div>
                <label htmlFor="l-nome" className="field-label">Nome completo</label>
                <input id="l-nome" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              </div>
            )}
            <div>
              <label htmlFor="l-email-senha" className="field-label">E-mail</label>
              <input id="l-email-senha" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
            </div>
            <div>
              <label htmlFor="l-senha" className="field-label">Senha</label>
              <input id="l-senha" className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
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

        {msg?.continueTo && (
          <button
            type="button"
            className="btn-soft min-h-11 w-full"
            onClick={() => navigate(msg.continueTo, { replace: true })}
          >
            {msg.continueLabel}
          </button>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === 'magic' ? 'Enviar' : isSignup ? 'Criar conta' : 'Entrar'}
        </button>

        {tab === 'password' && (
          <>
            <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={() => { setIsSignup((v) => !v); setMsg(null) }}>
              {isSignup ? 'Já tenho conta — fazer login' : 'Não tenho conta — criar agora'}
            </button>
            {!isSignup && (
              <button type="button" className="text-xs text-gray-500 transition hover:text-primary" onClick={handleResetPassword}>
                Esqueci minha senha
              </button>
            )}
          </>
        )}
      </form>
    </div>
  )
}