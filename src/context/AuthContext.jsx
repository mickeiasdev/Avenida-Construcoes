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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    })
    // session só vem quando a confirmação de e-mail está DESLIGADA no projeto.
    // Com a confirmação ligada vem null — quem chama decide se avisa ou se
    // deixa o usuário seguir como visitante (sem travar).
    return { error, session: data?.session ?? null }
  }

  // ---------- GOOGLE (OAuth) ----------
  // Gratuito. Precisa configurar UMA vez: Google Cloud Console cria um OAuth
  // Client (Web) com redirect = https://SEU-PROJETO.supabase.co/auth/v1/callback
  // e esse Client ID/Secret vão em Supabase → Auth → Providers → Google.
  // redirectPath: para onde voltar depois do Google (quem chama sabe a rota
  // de origem, com acesso ao router — o context não tem)
  async function signInWithGoogle(redirectPath = '/') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + redirectPath },
    })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'

  const value = {
    user, profile, loading, isAdmin,
    signInWithMagicLink, signInWithPassword, signUp, signInWithGoogle,
    signOut, refreshProfile: fetchProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
