import { useCallback, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { onlyDigits } from './utils'

// ============================================================
// Compra SEM LOGIN com CPF que já tem conta: o checkout sugere
// "entrar na sua conta?" e deixa continuar como visitante mesmo
// assim ("continuar assim mesmo" não pergunta de novo para o
// mesmo CPF nesta finalização).
// A consulta (lookup_cpf_account, migration-21) devolve APENAS o
// primeiro nome do dono do CPF — nada mais vaza.
// ============================================================
export function useCpfAccount({ loggedIn }) {
  const [account, setAccount] = useState(null) // { cpf, name } quando o CPF tem conta
  const [askOpen, setAskOpen] = useState(false)  // modal "entrar na sua conta?"
  const declinedRef = useRef(false)             // usuário escolheu seguir como visitante

  // Consulta o CPF (com cache do último): devolve o nome quando há conta,
  // null quando não há (ou quando o usuário já declinou este CPF).
  const check = useCallback(async (cpfMasked) => {
    if (loggedIn) return null
    const cpf = onlyDigits(cpfMasked)
    if (cpf.length !== 11) return null
    if (account?.cpf === cpf) return declinedRef.current ? null : account.name
    try {
      const { data } = await supabase.rpc('lookup_cpf_account', { p_cpf: cpfMasked })
      const name = data || null
      if (name) {
        setAccount({ cpf, name })
        declinedRef.current = false
        return name
      }
      setAccount(null)
    } catch { /* RPC ausente (migration-21 não rodada): o fluxo segue normal */ }
    return null
  }, [loggedIn, account])

  const open = useCallback(() => setAskOpen(true), [])
  const close = useCallback(() => setAskOpen(false), [])

  // "Continuar assim mesmo": não pergunta mais para este CPF
  const decline = useCallback(() => {
    declinedRef.current = true
    setAskOpen(false)
  }, [])

  return { account, askOpen, open, close, decline, check, declined: declinedRef }
}
