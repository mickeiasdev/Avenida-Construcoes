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
