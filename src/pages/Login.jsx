import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, Phone, Mail, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { isEmail, isFullName, isPasswordStrong, isPhoneBR } from '../lib/validation'
import { maskPhone } from '../lib/utils'

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

// Logo oficial do Google (a Lucide não tem marca de terceiros em ícone)
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27V6.64H1.29a12 12 0 0 0 0 10.72l3.98-3.09z"/>
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43A12 12 0 0 0 1.29 6.64l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"/>
    </svg>
  )
}

// Autenticação — três métodos em coluna:
//  • Google (OAuth, grátis — configura uma vez no Supabase + Google Cloud)
//  • Telefone: código de 6 dígitos por SMS (provedor configurado no Supabase;
//    SMS custa por envio no provedor — o app não adiciona custo)
//  • E-mail: senha (padrão) ou magic link (grátis)
export default function Login() {
  const { signInWithGoogle, sendPhoneOtp, verifyPhoneOtp, signInWithMagicLink, signInWithPassword, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { to: redirectTo, inProgress } = useMemo(() => resolveRedirect(location), [location])

  const [method, setMethod] = useState('google')   // 'google' | 'phone' | 'email'
  const [emailMode, setEmailMode] = useState('password') // 'password' | 'magic'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignup, setIsSignup] = useState(location.state?.mode === 'signup')
  const [phone, setPhone] = useState('')
  const [otpSentTo, setOtpSentTo] = useState(null) // telefone que recebeu o código
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  function goAfterAuth() {
    navigate(redirectTo, inProgress ? { replace: true, state: location.state } : { replace: true })
  }

  // ---------- GOOGLE ----------
  async function handleGoogle() {
    setBusy(true); setMsg(null)
    const { error } = await signInWithGoogle(redirectTo)
    if (error) { setMsg({ type: 'err', text: error.message }); setBusy(false) }
    // sem erro: o navegador está indo pro Google — deixa o spinner girando
  }

  // ---------- TELEFONE (SMS de 6 dígitos) ----------
  async function handlePhone() {
    if (!isPhoneBR(phone)) {
      setMsg({ type: 'err', text: 'Digite o celular com DDD (ex.: (11) 99999-9999).' })
      return
    }
    setBusy(true); setMsg(null)
    const { error, phone: e164 } = await sendPhoneOtp(phone)
    setBusy(false)
    if (error) {
      setMsg({
        type: 'err',
        text: /provider|not enabled|sms|phone/i.test(error.message)
          ? 'Login por SMS ainda não está ativo nesta loja. Use e-mail ou Google.'
          : error.message,
      })
      return
    }
    setOtpSentTo(e164); setCode('')
    setMsg({ type: 'ok', text: 'Código enviado por SMS para ' + phone + '. Digite abaixo.' })
  }

  async function handleVerifyCode() {
    const token = code.trim()
    if (!/^\d{6}$/.test(token)) {
      setMsg({ type: 'err', text: 'Digite o código de 6 números recebido por SMS.' })
      return
    }
    setBusy(true); setMsg(null)
    const { error } = await verifyPhoneOtp(otpSentTo, token)
    setBusy(false)
    if (error) { setMsg({ type: 'err', text: 'Código inválido ou expirado. Toque em reenviar.' }); return }
    goAfterAuth()
  }

  // ---------- E-MAIL (senha / magic link) ----------
  async function handleEmail(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    if (!isEmail(email)) {
      setMsg({ type: 'err', text: 'Digite um e-mail válido (ex.: voce@exemplo.com).' })
      setBusy(false); return
    }
    if (isSignup && !isFullName(fullName)) {
      setMsg({ type: 'err', text: 'Digite seu nome completo (nome + sobrenome).' })
      setBusy(false); return
    }
    if (emailMode === 'password' && !isPasswordStrong(password)) {
      setMsg({ type: 'err', text: 'A senha precisa de pelo menos 6 caracteres.' })
      setBusy(false); return
    }
    try {
      if (emailMode === 'magic') {
        const { error } = await signInWithMagicLink(email)
        setMsg(error
          ? { type: 'err', text: error.message }
          : { type: 'ok', text: 'Link de acesso enviado! Confira sua caixa de entrada (e o spam).' })
      } else {
        const { error, session } = isSignup
          ? await signUp(email, password, fullName)
          : await signInWithPassword(email, password)
        if (error) {
          setMsg({ type: 'err', text: error.message })
        } else if (!isSignup || session) {
          goAfterAuth() // confirmação desligada: entra direto
        } else {
          setMsg({
            type: 'ok',
            text: 'Enviamos um link para confirmar seu e-mail. Enquanto isso você já pode comprar como visitante.',
            continueTo: redirectTo,
            continueLabel: redirectTo === '/' ? 'Ir para a loja' : 'Continuar para onde eu estava',
          })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword() {
    if (!isEmail(email)) {
      setMsg({ type: 'err', text: 'Digite um e-mail válido para receber o link de redefinição.' })
      return
    }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { emailRedirectTo: window.location.origin })
    setMsg(error
      ? { type: 'err', text: error.message }
      : { type: 'ok', text: 'Link de redefinição enviado! Confira seu e-mail (e o spam).' })
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800">Entrar na sua conta</h1>
        <p className="text-sm text-gray-500">Acompanhe pedidos e finalize compras mais rápido.</p>
      </div>

      {/* MÉTODOS — botões em coluna; os inputs necessários ficam abaixo */}
      <div className="space-y-2.5">
        <button type="button" onClick={handleGoogle} disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md hover:ring-primary/40 disabled:opacity-50">
          <GoogleIcon /> Continuar com Google
        </button>
        <button type="button" onClick={() => { setMethod('phone'); setMsg(null) }} disabled={busy}
          className={'flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition disabled:opacity-50 ' +
            (method === 'phone' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:ring-primary/40')}>
          <Phone className="h-4 w-4" /> Entrar com telefone (código SMS)
        </button>
        <button type="button" onClick={() => { setMethod('email'); setMsg(null) }} disabled={busy}
          className={'flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition disabled:opacity-50 ' +
            (method === 'email' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:ring-primary/40')}>
          <Mail className="h-4 w-4" /> Entrar com e-mail
        </button>
      </div>

      {/* INPUTS — só do método escolhido */}
      {method === 'phone' && (
        <div className="card space-y-3">
          <div>
            <label htmlFor="l-telefone" className="field-label">Celular com DDD</label>
            <input id="l-telefone" className="input" inputMode="tel" maxLength={15}
              value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 99999-9999" disabled={!!otpSentTo} />
          </div>
          {otpSentTo ? (
            <div>
              <label htmlFor="l-codigo" className="field-label">Código de 6 dígitos</label>
              <div className="flex gap-2">
                <input id="l-codigo" className="input flex-1 text-center text-lg tracking-[0.4em]" inputMode="numeric" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="······" autoComplete="one-time-code" />
                <button type="button" className="btn-primary px-4" disabled={busy} onClick={handleVerifyCode}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
                </button>
              </div>
              <button type="button" className="mt-2 text-xs text-primary hover:underline"
                onClick={() => { setOtpSentTo(null); setCode(''); setMsg(null) }}>
                Trocar de número ou reenviar código
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={handlePhone}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enviar código por SMS
            </button>
          )}
          <p className="text-xs text-gray-500">Você recebe um SMS com o código. Sem senha, sem e-mail.</p>
        </div>
      )}

      {method === 'email' && (
        <form onSubmit={handleEmail} className="card space-y-3">
          {isSignup && (
            <div>
              <label htmlFor="l-nome" className="field-label">Nome completo</label>
              <input id="l-nome" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
            </div>
          )}
          <div>
            <label htmlFor="l-email" className="field-label">E-mail</label>
            <input id="l-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          </div>
          {emailMode === 'password' && (
            <div>
              <label htmlFor="l-senha" className="field-label">Senha</label>
              <input id="l-senha" className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {emailMode === 'magic' ? 'Enviar link de acesso' : isSignup ? 'Criar conta' : 'Entrar'}
          </button>
          <div className="flex items-center justify-center gap-4 text-xs">
            {emailMode === 'password' ? (
              <>
                <button type="button" className="text-primary hover:underline" onClick={() => { setEmailMode('magic'); setMsg(null) }}>
                  Entrar sem senha (link por e-mail)
                </button>
                {!isSignup && (
                  <button type="button" className="text-gray-500 transition hover:text-primary" onClick={handleResetPassword}>
                    Esqueci minha senha
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="text-primary hover:underline" onClick={() => { setEmailMode('password'); setMsg(null) }}>
                <KeyRound className="mr-1 inline h-3.5 w-3.5" /> Voltar para e-mail com senha
              </button>
            )}
          </div>
          <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={() => { setIsSignup((v) => !v); setMsg(null) }}>
            {isSignup ? 'Já tenho conta — fazer login' : 'Não tenho conta — criar agora'}
          </button>
        </form>
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
        <button type="button" className="btn-soft min-h-11 w-full" onClick={() => navigate(msg.continueTo, { replace: true })}>
          {msg.continueLabel}
        </button>
      )}
    </div>
  )
}
