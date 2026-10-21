// Web Push: ativa/desativa as notificações de pedido (PWA).
// Requer VITE_VAPID_PUBLIC_KEY no .env (ver README) e o service
// worker /sw.js — registrado uma vez em src/main.tsx.
import { supabase } from './supabaseClient'

export function pushSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

// loja sem a chave configurada esconde o botão em vez de prometer o que não entrega
export function pushConfigured() {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim() !== ''
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

// Assina e grava a assinatura em push_subscriptions (migration-35).
// Idempotente: reutiliza a assinatura existente do navegador.
export async function enableOrderPush(userId) {
  if (!pushSupported()) throw new Error('Este navegador não suporta notificações push.')
  const key = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()
  if (!key) throw new Error('As notificações ainda não foram configuradas pela loja.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissão de notificação negada.')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth_key: json.keys?.auth ?? '',
    }, { onConflict: 'endpoint' })
  if (error) throw new Error('Não foi possível salvar a assinatura: ' + error.message)
  return true
}

export async function disableOrderPush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

// estado atual: assinado E com permissão concedida
export async function pushEnabled() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return Boolean(sub) && Notification.permission === 'granted'
}
