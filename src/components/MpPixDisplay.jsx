import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { formatBRL } from '../lib/utils'

// Tela do Pix (Mercado Pago). Duas fontes de status, em ordem de prioridade:
//   1) onRefresh  -> Edge Function create-mp-order (service role). É o único
//      caminho que funciona para VISITANTE, porque a tabela orders não é
//      legível por quem não está logado (RLS "own orders read").
//   2) getOrderPaymentStatus -> leitura direta da tabela (cliente logado).
const OK = 'approved'
const FAIL = ['rejected', 'cancelled', 'canceled', 'expired']

const norm = (s) => (['approved', 'authorized'].includes(s) ? OK : s)

export function MpPixDisplay({ mpPix, orderId, total, onApproved, getOrderPaymentStatus, onRefresh, compact = false }) {
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(mpPix?.status ?? 'pending')
  const [polling, setPolling] = useState(true)
  const [checking, setChecking] = useState(false)
  // onApproved precisa disparar UMA vez só (o efeito roda de novo quando o
  // status muda; sem a trava o pai recebia o aviso duas vezes e navegava 2x)
  const notified = useRef(false)

  async function copy() {
    if (!mpPix?.qr_code) return
    try {
      await navigator.clipboard.writeText(mpPix.qr_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: seleciona
      const ta = document.createElement('textarea')
      ta.value = mpPix.qr_code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const readStatus = useCallback(async () => {
    if (onRefresh) {
      try {
        const data = await onRefresh(orderId)
        const s = String(data?.status ?? '').toLowerCase()
        if (s) return norm(s)
      } catch {
        // Edge Function fora do ar/antiga: tenta a leitura direta abaixo
        // (funciona para quem está logado; visitante depende da função)
      }
    }
    if (getOrderPaymentStatus) {
      const row = await getOrderPaymentStatus(orderId)
      const ps = String(row?.payment_status ?? '').toLowerCase()
      const st = String(row?.status ?? '').toLowerCase()
      if (ps) return norm(ps)
      if (st === 'confirmed') return OK
      if (st === 'cancelled') return 'cancelled'
    }
    return null
  }, [orderId, onRefresh, getOrderPaymentStatus])

  const applyStatus = useCallback((s) => {
    if (s === OK) { setStatus(OK); setPolling(false); return }
    if (FAIL.includes(s)) { setStatus(s); setPolling(false) }
  }, [])

  // avisa o pai uma única vez quando o pagamento é aprovado
  useEffect(() => {
    if (status !== OK || notified.current) return
    notified.current = true
    onApproved?.()
  }, [status, onApproved])

  // Polling do payment_status a cada 4s até aprovar/recusar
  useEffect(() => {
    if (!orderId || (!onRefresh && !getOrderPaymentStatus)) return
    if (status === OK || !polling) return
    let alive = true
    const id = setInterval(async () => {
      try {
        const s = await readStatus()
        if (alive && s) applyStatus(s)
      } catch { /* rede instável: a próxima volta tenta de novo */ }
    }, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [orderId, onRefresh, getOrderPaymentStatus, status, polling, readStatus, applyStatus])

  async function checkNow() {
    setChecking(true)
    try {
      const s = await readStatus()
      if (s) applyStatus(s)
    } catch {
      // segue mostrando "aguardando" — o polling continua
    } finally {
      setChecking(false)
    }
  }

  if (status === OK) {
    return (
      <div className={"flex flex-col items-center gap-3 rounded-2xl bg-green-50 p-6 text-center ring-1 ring-green-200 " + (compact ? '' : 'py-8')}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <Check className="h-7 w-7" />
        </span>
        <p className="font-bold text-green-800">Pagamento aprovado!</p>
        <p className="text-sm text-green-700">Recebemos seu Pix de {formatBRL(total)}. Vamos preparar seu pedido.</p>
      </div>
    )
  }

  if (!mpPix?.qr_code) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
        Pix não disponível no momento. Use "Verificar agora" em instantes — se a cobrança já foi paga, esta tela confirma sozinha.
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-gray-200">
      <div className="text-center">
        <p className="text-sm font-bold text-gray-800">Pague com Pix</p>
        <p className="text-xs text-gray-500">Escaneie o QR Code ou copie o código abaixo. Total: <b className="text-gray-800">{formatBRL(total)}</b></p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="rounded-xl bg-white p-3 ring-1 ring-gray-100 shadow-sm">
          {mpPix.qr_code_base64 ? (
            <img
              src={"data:image/png;base64," + mpPix.qr_code_base64}
              alt="QR Code Pix"
              className="h-56 w-56 object-contain"
            />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
              <QrCode className="h-10 w-10" />
            </div>
          )}
        </div>
      </div>

      {/* Copia e Cola */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">Pix Copia e Cola</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={mpPix.qr_code}
            className="input flex-1 truncate font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={copy}
            className={"shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition " + (copied ? 'bg-green-600 text-white' : 'bg-secondary text-white hover:bg-black/80')}
          >
            {copied ? <><Check className="mr-1 inline h-4 w-4" /> Copiado</> : <><Copy className="mr-1 inline h-4 w-4" /> Copiar</>}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">Cole no app do seu banco na opção Pix Copia e Cola.</p>
      </div>

      <div className="flex flex-col items-center gap-2 text-xs text-gray-500">
        {polling ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando pagamento… atualiza automaticamente
          </span>
        ) : (
          <span className="text-center text-amber-600">
            Pagamento não confirmado ({status}). Se você já pagou, use "Verificar agora".
          </span>
        )}
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/30 transition hover:bg-primary/5 disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Verificar agora
        </button>
      </div>

      <p className="text-center text-[11px] text-gray-400">Pedido nº {String(orderId).slice(0,8)}</p>
    </div>
  )
}
