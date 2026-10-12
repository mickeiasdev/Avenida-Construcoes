// ============ Validações de formulário (BR) ============
import { onlyDigits } from './utils'

export function isEmail(value) {
  const v = String(value ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

// Telefone BR completo: fixo 10 dígitos ou celular 11 (com ou sem máscara)
export function isPhoneBR(value) {
  const d = onlyDigits(value)
  return d.length === 10 || d.length === 11
}

export function isCepValid(value) {
  return onlyDigits(value).length === 8
}

// CPF válido de verdade: confere os dois dígitos verificadores.
// Aceita com ou sem pontuação e rejeita sequências repetidas (111.111.111-11).
export function isCpf(value) {
  const d = onlyDigits(value)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  const digit = (length) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return digit(9) === Number(d[9]) && digit(10) === Number(d[10])
}

// Nome precisa ter nome + sobrenome
export function isFullName(value) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ')
  return v.length >= 5 && v.includes(' ')
}

export function isUF(value) {
  return /^[A-Za-z]{2}$/.test(String(value ?? '').trim())
}

export function isNumber(value) {
  const v = String(value ?? '').trim()
  return v.length > 0 && v.length <= 6
}

// Senha com regras mínimas
export function isPasswordStrong(value) {
  return String(value ?? '').length >= 6
}
