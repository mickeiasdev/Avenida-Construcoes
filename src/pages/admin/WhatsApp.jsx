import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Check, ClipboardList, Loader2, MessageCircle,
  PlusCircle, QrCode, RefreshCw, Search, Send, Smartphone, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { waCall, toJid } from '../../lib/whatsappChat'
import { formatBRL, formatDateTime, maskPhone, onlyDigits, ORDER_CLS, ORDER_SHORT, waLocal, waNumber } from '../../lib/utils'
import { useStore } from '../../context/StoreContext'
import { useModalA11y } from '../../lib/useModalA11y'

// ============ WhatsApp da loja, dentro do painel ============
// Mesma sessão da Evolution API (pareada por QR — igual ao WhatsApp Web):
// conversar aqui conversa pelo número da loja, do celular ou do painel.
// Fluxo: lista à esquerda (busca + não lidas) · conversa à direita
// (histórico, respostas rápidas, enviar). No celular: lista → conversa.

// últimos 9 dígitos casam o contato entre banco (com/sem DDI) e JID
const key9 = (phone) => onlyDigits(phone).slice(-9)

const AV_COLORS = ['bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500']
function Avatar({ name, seed }) {
  const h = [...String(seed ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white ' + AV_COLORS[h % AV_COLORS.length]}
      aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

// hora da lista: hoje 14:32 · Ontem · ter · 12/03/25
function fmtListTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Ontem'
  if (now - d < 6 * 864e5) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const STATE_INFO = {
  open: { label: 'Conectado', pill: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  connecting: { label: 'Conectando…', pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  close: { label: 'Desconectado', pill: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

// Respostas rápidas — mesmos avisos que o sistema já manda sozinho
// (whatsapp-notify), prontos para um toque do atendente.
function quickReplies(settings) {
  const loja = settings?.store_name || 'nossa loja'
  return [
    { label: '✅ Pedido confirmado', text: 'Olá! Aqui é da ' + loja + '. Seu pedido foi *confirmado* e já está em preparo. Qualquer dúvida é só responder por aqui. 😉' },
    { label: '📦 Separando itens', text: 'Olá! Estamos *separando os itens* do seu pedido agora. Avisamos quando sair para entrega! 📦' },
    { label: '🚚 Saiu p/ entrega', text: 'Boas notícias: seu pedido *saiu para entrega*! 🚚' },
    { label: '🎉 Pedido entregue', text: 'Seu pedido foi *entregue*. Obrigado pela preferência! ⭐ Qualquer coisa, é só chamar por aqui.' },
    { label: '📍 Endereço e horário', text: (settings?.address ? settings.address + '\n' : '') + 'Funcionamento: ' + (settings?.business_hours || 'veja na loja') },
  ].filter((q) => q.text.trim())
}

export default function WhatsAppAdmin() {
  const { settings } = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [boot, setBoot] = useState(null)       // { configured, state }
  const [error, setError] = useState(null)
  const [chats, setChats] = useState(null)     // null = carregando
  const [search, setSearch] = useState('')
  const [activeJid, setActiveJid] = useState(null)
  const [messages, setMessages] = useState([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [contacts, setContacts] = useState(null) // { byPhone, ordersByPhone }

  const [qr, setQr] = useState(null)            // { base64, pairingCode }
  const [qrBusy, setQrBusy] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newSearch, setNewSearch] = useState('')
  const [ordersOpen, setOrdersOpen] = useState(false)

  useModalA11y(qrOpen, () => setQrOpen(false))
  useModalA11y(newOpen, () => setNewOpen(false))
  useModalA11y(ordersOpen, () => setOrdersOpen(false))

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const lastInIdRef = useRef('')
  const deepDoneRef = useRef(false)
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
    [],
  )

  const activeJidPhone = activeJid ? activeJid.replace('@s.whatsapp.net', '') : ''

  // ---------- nomes e pedidos que a LOJA já conhece ----------
  // enriquece a lista do WhatsApp com os dados do cadastro (pedidos/perfis)
  useEffect(() => {
    (async () => {
      try {
        const [profilesRes, ordersRes] = await Promise.all([
          supabase.from('profiles').select('full_name, phone').not('phone', 'is', null).limit(500),
          supabase.from('orders')
            .select('id, customer_name, customer_phone, status, total, created_at')
            .order('created_at', { ascending: false }).limit(300),
        ])
        const byPhone = new Map()
        const ordersByPhone = new Map()
        for (const p of profilesRes.data ?? []) {
          const k = key9(p.phone)
          if (k && p.full_name && !byPhone.has(k)) byPhone.set(k, { name: p.full_name, phone: p.phone })
        }
        for (const o of ordersRes.data ?? []) {
          const k = key9(o.customer_phone)
          if (!k) continue
          if (o.customer_name && !byPhone.has(k)) byPhone.set(k, { name: o.customer_name, phone: o.customer_phone })
          const arr = ordersByPhone.get(k) ?? []
          arr.push(o)
          ordersByPhone.set(k, arr)
        }
        setContacts({ byPhone, ordersByPhone })
      } catch { /* sem contatos: a lista da Evolution basta */ }
    })()
  }, [])

  // ---------- boot: estado da conexão ----------
  const loadChats = useCallback(async () => {
    try {
      const d = await waCall('chats')
      setChats(d.chats ?? [])
    } catch (e) {
      setChats((prev) => prev ?? [])
      setError(e.message)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    setError(null)
    try {
      const st = await waCall('status')
      setBoot(st)
      if (st.configured && st.state === 'open') loadChats()
    } catch (e) {
      setBoot({ configured: true, state: 'close' })
      setError(e.message)
    }
  }, [loadChats])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  // ---------- QR / pareamento ----------
  const refreshQr = useCallback(async (silent = false) => {
    setQrBusy(true)
    try {
      const d = await waCall('connect')
      if (!d.base64 && d.state === 'open') {
        // já conectou (ex.: pareou pelo celular agora)
        setQrOpen(false)
        refreshStatus()
        return
      }
      setQr({ base64: d.base64, pairingCode: d.pairingCode ?? null })
    } catch (e) {
      if (!silent) setError(e.message)
    }
    setQrBusy(false)
  }, [refreshStatus])

  async function openQr() {
    setQrOpen(true)
    refreshQr()
  }

  // QR expira ~20s: troca sozinho enquanto o modal está aberto
  useEffect(() => {
    if (!qrOpen) return
    const id = setInterval(() => refreshQr(true), 25_000)
    return () => clearInterval(id)
  }, [qrOpen, refreshQr])

  // ---------- conversa ----------
  const markRead = useCallback(async (jid, msgs) => {
    const list = Array.isArray(msgs) ? msgs : []
    const lastIn = [...list].reverse().find((m) => !m.fromMe)
    setChats((prev) => (prev ?? []).map((c) => (c.jid === jid ? { ...c, unread: 0 } : c)))
    try { await waCall('read', { chat: jid, id: lastIn?.id ?? '' }) } catch { /* best effort */ }
  }, [])

  const loadMessages = useCallback(async (jid, silent = true) => {
    try {
      const d = await waCall('messages', { chat: jid, count: 50 })
      const list = d.messages ?? []
      setMessages((prev) => (prev.length === list.length && prev[prev.length - 1]?.id === list[list.length - 1]?.id ? prev : list))
      const last = list[list.length - 1]
      if (last && !last.fromMe && last.id && last.id !== lastInIdRef.current) {
        lastInIdRef.current = last.id
        markRead(jid, list)
      }
    } catch (e) {
      if (!silent) setError(e.message)
    }
  }, [markRead])

  async function openChat(jid, presetDraft = '') {
    setActiveJid(jid)
    setMessages([])
    setDraft(presetDraft)
    setMsgsLoading(true)
    lastInIdRef.current = ''
    await loadMessages(jid, false)
    setMsgsLoading(false)
  }

  // atalho de fora: /admin/whatsapp?to=5511...&text=... (botão "Avisar cliente")
  useEffect(() => {
    const to = params.get('to')
    if (!boot?.configured || boot.state !== 'open' || !to || deepDoneRef.current) return
    deepDoneRef.current = true
    openChat(toJid(waNumber(to)), params.get('text') ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot, params, loadChats, loadMessages])

  // ---------- enviar ----------
  async function handleSend(e) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending || !activeJid) return
    setSending(true)
    setError(null)
    const tmpId = 'tmp-' + Date.now()
    setMessages((prev) => [...prev, { id: tmpId, fromMe: true, text, at: Date.now() }])
    setDraft('')
    try {
      await waCall('send', { chat: activeJid, text })
      await loadMessages(activeJid)
      loadChats()
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId))
      setDraft(text)
      setError(err.message)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    // celular (touch): Enter quebra linha, envia só no botão.
    // desktop: Enter envia, Shift+Enter quebra.
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---------- polling leve (a Evolution não empurra p/ o navegador) ----------
  // lista a cada 15s; conversa aberta a cada 6s; só com aba visível
  useEffect(() => {
    if (!boot?.configured || boot.state !== 'open') return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadChats()
        if (activeJid) loadMessages(activeJid)
      }
    }, 15_000)
    return () => clearInterval(id)
  }, [boot, activeJid, loadChats, loadMessages])

  useEffect(() => {
    if (!boot?.configured || boot.state !== 'open' || !activeJid) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(activeJid)
    }, 6_000)
    return () => clearInterval(id)
  }, [boot, activeJid, loadMessages])

  // rola pro fim quando chega mensagem
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // ---------- dados derivados ----------
  const chatName = useCallback((c) => {
    const local = contacts?.byPhone?.get(key9(c.phone))?.name
    if (local || c.name) return local || c.name
    // @lid é o endereço interno do WhatsApp (número real escondido por
    // privacidade) — máscara de DDD aqui viraria número falso
    if (String(c.jid ?? '').endsWith('@lid')) return 'Contato WhatsApp'
    return maskPhone(waLocal(c.phone))
  }, [contacts])

  const visibleChats = useMemo(() => {
    const f = search.toLowerCase()
    const fd = onlyDigits(search)
    return (chats ?? []).filter((c) => {
      if (!f) return true
      return (
        chatName(c).toLowerCase().includes(f) ||
        (c.lastText ?? '').toLowerCase().includes(f) ||
        (fd.length >= 2 && c.phone.includes(fd))
      )
    })
  }, [chats, search, chatName])

  const activeChat = useMemo(
    () => (chats ?? []).find((c) => c.jid === activeJid) ?? null,
    [chats, activeJid],
  )
  const activeOrders = useMemo(
    () => contacts?.ordersByPhone?.get(key9(activeJidPhone)) ?? [],
    [contacts, activeJidPhone],
  )
  const quick = useMemo(() => quickReplies(settings), [settings])

  const contactsList = useMemo(() => {
    if (!contacts) return []
    const f = newSearch.trim().toLowerCase()
    return [...contacts.byPhone.entries()]
      .map(([k, v]) => ({ key: k, name: v.name, phone: v.phone, incomplete: onlyDigits(v.phone).length < 10 }))
      .filter(({ name, phone }) => !f || name.toLowerCase().includes(f) || onlyDigits(phone).includes(onlyDigits(f)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8)
  }, [contacts, newSearch])

  // ============ render ============
  const st = STATE_INFO[boot?.state] ?? STATE_INFO.close

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* título + status da conexão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">WhatsApp</h1>
          <p className="text-sm text-gray-500">Atendimento da loja, sem sair do painel.</p>
        </div>
        {boot?.configured && (
          <div className="flex items-center gap-2">
            <span className={'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ' + st.pill} role="status">
              <span className={'h-2 w-2 rounded-full ' + st.dot} /> {st.label}
            </span>
            {boot.state === 'open' ? (
              <button type="button" className="btn-soft" onClick={refreshStatus} disabled={qrBusy}>
                <RefreshCw className="h-4 w-4" /> Atualizar
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={openQr}>
                <QrCode className="h-4 w-4" /> Conectar
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso" className="rounded p-0.5 hover:bg-red-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ainda carregando */}
      {!boot && (
        <div className="card flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Evolution não configurada: passo a passo */}
      {boot && !boot.configured && <SetupGuide onRetry={refreshStatus} />}

      {/* número da loja desconectado: parear (igual WhatsApp Web) */}
      {boot?.configured && boot.state !== 'open' && (
        <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <MessageCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Conecte o WhatsApp da loja</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
              É como ligar o WhatsApp Web: apare um código no celular, o número da loja
              fica ativo aqui no painel e as conversas aparecem na hora.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={openQr} disabled={qrBusy}>
            {qrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Mostrar código de conexão
          </button>
        </div>
      )}

      {/* app de conversas */}
      {boot?.configured && boot.state === 'open' && (
        <div className="card overflow-hidden p-0">
          <div className="flex h-[calc(100dvh-15rem)] min-h-[520px]">
            {/* ===== lista de conversas ===== */}
            <aside
              className={'w-full shrink-0 flex-col border-r border-gray-100 md:flex md:w-80 lg:w-96 '
                + (activeJid ? 'hidden' : 'flex')}
              aria-label="Conversas"
            >
              <div className="space-y-2 border-b border-gray-100 p-3">
                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={() => { setNewOpen(true); setNewSearch('') }}
                >
                  <PlusCircle className="h-4 w-4" /> Nova conversa
                </button>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-10"
                    placeholder="Buscar conversa…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar conversa"
                  />
                </div>
              </div>

              <div className="scrollbar min-h-0 flex-1 overflow-y-auto">
                {chats === null ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : visibleChats.length === 0 ? (
                  <div className="px-6 py-14 text-center text-sm text-gray-500">
                    {search ? 'Nenhuma conversa encontrada.' : (
                      <>
                        <MessageCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        Nenhuma conversa ainda.<br />
                        Toque em <strong>Nova conversa</strong> para chamar um cliente.
                      </>
                    )}
                  </div>
                ) : (
                  visibleChats.map((c) => (
                    <button
                      key={c.jid}
                      type="button"
                      onClick={() => openChat(c.jid)}
                      aria-label={'Abrir conversa com ' + chatName(c) + (c.unread ? ', ' + c.unread + ' não lidas' : '')}
                      className={'flex w-full items-center gap-3 border-b border-gray-50 px-3 py-3 text-left transition '
                        + (activeJid === c.jid ? 'bg-primary/5' : 'hover:bg-gray-50')}
                    >
                      <Avatar name={chatName(c)} seed={c.jid} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-gray-800">{chatName(c)}</span>
                          <span className="shrink-0 text-[11px] text-gray-400">{fmtListTime(c.lastAt)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-gray-500">
                            {(c.fromMe ? 'Você: ' : '') + (c.lastText ?? '')}
                          </span>
                          {c.unread > 0 && (
                            <span className="badge-count shrink-0" aria-hidden="true">
                              {c.unread > 99 ? '99+' : c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            {/* ===== conversa aberta ===== */}
            <section
              className={'min-w-0 flex-1 flex-col ' + (activeJid ? 'flex' : 'hidden md:flex')}
              aria-label="Conversa aberta"
            >
              {!activeJid ? (
                <div className="hidden flex-col items-center justify-center gap-2 px-6 text-center text-gray-400 md:flex">
                  <MessageCircle className="h-10 w-10 text-gray-200" />
                  <p className="text-sm">Selecione uma conversa para começar a responder.</p>
                </div>
              ) : (
                <>
                  {/* cabeçalho da conversa */}
                  <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-3 py-2.5">
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 md:hidden"
                      onClick={() => setActiveJid(null)}
                      aria-label="Voltar para a lista de conversas"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <Avatar name={chatName(activeChat ?? { jid: activeJid, phone: activeJidPhone })} seed={activeJid} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-800">
                        {activeChat ? chatName(activeChat) : 'Nova conversa'}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {activeJid.endsWith('@lid') ? 'WhatsApp (endereço interno)' : maskPhone(waLocal(activeJidPhone))}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-soft px-3"
                      onClick={() => setOrdersOpen(true)}
                      aria-label={'Pedidos deste cliente: ' + activeOrders.length}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Pedidos
                      {activeOrders.length > 0 && (
                        <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                          {activeOrders.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* mensagens */}
                  <div className="scrollbar relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-gray-100 p-3">
                    {msgsLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100/60">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    )}
                    {messages.length === 0 && !msgsLoading && (
                      <div className="py-10 text-center text-sm text-gray-400">
                        Início da conversa. Envie a primeira mensagem 👋
                      </div>
                    )}
                    {messages.map((m) => (
                      <div key={m.id} className={'flex ' + (m.fromMe ? 'justify-end' : 'justify-start')}>
                        <div
                          className={'max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-md '
                            + (m.fromMe
                              ? 'rounded-br-md bg-primary text-white'
                              : 'rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200')}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          <span className={'mt-1 block text-right text-[10px] ' + (m.fromMe ? 'text-white/70' : 'text-gray-400')}>
                            {new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            {m.fromMe && <Check className="ml-1 inline h-3 w-3" />}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>

                  {/* respostas rápidas + envio */}
                  <form onSubmit={handleSend} className="border-t border-gray-100 bg-white">
                    <div className="scrollbar flex gap-2 overflow-x-auto px-3 pt-2.5" role="toolbar" aria-label="Respostas rápidas">
                      {quick.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
                          onClick={() => { setDraft(q.text); inputRef.current?.focus() }}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-end gap-2 p-3">
                      <textarea
                        ref={inputRef}
                        className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
                        rows={1}
                        placeholder="Escreva sua mensagem…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        aria-label="Mensagem"
                      />
                      <button
                        type="submit"
                        className="btn-primary min-h-11 min-w-11 shrink-0 !px-3"
                        disabled={sending || !draft.trim()}
                        aria-label="Enviar mensagem"
                      >
                        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ============ modal: QR de conexão ============ */}
      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conectar WhatsApp da loja"
            className="toast-in w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <h2 className="text-lg font-bold text-gray-800">Conectar WhatsApp</h2>
            <p className="mt-1 text-sm text-gray-500">No celular da loja, abra o WhatsApp e siga:</p>
            <p className="mt-2 text-xs font-medium text-gray-600">
              <strong>1.</strong> Toque em <Smartphone className="inline h-3.5 w-3.5" /> Configurações ▸ <strong>Aparelhos conectados</strong><br />
              <strong>2.</strong> Toque em <strong>Conectar um aparelho</strong><br />
              <strong>3.</strong> Aponte a câmera para o QR ou digite o código
            </p>

            <div className="mx-auto mt-4 flex min-h-56 w-56 items-center justify-center rounded-xl bg-gray-50 ring-1 ring-gray-200">
              {qrBusy && !qr ? (
                <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
              ) : qr?.base64 ? (
                <img src={qr.base64} alt="QR code para conectar o WhatsApp da loja" className="h-full w-full rounded-xl p-2" />
              ) : (
                <p className="px-4 text-sm text-gray-400">Código não disponível — toque em atualizar.</p>
              )}
            </div>

            {qr?.pairingCode && (
              <p className="mt-3 text-sm text-gray-600">
                Sem câmera? No celular, escolha "Conectar com número de telefone"
                e digite o código:
                <span className="mt-1 block break-all rounded-lg bg-gray-100 px-2 py-1.5 text-center font-mono text-xl font-bold tracking-widest text-primary ring-1 ring-gray-200">
                  {qr.pairingCode}
                </span>
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button type="button" className="btn-primary" onClick={() => refreshQr()} disabled={qrBusy}>
                {qrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Gerar novo código
              </button>
              <button type="button" className="btn-soft" onClick={() => setQrOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: nova conversa ============ */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nova conversa"
            className="toast-in flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-800">Nova conversa</h2>
              <button type="button" onClick={() => setNewOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const d = onlyDigits(newPhone)
                  if (d.length < 10) return
                  setNewOpen(false)
                  openChat(toJid(waNumber(d)))
                  setNewPhone('')
                }}
                className="flex gap-2"
              >
                <input
                  className="input flex-1"
                  inputMode="tel"
                  maxLength={15}
                  placeholder="(11) 99999-9999"
                  value={newPhone}
                  onChange={(e) => setNewPhone(maskPhone(e.target.value))}
                  aria-label="Número de telefone com DDD"
                />
                <button type="submit" className="btn-primary shrink-0" disabled={onlyDigits(newPhone).length < 10}>
                  <Send className="h-4 w-4" /> Abrir
                </button>
              </form>

              {contactsList.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Clientes da loja {newSearch ? '— filtrados' : '(recentes)'}
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      className="input mb-2 pl-10"
                      placeholder="Buscar cliente por nome ou número…"
                      value={newSearch}
                      onChange={(e) => setNewSearch(e.target.value)}
                      aria-label="Buscar cliente"
                    />
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {contactsList.map(({ key, phone, name, incomplete }) => (
                      <li key={key}>
                        {incomplete ? (
                          // telefone sem DDD no cadastro: conversa NÃO abre (o
                          // destino seria inválido) — corrija no painel de Clientes
                          <div
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left opacity-75"
                            title="Telefone sem DDD no cadastro — corrija no painel de Clientes para conversar"
                          >
                            <Avatar name={name} seed={phone} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{name}</span>
                            <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              sem DDD
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-gray-50"
                            onClick={() => {
                              setNewOpen(false)
                              openChat(toJid(waNumber(phone)))
                            }}
                          >
                            <Avatar name={name} seed={phone} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{name}</span>
                            <span className="shrink-0 text-xs text-gray-400">{maskPhone(waLocal(phone))}</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: pedidos do cliente ============ */}
      {ordersOpen && activeJid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pedidos deste cliente"
            className="toast-in flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Pedidos de {activeChat ? chatName(activeChat) : maskPhone(waLocal(activeJidPhone))}</h2>
                <p className="text-xs text-gray-500">{activeOrders.length} pedido{activeOrders.length === 1 ? '' : 's'} neste número</p>
              </div>
              <button type="button" onClick={() => setOrdersOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {activeOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Nenhum pedido da loja para este número.<br />
                  São só conversas de WhatsApp por aqui.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activeOrders.map((o) => (
                    <li key={o.id} className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">Pedido nº {o.id.slice(0, 8)}</p>
                        <span className={'rounded-lg px-2.5 py-0.5 text-[11px] font-bold ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                          {ORDER_SHORT[o.status] ?? o.status}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                        <span>{formatDateTime(o.created_at)}</span>
                        <span className="font-bold text-gray-700">{formatBRL(o.total)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                className="btn-soft w-full"
                onClick={() => { setOrdersOpen(false); navigate('/admin/pedidos') }}
              >
                <ClipboardList className="h-4 w-4" /> Abrir painel de pedidos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ Evolution não configurada: o que fazer ============
function SetupGuide({ onRetry }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
        <MessageCircle className="h-8 w-8 text-amber-600" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-800">O WhatsApp da loja ainda não está ligado</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-gray-500">
          Ele funciona em cima da <strong>Evolution API</strong> — a mesma que já envia os
          avisos automáticos de pedidos. Configure uma vez e o painel vira um
          WhatsApp completo.
        </p>
      </div>
      <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
        {open ? 'Esconder o passo a passo' : 'Ver como ligar (passo a passo)'}
      </button>

      {open && (
        <ol className="w-full max-w-2xl space-y-4 text-left text-sm text-gray-600">
          <li className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <p className="font-bold text-gray-800">1. Tenha uma Evolution API rodando</p>
            <p className="mt-1">
              É a plataforma open-source que emparelha com o número da loja (como um
              WhatsApp Web). Instale na sua VPS (
              <a href="https://doc.evolution-api.com" target="_blank" rel="noreferrer" className="text-primary underline">
                documentação oficial
              </a>
              ) ou contrate um serviço gerenciado. As notificações automáticas de
              pedidos <strong>já usam</strong> esta mesma Evolution.
            </p>
          </li>
          <li className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <p className="font-bold text-gray-800">2. Guarde os segredos no Supabase</p>
            <p className="mt-1">
              Dashboard → Edge Functions → Secrets:
              <code className="mx-1 rounded bg-gray-200 px-1 text-[11px]">EVOLUTION_API_URL</code>,
              <code className="mx-1 rounded bg-gray-200 px-1 text-[11px]">EVOLUTION_API_KEY</code>,
              <code className="mx-1 rounded bg-gray-200 px-1 text-[11px]">EVOLUTION_INSTANCE</code>.
              Se as notificações automáticas já funcionam, estes segredos já existem.
            </p>
          </li>
          <li className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <p className="font-bold text-gray-800">3. Publique as funções novas e a migration</p>
            <p className="mt-1">
              <code className="rounded bg-gray-200 px-1 text-[11px]">supabase functions deploy whatsapp-chat whatsapp-webhook</code>
              {' '}e rode o <code className="rounded bg-gray-200 px-1 text-[11px]">supabase/migration-19.sql</code> no
              SQL Editor (habilita o selo de não lidas do menu).
            </p>
          </li>
          <li className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <p className="font-bold text-gray-800">4. (Opcional, recomendado) Ligue o webhook</p>
            <p className="mt-1">
              No painel da sua Evolution, cadastre o webhook da instância com o
              evento <em>Messages Upsert</em> apontando para:
              <code className="mt-1 block break-all rounded bg-gray-200 px-1 text-[11px]">
                https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook?secret=SEU-NOTIFY-SECRET
              </code>
              Assim o selo de mensagens novas sobe na hora, até com o painel fechado.
              Sem o webhook tudo funciona — o painel atualiza sozinho a cada poucos segundos.
            </p>
          </li>
          <li className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
            <p className="font-bold text-gray-800">5. Volte aqui e conecte</p>
            <p className="mt-1">
              Toque em <strong>Atualizar</strong> abaixo e depois em <strong>Conectar</strong>:
              apare o QR no celular da loja (igual WhatsApp Web) e pronto — você está
              respondendo clientes de dentro do painel.
            </p>
          </li>
        </ol>
      )}

      <button type="button" className="btn-soft" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Já configurei — atualizar
      </button>
    </div>
  )
}
