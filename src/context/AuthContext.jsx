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

  // ============================================================
  // OTP VIA WHATSAPP — UI pronta, integração pendente.
  // Para habilitar de verdade:
  //   1) Contrate/ configure um provedor (Twilio, Zenvia, Meta
  //      WhatsApp Cloud API, 360dialog...) que envie o código OTP.
  //   2) Crie uma Edge Function 'send-otp-whatsapp' no Supabase:
  //      supabase functions new send-otp-whatsapp
  //      Ela recebe { phone }, valida o numero, gera um OTP de 6
  //      dígitos, envia via provedor e grava em otp_codes (tabela).
  //   3) Plug exatamente aqui:
  //      const { data, error } = await supabase.functions.invoke(
  //        'send-otp-whatsapp', { body: { phone } })
  //   4) Para autenticar após validar o OTP, crie a conta com um
  //      e-mail derivado (5511telefone@wa.local) e use magiclink:
  //      supabase.auth.admin.generateLink({ type: 'magiclink', email })
  //      (admin API exige a service_role key — via Edge Function).
  // ============================================================
  async function requestWhatsAppOtp(phone) {
    console.info('[WhatsApp OTP] Provedor/webhook nao configurado. Telefone recebido:', phone)
    return {
      error: new Error(
        'OTP via WhatsApp ainda nao esta plugado. Conecte o webhook/provedor aqui ' +
        '(ver comentarios no AuthContext.jsx).'
      ),
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === 'admin'

  const value = {
    user, profile, loading, isAdmin,
    signInWithMagicLink, signInWithPassword, signUp,
    requestWhatsAppOtp, signOut, refreshProfile: fetchProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
