import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (uid) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // ---------- MAGIC LINK (e-mail) — gratuito via Supabase Auth ----------
  async function signInWithMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    return { error }
  }

  // ---------- Login por senha (útil para os usuários de teste criados no painel) ----------
  async function signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email, password, fullName) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    })
    return { error }
  }

  // NOTA: OTP via WhatsApp foi REMOVIDO — o envio de códigos por
  // WhatsApp exige provedor PAGO (Twilio, Zenvia ou Meta WhatsApp
  // Cloud API, que cobram por mensagem/conversa). A autenticação do
  // app ficou 100% gratuita (magic link + senha).
  // Se um dia contratar um provedor, o ponto de integração é uma
  // Edge Function que envia/valida o código e autentica com:
  //   supabase.auth.admin.generateLink({ type: 'magiclink', email })
  // (a service_role key só pode ficar na Edge Function, nunca no front).

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'

  const value = {
    user, profile, loading, isAdmin,
    signInWithMagicLink, signInWithPassword, signUp,
    signOut, refreshProfile: fetchProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
