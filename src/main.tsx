import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado no index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA: registra o service worker — necessário para as notificações
// push de pedidos (Edge Function push-order-status). Falha em silêncio
// em navegadores sem suporte; nada do app depende dele.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW: sem push, tudo o resto normal */ })
  })
}
