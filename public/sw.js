// Service Worker mínimo para Web Push (notificações de pedido no PWA).
// Registrado em src/main.tsx; os eventos abaixo são acionados pela
// Edge Function push-order-status quando o status do pedido muda.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'Sua loja'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Atualização no seu pedido.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'order-status', // substitui a notificação anterior (sem empilhar)
      data: { url: data.url || '/pedidos' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/pedidos'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
