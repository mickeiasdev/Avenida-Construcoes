import { supabase } from './supabaseClient'

// RASTREIO DE ERROS "da casa": handlers globais gravam em error_reports
// (migration-37) e o painel lista em admin/erros — sem serviço externo.
export function reportError(message, { stack, context } = {}) {
  try {
    supabase.from('error_reports').insert({
      message: String(message ?? 'Erro desconhecido').slice(0, 2000),
      stack: String(stack ?? '').slice(0, 4000) || null,
      url: window.location.href,
      user_agent: navigator.userAgent,
      context: context ?? null,
    }).then(() => {}, () => {})
  } catch { /* sem banco/rede: segue a vida */ }
}

export function installGlobalErrorTracking() {
  window.addEventListener('error', (e) => {
    reportError(e.message, { stack: e.error?.stack, context: 'window.onerror' })
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportError('Promise rejeitada: ' + (e.reason?.message ?? e.reason ?? '?'), {
      stack: e.reason?.stack, context: 'unhandledrejection',
    })
  })
}
