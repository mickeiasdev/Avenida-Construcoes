import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Archive, ArrowLeft, Check, ChevronDown, ChevronUp, ClipboardList, Download, ExternalLink, FileText, FolderOpen,
  Image as ImageIcon, Loader2, MessageCircle, Mic, Pause, Pencil, Play, Plus, PlusCircle, Printer, QrCode, RefreshCw, Search, Send,
  Smartphone, Square, Tag, TicketPercent, X, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { waCall, toJid } from '../../lib/whatsappChat'
import { formatBRL, formatDateTime, effectivePrice, hasActivePromo, maskPhone, onlyDigits, ORDER_CLS, ORDER_NEXT_ACTION, ORDER_PIPELINE, ORDER_SHORT, waLocal, waNumber } from '../../lib/utils'
import { PAYMENT_LABELS } from '../../lib/storeOrder'
import { useStore } from '../../context/StoreContext'
import { useModalA11y } from '../../lib/useModalA11y'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { QUICK_THEMES, PRODUCT_TEMPLATES, COUPON_TEMPLATES, OFFERS_TEMPLATES, applyTemplate, pickVariant } from '../../lib/waTemplates'

// ============ WhatsApp da loja, dentro do painel ============
// Mesma sessão da Evolution API (pareada por QR — igual ao WhatsApp Web):
// conversar aqui conversa pelo número da loja, do celular ou do painel.
// Fluxo: lista à esquerda (busca + não lidas) · conversa à direita
// (histórico, respostas rápidas, enviar). No celular: lista → conversa.

// últimos 9 dígitos casam o contato entre banco (com/sem DDI) e JID
const key9 = (phone) => onlyDigits(phone).slice(-9)

const AV_COLORS = ['bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500']

// Foto de perfil do contato no WhatsApp — se já veio no findChats usa direto;
// senão busca UMA vez via action "avatar" (cache por jid). Sem foto → inicial.
const avatarUrlCache = new Map()
function ChatAvatar({ name, seed, jid, url, size = 'h-10 w-10' }) {
  const cached = avatarUrlCache.get(jid)
  const [photo, setPhoto] = useState(url || cached || null)
  const [tried, setTried] = useState(Boolean(url || cached))

  useEffect(() => {
    if (url && !cached) {
      avatarUrlCache.set(jid, url)
      setPhoto(url)
      setTried(true)
    }
  }, [url, jid])

  useEffect(() => {
    if (tried || !jid) return
    setTried(true)
    waCall('avatar', { chat: jid })
      .then((d) => {
        const u = d?.url ?? null
        avatarUrlCache.set(jid, u)
        setPhoto(u)
      })
      .catch(() => {})
  }, [tried, jid])

  const h = [...String(seed ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={size + ' shrink-0 rounded-full object-cover ring-1 ring-gray-200'}
        onError={() => setPhoto(null)}
      />
    )
  }
  return (
    <div className={'flex ' + size + ' shrink-0 items-center justify-center rounded-full font-bold text-white ' + AV_COLORS[h % AV_COLORS.length]}
      aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

// fallback: avatar simples por inicial (modal de nova conversa, sem jid ainda)
function Avatar({ name, seed }) {
  const h = [...String(seed ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white ' + AV_COLORS[h % AV_COLORS.length]}
      aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

// Imagem INLINE na bolha do chat: baixa o base64 via action "media" (lazy,
// cacheia por id) e mostra a foto DENTRO da mensagem — não só um botão.
const inlineImgCache = new Map()
function InlineChatImage({ msg, chat, fromMe, onOpen }) {
  const cached = inlineImgCache.get(msg.id)
  const [src, setSrc] = useState(cached || null)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached || loading === false) return
    waCall('media', { chat, id: msg.id, fromMe: msg.fromMe })
      .then((d) => {
        const url = 'data:' + (d.mimetype ?? 'image/jpeg') + ';base64,' + d.base64
        inlineImgCache.set(msg.id, url)
        setSrc(url)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [msg.id, chat, msg.fromMe, cached, loading])

  if (loading) {
    return (
      <div className={'flex h-32 w-48 items-center justify-center rounded-lg ' + (fromMe ? 'bg-white/10' : 'bg-gray-100')}>
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!src) {
    return (
      <div className={'flex h-20 w-32 items-center justify-center rounded-lg text-xs ' + (fromMe ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-500')}>
        <ImageIcon className="h-5 w-5" />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      className="block overflow-hidden rounded-lg"
      title="Clique para ampliar"
    >
      <img src={src} alt={msg.text || 'Imagem'} className="max-h-56 max-w-full rounded-lg object-cover" />
    </button>
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

// Respostas rápidas automáticas — 10 REDAÇÕES por tema (anti-ban):
// cada clique sorteia uma variação, que o atendente pode editar antes
// de enviar. Os textos usam os dados atuais da loja.
function quickReplies(settings) {
  const vars = {
    loja: settings?.store_name || 'nossa loja',
    endereco: settings?.address ?? '',
    horario: settings?.business_hours || 'veja na loja',
  }
  const themes = [
    { label: '✅ Pedido confirmado', list: QUICK_THEMES.confirmed },
    { label: '📦 Separando itens', list: QUICK_THEMES.preparing },
    { label: '🚚 Saiu p/ entrega', list: QUICK_THEMES.shipping },
    { label: '🎉 Pedido entregue', list: QUICK_THEMES.delivered },
    { label: '📍 Endereço e horário', list: QUICK_THEMES.address },
  ]
  return themes
    .map((t) => ({
      label: t.label,
      variants: t.list.map((text) => applyTemplate(text, vars)).filter(Boolean),
    }))
    .filter((t) => t.variants.length > 0)
}

export default function WhatsAppAdmin() {
  const { settings, updateSettings } = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const confirm = useConfirmDialog()

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
  const [quickOpen, setQuickOpen] = useState(false)   // menu de respostas rápidas
  const quickWrapRef = useRef(null)
  const quickBtnRef = useRef(null)
  const [editRepliesOpen, setEditRepliesOpen] = useState(false)
  // menu "+" (mídia, produto, cupom, ofertas)
  const [plusOpen, setPlusOpen] = useState(false)
  const plusWrapRef = useRef(null)
  const plusBtnRef = useRef(null)
  const filePickRef = useRef(null)
  const fileDocPickRef = useRef(null)
  const [mediaPreview, setMediaPreview] = useState(null) // {mediatype, base64, mimetype, fileName, caption, sizeKB, busy}
  const [productOpen, setProductOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productList, setProductList] = useState(null)
  const [couponOpen, setCouponOpen] = useState(false)
  const [couponList, setCouponList] = useState(null)
  useModalA11y(productOpen, () => setProductOpen(false))
  useModalA11y(couponOpen, () => setCouponOpen(false))
  // central de mídias (mensagens inteiras p/ abas de mídia/arquivo/link)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryTab, setGalleryTab] = useState('midias') // 'midias' | 'arquivos' | 'links'
  const [galleryMsgs, setGalleryMsgs] = useState(null)
  useModalA11y(galleryOpen, () => setGalleryOpen(false))
  // player de áudio / lightbox de imagem / download
  const [lightbox, setLightbox] = useState(null) // { base64, mimetype, busy }
  const audioCacheRef = useRef(new Map()) // id -> dataURL
  const [playingId, setPlayingId] = useState(null)
  const audioElRef = useRef(null)
  // gravação de nota de voz
  const [recording, setRecording] = useState(null) // { stream, recorder, seconds }
  const recTimerRef = useRef(null)
  const [voicePreview, setVoicePreview] = useState(null) // { blob, dataUrl, seconds, busy }
  const recordSecondsRef = useRef(0)
  const [editList, setEditList] = useState([])   // [{ label, text }] em edição
  const [repliesBusy, setRepliesBusy] = useState(false)
  const [repliesMsg, setRepliesMsg] = useState(null)
  useModalA11y(editRepliesOpen, () => setEditRepliesOpen(false))

  // menu de respostas: fora-clique e ESC fecham (foco volta ao botão)
  useEffect(() => {
    if (!quickOpen) return
    const onClick = (e) => { if (!quickWrapRef.current?.contains(e.target)) setQuickOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setQuickOpen(false); quickBtnRef.current?.focus() } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [quickOpen])

  // menu "+" (mesma dinâmica do menu de respostas)
  useEffect(() => {
    if (!plusOpen) return
    const onClick = (e) => { if (!plusWrapRef.current?.contains(e.target)) setPlusOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setPlusOpen(false); plusBtnRef.current?.focus() } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [plusOpen])

  // ---------- "+": enviar imagem (comprimida em base64 — nada no banco) ----------
  async function pickMediaFile(file) {
    if (!file || !activeJid) return
    setError(null)
    if (file.size > 4 * 1024 * 1024) {
      window.alert('Arquivo muito grande (máx. 4 MB). Reduza a imagem ou envie o arquivo por outro canal.')
      return
    }
    if (file.type.startsWith('image/')) {
      // comprime (máx 1280px, JPEG 85%) para caber leve na rede
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result)
        fr.onerror = rej
        fr.readAsDataURL(file)
      })
      const img = new Image()
      img.src = dataUrl
      await new Promise((res) => { img.onload = res; img.onerror = res })
      const max = 1280
      const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round((img.width || 1) * scale)
      canvas.height = Math.round((img.height || 1) * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const out = canvas.toDataURL('image/jpeg', 0.85)
      setMediaPreview({
        mediatype: 'image',
        base64: out.split(',')[1],
        mimetype: 'image/jpeg',
        fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
        url: out,
        caption: '',
        sizeKB: Math.round((out.length * 0.75) / 1024),
      })
    } else {
      // documento (PDF etc): base64 direto
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result)
        fr.onerror = rej
        fr.readAsDataURL(file)
      })
      setMediaPreview({
        mediatype: 'document',
        base64: dataUrl.split(',')[1],
        mimetype: file.type || 'application/octet-stream',
        fileName: file.name,
        caption: '',
        sizeKB: Math.round(file.size / 1024),
      })
    }
  }

  async function sendMediaNow(e) {
    e?.preventDefault()
    const m = mediaPreview
    if (!m || m.busy || !activeJid) return
    setMediaPreview({ ...m, busy: true })
    setError(null)
    try {
      const res = await waCall('sendMedia', {
        chat: activeJid,
        mediatype: m.mediatype,
        mimetype: m.mimetype,
        media: m.base64,
        fileName: m.fileName,
        caption: m.caption || undefined,
      })
      if (res?.ok === false) {
        const motivos = {
          'numero-inexistente': 'o número não está no WhatsApp — confira o contato',
          'evolution-recusou': 'o número não está no WhatsApp — confira o contato',
        }
        window.alert('Mídia NÃO enviada: ' + (motivos[res.reason] ?? res.reason ?? 'motivo desconhecido') + '.')
      } else {
        setMediaPreview(null)
        await loadMessages(activeJid)
        loadChats()
      }
    } catch (e2) {
      window.alert('Falha ao enviar a mídia (' + (e2?.message ?? 'erro') + '). Tente novamente.')
    }
    setMediaPreview((prev) => (prev ? { ...prev, busy: false } : null))
  }

  // ---------- "+": enviar produto da loja (texto + link, 10 variações) ----------
  async function openProductPicker() {
    setPlusOpen(false)
    setProductSearch('')
    setProductList(null)
    setProductOpen(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, price, discount_percent, promo_price, promo_until, stock, active, image_url')
      .eq('active', true)
      .order('name')
      .limit(300)
    setProductList(data ?? [])
  }

  function sendProductDraft(p) {
    const link = window.location.origin + '/produto/' + p.id
    const text = applyTemplate(pickVariant(PRODUCT_TEMPLATES), {
      produto: p.name,
      preco: formatBRL(effectivePrice(p)),
      link,
      loja: settings?.store_name || 'nossa loja',
    })
    setProductOpen(false)
    setDraft(text)
    inputRef.current?.focus()
  }

  // ---------- "+": enviar cupom ativo (10 variações) ----------
  async function openCouponPicker() {
    setPlusOpen(false)
    setCouponList(null)
    setCouponOpen(true)
    const { data } = await supabase
      .from('coupons')
      .select('code, kind, value, min_total, active')
      .eq('active', true)
      .order('code')
      .limit(100)
    setCouponList(data ?? [])
  }

  function sendCouponDraft(c) {
    const desconto = c.kind === 'percent'
      ? Number(c.value) + '% OFF'
      : formatBRL(Number(c.value)) + ' OFF'
    const text = applyTemplate(pickVariant(COUPON_TEMPLATES), {
      codigo: c.code,
      desconto,
      minimo: Number(c.min_total) > 0 ? 'para compras acima de ' + formatBRL(Number(c.min_total)) : 'qualquer valor',
      link: window.location.origin,
    })
    setCouponOpen(false)
    setDraft(text)
    inputRef.current?.focus()
  }

  // ---------- "+": ofertas ativas (promoções no ar, 10 variações) ----------
  async function sendOffersDraft() {
    setPlusOpen(false)
    setError(null)
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, promo_price, promo_until')
        .eq('active', true)
        .not('promo_price', 'is', null)
        .order('views', { ascending: false })
        .limit(60)
      const ofertas = (data ?? []).filter(hasActivePromo).slice(0, 5)
      if (ofertas.length === 0) {
        window.alert('Nenhuma promoção ativa na loja agora. Crie promoções em Painel → Promoções.')
        return
      }
      const itens = ofertas
        .map((p) => '• ' + p.name + ' — ' + formatBRL(Number(p.promo_price)) + ' (era ' + formatBRL(Number(p.price)) + ')')
        .join('\n')
      const text = applyTemplate(pickVariant(OFFERS_TEMPLATES), {
        itens,
        loja: settings?.store_name || 'nossa loja',
        link: window.location.origin + '/?cat=ofertas',
      })
      setDraft(text)
      inputRef.current?.focus()
    } catch (e) {
      setError('Não foi possível carregar as ofertas: ' + (e?.message ?? 'erro'))
    }
  }

  useModalA11y(qrOpen, () => setQrOpen(false))
  useModalA11y(newOpen, () => setNewOpen(false))
  useModalA11y(ordersOpen, () => setOrdersOpen(false))

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const lastInIdRef = useRef('')
  const deepDoneRef = useRef(false)
  const adminKnownRef = useRef(new Set()) // conversas abertas pelo admin nesta sessão
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
      setError(e.message)
      // BLINDAGEM: a Evolution engasgou? A lista NÃO esvazia — mantém o que
      // já está na tela e, se estiver vazia, usa o CACHE da caixa de entrada
      // (tabela whatsapp_chats, atualizada pelo webhook) como reserva.
      setChats((prev) => {
        if ((prev ?? []).length) return prev
        return null // dispara o cache abaixo
      })
      supabase
        .from('whatsapp_chats')
        .select('*')
        .neq('closed', true)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100)
        .then(({ data }) => {
          setChats((prev) => {
            if ((prev ?? []).length) return prev
            return (data ?? []).map((r) => ({
              jid: r.remote_jid,
              phone: r.phone ?? String(r.remote_jid ?? '').split('@')[0],
              known: r.known,
              name: r.name,
              lastText: r.last_message,
              lastAt: r.last_message_at ? Date.parse(r.last_message_at) : null,
              fromMe: r.last_from_me,
              unread: r.unread_count ?? 0,
            }))
          })
        })
        .catch(() => {/* sem cache: segue vazia até a próxima tentativa */})
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

  async function openChat(jid, presetDraft = '', { verify = false } = {}) {
    // verify=true = número veio de DIGITAÇÃO ou de PEDIDO (não de conversa
    // real): a Evolution confirma que existe no WhatsApp antes de abrir.
    if (verify) {
      try {
        const res = await waCall('startChat', { chat: jid, verify: true })
        if (res?.ok === false) {
          window.alert('Este número não está no WhatsApp — confira o DDD e o telefone.')
          return false
        }
      } catch (e) {
        window.alert('Não foi possível confirmar este número agora (' + (e?.message ?? 'erro') + '). Tente novamente.')
        return false
      }
    } else {
      // conversa da lista: só marca como conhecida (já é real)
      waCall('startChat', { chat: jid }).catch(() => null)
    }
    adminKnownRef.current.add(jid)
    setActiveJid(jid)
    setMessages([])
    setDraft(presetDraft)
    setMsgsLoading(true)
    lastInIdRef.current = ''
    await loadMessages(jid, false)
    setMsgsLoading(false)
    return true
  }

  // atalho de fora: /admin/whatsapp?to=5511...&text=... (botão "Avisar cliente")
  useEffect(() => {
    const to = params.get('to')
    if (!boot?.configured || boot.state !== 'open' || !to || deepDoneRef.current) return
    deepDoneRef.current = true
    openChat(toJid(waNumber(to)), params.get('text') ?? '', { verify: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot, params, loadChats, loadMessages])

  // ---------- encerrar atendimento ----------
  // A conversa sai da lista do painel (closed=true). Se o cliente mandar
  // mensagem, o webhook reabre sozinho — nada é apagado.
  async function closeAttendance() {
    if (!activeJid) return
    const who = activeChat ? chatName(activeChat) : maskPhone(waLocal(activeJidPhone))
    const ok = await confirm.ask({
      title: 'Encerrar o atendimento com ' + who + '?',
      message: 'A conversa sai da lista do painel (nada é apagado). Se o cliente mandar mensagem, ela volta sozinha com as não lidas.',
      confirmLabel: 'Encerrar atendimento',
    })
    if (!ok) return
    try {
      await waCall('closeChat', { chat: activeJid })
      setActiveJid(null)
      setMessages([])
      loadChats()
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------- central de mídias / áudio / gravação ----------
  async function openGallery() {
    setGalleryOpen(true)
    setGalleryTab('midias')
    setGalleryMsgs(null)
    try {
      const d = await waCall('messages', { chat: activeJid, count: 100 })
      setGalleryMsgs(d.messages ?? [])
    } catch (e) {
      setGalleryMsgs([])
      setError('Não foi possível carregar a central de mídias: ' + (e?.message ?? 'erro'))
    }
  }

  async function fetchMedia(msg) {
    if (audioCacheRef.current.has(msg.id)) return audioCacheRef.current.get(msg.id)
    const d = await waCall('media', { chat: activeJid, id: msg.id, fromMe: msg.fromMe })
    const url = 'data:' + (d.mimetype ?? 'application/octet-stream') + ';base64,' + d.base64
    audioCacheRef.current.set(msg.id, url)
    return url
  }

  async function playAudio(msg) {
    try {
      if (playingId === msg.id) {
        audioElRef.current?.pause()
        setPlayingId(null)
        return
      }
      const url = await fetchMedia(msg)
      if (!audioElRef.current) {
        audioElRef.current = new Audio()
        audioElRef.current.onended = () => setPlayingId(null)
      }
      audioElRef.current.src = url
      audioElRef.current.play()
      setPlayingId(msg.id)
    } catch (e) {
      window.alert('Não foi possível reproduzir o áudio (' + (e?.message ?? 'erro') + ').')
    }
  }

  async function openImage(msg) {
    setLightbox({ busy: true })
    try {
      const url = await fetchMedia(msg)
      setLightbox({ base64: url })
    } catch (e) {
      setLightbox(null)
      window.alert('Não foi possível abrir a mídia (' + (e?.message ?? 'erro') + ').')
    }
  }

  async function downloadDoc(msg) {
    try {
      const url = await fetchMedia(msg)
      const a = document.createElement('a')
      a.href = url
      a.download = msg.text?.replace(/^📄 /, '') || 'arquivo'
      a.click()
    } catch (e) {
      window.alert('Não foi possível baixar (' + (e?.message ?? 'erro') + ').')
    }
  }

  // ---------- gravação de nota de voz ----------
  async function startRecording() {
    if (!activeJid || recording || voicePreview) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert('Seu navegador não suporta gravação de áudio. Use o Chrome/Edge atualizado.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks = []
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '')
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1000) { setRecording(null); return }
        const seconds = recordSecondsRef.current
        const fr = new FileReader()
        fr.onload = () => setVoicePreview({ blob, dataUrl: fr.result, seconds, busy: false })
        fr.readAsDataURL(blob)
      }
      recorder.start()
      const rec = { stream, recorder, seconds: 0 }
      setRecording(rec)
      recordSecondsRef.current = 0
      recTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1
        setRecording((prev) => (prev ? { ...prev, seconds: recordSecondsRef.current } : prev))
      }, 1000)
    } catch (e) {
      if (String(e?.name) === 'NotAllowedError') {
        window.alert('Permissão de microfone negada. Libere o microfone nas configurações do site para gravar.')
      } else {
        window.alert('Não foi possível acessar o microfone (' + (e?.message ?? 'erro') + ').')
      }
    }
  }

  function stopRecording() {
    if (!recording) return
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    recording.recorder.stop()
    setRecording(null)
  }

  function cancelRecording() {
    if (!recording) return
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    recording.stream.getTracks().forEach((t) => t.stop())
    setRecording(null)
  }

  async function sendVoiceNow() {
    const v = voicePreview
    if (!v || v.busy || !activeJid) return
    setVoicePreview({ ...v, busy: true })
    setError(null)
    try {
      const res = await waCall('sendVoice', { chat: activeJid, audio: v.dataUrl.split(',')[1] })
      if (res?.ok === false) {
        window.alert('Áudio NÃO enviado: o número não está no WhatsApp — confira o contato.')
      } else {
        setVoicePreview(null)
        await loadMessages(activeJid)
        loadChats()
      }
    } catch (e) {
      window.alert('Falha ao enviar o áudio (' + (e?.message ?? 'erro') + '). Tente novamente.')
      setVoicePreview((prev) => (prev ? { ...prev, busy: false } : null))
    }
  }

  // ---------- editor de respostas rápidas ----------
  function openEditReplies() {
    setQuickOpen(false)
    setEditList(Array.isArray(settings?.quick_replies)
      ? settings.quick_replies.map((q) => ({ label: q.label ?? '', text: q.text ?? '' }))
      : [])
    setRepliesMsg(null)
    setEditRepliesOpen(true)
  }

  function setReplyField(i, key, value) {
    setEditList((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  function addReplyRow() {
    setEditList((prev) => [...prev, { label: '', text: '' }])
  }

  async function removeReplyRow(i) {
    const r = editList[i]
    const ok = await confirm.ask({
      title: 'Excluir a resposta "' + (r.label || 'sem título') + '"?',
      message: 'Só sai da sua lista — as respostas automáticas da loja continuam.',
      confirmLabel: 'Excluir resposta',
      danger: true,
    })
    if (!ok) return
    setEditList((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function saveReplies(e) {
    e?.preventDefault()
    const clean = editList
      .map((r) => ({ label: String(r.label ?? '').trim(), text: String(r.text ?? '').trim() }))
      .filter((r) => r.label && r.text)
    if (editList.length && clean.length !== editList.length) {
      setRepliesMsg({ type: 'err', text: 'Preencha o título e o texto de todas as respostas (ou exclua as incompletas).' })
      return
    }
    if (clean.length > 20) {
      setRepliesMsg({ type: 'err', text: 'Máximo de 20 respostas personalizadas.' })
      return
    }
    setRepliesBusy(true)
    setRepliesMsg(null)
    const { error } = await updateSettings({ quick_replies: clean })
    if (error) {
      setRepliesMsg({ type: 'err', text: 'Erro ao salvar: ' + error.message })
    } else {
      setEditRepliesOpen(false)
    }
    setRepliesBusy(false)
  }

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
  // nome exibido: cadastro da loja primeiro (pedidos/clientes); depois o
  // pushName que o proxy já entrega; por último o número (legível)
  const chatName = useCallback((c) => {
    const local = contacts?.byPhone?.get(key9(c.phone))?.name
    if (local) return local
    if (c.name) return 'Cliente - ' + c.name
    if (String(c.jid ?? '').endsWith('@lid')) return 'Cliente - contato WhatsApp'
    return 'Cliente - ' + maskPhone(waLocal(c.phone))
  }, [contacts])

  // A lista mostra TODAS as conversas da loja — quem tem cadastro aparece
  // com o nome do cadastro; sem cadastro, entra o nome do PRÓPRIO WhatsApp
  // do contato (pushName) e, por último, o número. Atendimentos encerrados
  // (closed) não voltam até o cliente mandar mensagem nova.
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

  // ---------- pedidos do contato: detalhes + ações diretas ----------
  const [contactOrders, setContactOrders] = useState([])
  const [detailId, setDetailId] = useState(null)      // pedido expandido
  const [detailItems, setDetailItems] = useState([])  // itens do expandido
  const [detailBusy, setDetailBusy] = useState(false)

  const loadContactOrders = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, status, total, created_at, delivery_address, delivery_method, payment_method')
        .order('created_at', { ascending: false })
        .limit(300)
      const k = key9(activeJidPhone)
      setContactOrders((data ?? []).filter((o) => key9(o.customer_phone) === k))
    } catch { /* modal mostra o que tiver */ }
  }, [activeJidPhone])

  useEffect(() => {
    if (ordersOpen) { loadContactOrders(); setDetailId(null); setDetailItems([]) }
  }, [ordersOpen, loadContactOrders])

  // expandir/fechar os detalhes de um pedido (itens carregam na hora)
  async function toggleDetail(id) {
    if (detailId === id) { setDetailId(null); setDetailItems([]); return }
    setDetailId(id)
    setDetailItems(null) // null = carregando
    const { data } = await supabase.from('order_items').select('*').eq('order_id', id)
    if (detailId === id) setDetailItems(data ?? [])
  }

  // avançar status direto daqui + aviso automático no WhatsApp
  async function advanceOrder(o) {
    const idx = ORDER_PIPELINE.indexOf(o.status)
    const next = ORDER_PIPELINE[Math.min(idx + 1, ORDER_PIPELINE.length - 1)]
    setDetailBusy(true)
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', o.id)
    if (error) { window.alert('Não foi possível atualizar: ' + error.message); setDetailBusy(false); return }
    try {
      const res = await waCall('notifyOrder', { orderId: o.id, status: next })
      if (!res.ok) {
        const motivos = {
          'sem-telefone': 'o pedido não tem telefone do cliente',
          'telefone-invalido': 'o telefone está incompleto (sem DDD?)',
          'numero-inexistente': 'o número não está no WhatsApp — confira o contato',
          'evolution-recusou': 'o número não está no WhatsApp — confira o contato',
        }
        window.alert('Status atualizado ✔\nAviso no WhatsApp NÃO enviado: ' + (motivos[res.reason] ?? res.reason ?? 'motivo desconhecido') + '.')
      }
    } catch (e) {
      const raw = String(e?.message ?? '')
      const causa = /edge function|non-2xx|fetch failed/i.test(raw)
        ? 'serviço de WhatsApp fora do ar agora'
        : /timeout|não respondeu/i.test(raw)
          ? 'a conexão com o WhatsApp não respondeu'
          : (raw || 'erro inesperado')
      window.alert('Status atualizado ✔\nAviso no WhatsApp indisponível: ' + causa + '. Tente de novo mais tarde.')
    }
    await loadContactOrders()
    setDetailBusy(false)
  }
  // respostas do chat: as SUAS (salvas nas configurações, editáveis no
  // menu ⚡) vêm primeiro; as automáticas usam os dados atuais da loja
  const quick = useMemo(() => {
    const mine = Array.isArray(settings?.quick_replies)
      ? settings.quick_replies
          .filter((q) => q && String(q.label ?? '').trim() && String(q.text ?? '').trim())
          .map((q) => ({ label: String(q.label), variants: [String(q.text)] }))
      : []
    return [...mine, ...quickReplies(settings)]
  }, [settings])

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
                      <ChatAvatar name={chatName(c)} seed={c.jid} jid={c.jid} url={c.avatar} />
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
                <div className="hidden flex-col items-center justify-center gap-2 mt-2 px-6 text-center text-gray-400 md:flex">
                  <MessageCircle className="h-10 w-10 text-gray-200" />
                  <p className="text-sm">Selecione uma conversa para começar a responder.</p>
                </div>
              ) : (
                <>
                  {/* cabeçalho da conversa */}
                  <div className="@container flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2.5">
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 md:hidden"
                      onClick={() => setActiveJid(null)}
                      aria-label="Voltar para a lista de conversas"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <ChatAvatar
                      name={chatName(activeChat ?? { jid: activeJid, phone: activeJidPhone })}
                      seed={activeJid}
                      jid={activeJid}
                      url={activeChat?.avatar}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-800">
                        {activeChat ? chatName(activeChat) : 'Nova conversa'}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {activeJid.endsWith('@lid') ? 'WhatsApp (endereço interno)' : maskPhone(waLocal(activeJidPhone))}
                      </p>
                    </div>
                    {/* Botões RÍGIDOS (shrink-0) e compactos; os rótulos só
                        aparecem quando a PRÓPRIA coluna do chat tem espaço
                        (container query) — o nome nunca mais é espremido. */}
                    <button
                      type="button"
                      className="btn-soft min-h-9 shrink-0 px-2.5"
                      onClick={closeAttendance}
                      title="Encerrar atendimento — a conversa sai da lista"
                      aria-label="Encerrar atendimento"
                    >
                      <Archive className="h-4 w-4" />
                      <span className="hidden @min-[30rem]:inline">Encerrar</span>
                    </button>
                    <button
                      type="button"
                      className="btn-soft min-h-9 shrink-0 px-2.5"
                      onClick={() => setOrdersOpen(true)}
                      aria-label={'Pedidos deste cliente: ' + activeOrders.length}
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span className="hidden @min-[30rem]:inline">Pedidos</span>
                      {activeOrders.length > 0 && (
                        <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-white">
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
                    {messages.map((m, i) => {
                      const prev = messages[i - 1]
                      const showDate = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
                      const isToday = new Date(m.at).toDateString() === new Date().toDateString()
                      const isYesterday = (() => {
                        const y = new Date(); y.setDate(y.getDate() - 1)
                        return new Date(m.at).toDateString() === y.toDateString()
                      })()
                      const dateLabel = isToday ? 'HOJE' : isYesterday ? 'ONTEM' : new Date(m.at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
                      const hhmm = new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={m.id}>
                          {showDate && (
                            <div className="my-2 flex justify-center">
                              <span className="rounded-lg bg-gray-200/70 px-3 py-1 text-[11px] font-bold text-gray-600">{dateLabel}</span>
                            </div>
                          )}
                          <div className={'flex ' + (m.fromMe ? 'justify-end' : 'justify-start')}>
                            <div
                              className={'max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-md '
                                + (m.fromMe
                                  ? 'rounded-br-md bg-primary text-white'
                                  : 'rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200')}
                            >
                              {m.type === 'audio' ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full '
                                      + (m.fromMe ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')}
                                    onClick={() => playAudio(m)}
                                    aria-label={playingId === m.id ? 'Pausar áudio' : 'Ouvir áudio'}
                                    title={playingId === m.id ? 'Pausar' : 'Ouvir'}
                                  >
                                    {playingId === m.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                  </button>
                                  <span className={'text-xs ' + (m.fromMe ? 'text-white/80' : 'text-gray-500')}>
                                    {playingId === m.id ? 'Tocando…' : 'Nota de voz'} 🎙️
                                  </span>
                                </div>
                              ) : m.type === 'image' ? (
                                <div className="space-y-1">
                                  <InlineChatImage msg={m} chat={activeJid} fromMe={m.fromMe} onOpen={(src) => setLightbox({ base64: src })} />
                                  {m.text && <p className="whitespace-pre-wrap break-words text-xs">{m.text}</p>}
                                </div>
                              ) : m.type === 'document' ? (
                                <button
                                  type="button"
                                  className={'flex items-center gap-2 ' + (m.fromMe ? 'text-white' : 'text-gray-700')}
                                  onClick={() => downloadDoc(m)}
                                  title="Baixar arquivo"
                                >
                                  <Download className="h-4 w-4" /> {m.text || '📄 Arquivo'}
                                </button>
                              ) : (
                                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              )}
                              <span className={'mt-1 block text-right text-[10px] ' + (m.fromMe ? 'text-white/70' : 'text-gray-400')}>
                                {hhmm}
                                {m.fromMe && <Check className="ml-1 inline h-3 w-3" />}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={bottomRef} />
                  </div>

                  {/* prévia da nota de voz gravada (revisar antes de enviar) */}
                  {voicePreview && (
                    <div className="flex items-center gap-3 border-t border-gray-100 bg-green-50 px-3 py-2.5">
                      <audio src={voicePreview.dataUrl} controls className="h-9 max-w-[55%]" />
                      <span className="text-xs font-semibold text-green-700">{voicePreview.seconds}s</span>
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          className="btn-soft min-h-9 px-3 text-xs"
                          onClick={() => setVoicePreview(null)}
                          disabled={voicePreview.busy}
                        >
                          <X className="h-3.5 w-3.5" /> Descartar
                        </button>
                        <button
                          type="button"
                          className="btn-primary min-h-9 px-3 text-xs"
                          onClick={sendVoiceNow}
                          disabled={voicePreview.busy}
                        >
                          {voicePreview.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Enviar áudio
                        </button>
                      </div>
                    </div>
                  )}

                  {/* inputs de arquivo FORA do dropdown: o menu fecha mas o file picker continua abrindo */}
                  <input
                    ref={filePickRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickMediaFile(f) }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <input
                    ref={fileDocPickRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickMediaFile(f) }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />

                  {/* respostas rápidas (menu ⚡) + envio */}
                  <form onSubmit={handleSend} className="border-t border-gray-100 bg-white">
                    <div className="flex items-end gap-2 p-3">
                      <div className="relative shrink-0" ref={quickWrapRef}>
                        <button
                          ref={quickBtnRef}
                          type="button"
                          onClick={() => setQuickOpen((v) => !v)}
                          aria-haspopup="menu"
                          aria-expanded={quickOpen}
                          title="Respostas rápidas"
                          aria-label="Respostas rápidas"
                          className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-500 ring-1 ring-gray-200 transition hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
                        >
                          <Zap className="h-5 w-5" />
                        </button>

                        {quickOpen && (
                          <div
                            role="menu"
                            aria-label="Respostas rápidas"
                            className="toast-in absolute bottom-full left-0 z-40 mb-2 w-72 max-w-[80vw] rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-gray-200"
                          >
                            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                              Respostas rápidas
                            </p>
                            {quick.map((q) => (
                              <button
                                key={q.label}
                                type="button"
                                role="menuitem"
                                className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition hover:bg-primary/10"
                                onClick={() => { setDraft(pickVariant(q.variants)); setQuickOpen(false); inputRef.current?.focus() }}
                              >
                                <span className="flex items-center gap-2 text-sm font-bold text-primary">
                                  {q.label}
                                  {q.variants.length > 1 && (
                                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                                      {q.variants.length} variações
                                    </span>
                                  )}
                                </span>
                                <span className="line-clamp-2 text-xs leading-snug text-gray-500">{q.variants[0]}</span>
                              </button>
                            ))}
                            <div className="my-1 h-px bg-gray-100" role="presentation" />
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                              onClick={openEditReplies}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Editar respostas…
                            </button>
                          </div>
                        )}
                      </div>

                      {/* botão "+" (mídia, produto, cupom, ofertas) */}
                      <div className="relative shrink-0" ref={plusWrapRef}>
                        <button
                          ref={plusBtnRef}
                          type="button"
                          onClick={() => setPlusOpen((v) => !v)}
                          aria-haspopup="menu"
                          aria-expanded={plusOpen}
                          title="Enviar mídia, produto, cupom ou ofertas"
                          aria-label="Mais opções de envio"
                          className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-500 ring-1 ring-gray-200 transition hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
                        >
                          <Plus className="h-5 w-5" />
                        </button>

                        {plusOpen && (
                          <div
                            role="menu"
                            aria-label="Opções de envio"
                            className="toast-in absolute bottom-full left-0 z-40 mb-2 w-60 rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-gray-200"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-primary/10"
                              onClick={() => { setPlusOpen(false); filePickRef.current?.click() }}
                            >
                              <ImageIcon className="h-4 w-4 text-primary" /> Enviar imagem
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-primary/10"
                              onClick={() => { setPlusOpen(false); fileDocPickRef.current?.click() }}
                            >
                              <FileText className="h-4 w-4 text-primary" /> Enviar arquivo (PDF…)
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-primary/10"
                              onClick={openProductPicker}
                            >
                              <Tag className="h-4 w-4 text-primary" /> Produto da loja
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-primary/10"
                              onClick={openCouponPicker}
                            >
                              <TicketPercent className="h-4 w-4 text-primary" /> Cupom de desconto
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-primary/10"
                              onClick={sendOffersDraft}
                            >
                              <Zap className="h-4 w-4 text-primary" /> Ofertas ativas
                            </button>
                          </div>
                        )}
                      </div>

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
                      {recording ? (
                        <>
                          <button
                            type="button"
                            className="flex h-11 min-w-11 items-center gap-2 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 ring-1 ring-red-200"
                            onClick={cancelRecording}
                            aria-label="Cancelar gravação"
                          >
                            <Square className="h-4 w-4" /> {recording.seconds}s · cancelar
                          </button>
                          <button
                            type="button"
                            className="btn-primary min-h-11 shrink-0 !px-4"
                            onClick={stopRecording}
                            aria-label="Parar e revisar gravação"
                          >
                            <Square className="h-4 w-4" /> Parar
                          </button>
                        </>
                      ) : (
                        <button
                          type="submit"
                          className="btn-primary min-h-11 min-w-11 shrink-0 !px-3"
                          disabled={sending || !draft.trim()}
                          aria-label="Enviar mensagem"
                        >
                          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </button>
                      )}
                      {!recording && !voicePreview && !draft.trim() && (
                        <button
                          type="button"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 ring-1 ring-gray-200 transition hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
                          onClick={startRecording}
                          aria-label="Gravar nota de voz"
                          title="Gravar nota de voz"
                        >
                          <Mic className="h-5 w-5" />
                        </button>
                      )}
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
                onSubmit={async (e) => {
                  e.preventDefault()
                  const d = onlyDigits(newPhone)
                  if (d.length < 10) return
                  const ok = await openChat(toJid(waNumber(d)), '', { verify: true })
                  if (ok) { setNewOpen(false); setNewPhone('') }
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
                            onClick={async () => {
                              const ok = await openChat(toJid(waNumber(phone)), '', { verify: true })
                              if (ok) setNewOpen(false)
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
                <p className="text-xs text-gray-500">{contactOrders.length} pedido{contactOrders.length === 1 ? '' : 's'} neste número</p>
              </div>
              <button type="button" onClick={() => setOrdersOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {contactOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Nenhum pedido da loja para este número.<br />
                  São só conversas de WhatsApp por aqui.
                </p>
              ) : (
                <ul className="space-y-2">
                  {contactOrders.map((o) => {
                    const done = o.status === 'delivered' || o.status === 'cancelled'
                    const nextAction = done ? null : ORDER_NEXT_ACTION[o.status]
                    return (
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

                        <div className="mt-1.5 flex items-center gap-3">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-bold text-primary transition hover:underline"
                            onClick={() => toggleDetail(o.id)}
                          >
                            {detailId === o.id ? <><ChevronUp className="h-3.5 w-3.5" /> Ocultar detalhes</> : <><ChevronDown className="h-3.5 w-3.5" /> Exibir detalhes</>}
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-bold text-gray-400 transition hover:text-primary"
                            title="Imprimir cupom/nota deste pedido"
                            onClick={() => window.open('/imprimir/pedido/' + o.id, '_blank', 'noopener')}
                          >
                            <Printer className="h-3.5 w-3.5" /> Imprimir
                          </button>
                        </div>

                        {detailId === o.id && (
                          <div className="mt-2 rounded-lg bg-white p-3 ring-1 ring-gray-100">
                            {detailItems === null ? (
                              <div className="flex justify-center py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                              </div>
                            ) : (
                              <div className="space-y-2 text-sm">
                                <div className="space-y-1 text-xs text-gray-600">
                                  {(detailItems ?? []).map((it) => (
                                    <div key={it.id} className="flex justify-between gap-2">
                                      <span className="min-w-0 flex-1 truncate">
                                        {it.quantity}× {it.product_name}
                                        {it.fulfillment === 'retirada' ? ' · retirada' : ''}
                                      </span>
                                      <span className="shrink-0 text-gray-400">{formatBRL(Number(it.unit_price) * Number(it.quantity))}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-between border-t border-gray-100 pt-2 text-xs">
                                  <span className="text-gray-500">
                                    {o.delivery_method === 'retirada' ? 'Retirada no balcão' : (o.delivery_address || 'Entrega')}
                                  </span>
                                  <span className="text-gray-500">{PAYMENT_LABELS[o.payment_method] ?? '—'}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                                  <span className="text-sm font-bold text-gray-800">Total</span>
                                  <span className="font-bold text-primary">{formatBRL(o.total)}</span>
                                </div>
                                {nextAction && (
                                  <div className="border-t border-gray-100 pt-2.5">
                                    <button
                                      type="button"
                                      className="btn-primary w-full py-2 text-xs"
                                      onClick={() => advanceOrder(o)}
                                      disabled={detailBusy}
                                    >
                                      {detailBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                      {nextAction} (avisa o cliente)
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
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

      {/* ============ modal: editar respostas rápidas ============ */}
      {editRepliesOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar respostas rápidas"
            className="toast-in flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Respostas rápidas</h2>
                <p className="text-xs text-gray-500">As suas respostas aparecem antes das automáticas no menu ⚡.</p>
              </div>
              <button type="button" onClick={() => setEditRepliesOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* automáticas da loja (somem leitura): usam as config da loja */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Da loja · automáticas</p>
                <p className="mt-1 text-xs text-gray-500">
                  Estas usam os dados das configurações (nome, endereço, horário) e se atualizam sozinhas — não são editáveis aqui.
                  Cada tema tem <strong>10 redações</strong>: a cada clique o chat sorteia uma, evitando mensagens idênticas em sequência (proteção anti-ban).
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickReplies(settings).map((q) => (
                    <span key={q.label} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {q.label} <span className="font-bold text-gray-400">· {q.variants.length} variações</span>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Suas respostas</p>
                <div className="mt-2 space-y-3">
                  {editList.length === 0 && (
                    <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 ring-1 ring-gray-100">
                      Nenhuma resposta personalizada ainda. Crie a primeira — ex.: "Entrega hoje mesmo 🚚".
                    </p>
                  )}
                  {editList.map((r, i) => (
                    <div key={i} className="space-y-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                      <div className="flex items-center gap-2">
                        <input
                          className="input py-1.5 text-sm"
                          placeholder="Título (ex.: Entrega hoje)"
                          value={r.label}
                          onChange={(e) => setReplyField(i, 'label', e.target.value)}
                          maxLength={40}
                          aria-label={'Título da resposta ' + (i + 1)}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          onClick={() => removeReplyRow(i)}
                          aria-label={'Excluir resposta ' + (r.label || (i + 1))}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        className="input min-h-16 resize-none py-2 text-sm"
                        placeholder="Texto que vai para o cliente…"
                        value={r.text}
                        onChange={(e) => setReplyField(i, 'text', e.target.value)}
                        maxLength={600}
                        aria-label={'Texto da resposta ' + (i + 1)}
                      />
                    </div>
                  ))}
                  <button type="button" className="btn-soft w-full" onClick={addReplyRow}>
                    <Plus className="h-4 w-4" /> Adicionar resposta
                  </button>
                </div>
              </div>

              {repliesMsg && (
                <div className={'rounded-lg p-3 text-sm ' +
                  (repliesMsg.type === 'err'
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : 'bg-green-50 text-green-700 ring-1 ring-green-200')}>
                  {repliesMsg.text}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-5 py-3">
              <button type="button" className="btn-primary w-full" onClick={() => saveReplies()} disabled={repliesBusy}>
                {repliesBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar respostas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: prévia da mídia antes de enviar ============ */}
      {mediaPreview && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enviar mídia"
            className="toast-in flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {mediaPreview.mediatype === 'image' ? 'Enviar imagem' : 'Enviar arquivo'}
              </h2>
              <button type="button" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" onClick={() => setMediaPreview(null)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {mediaPreview.mediatype === 'image' ? (
              <img src={mediaPreview.url} alt="Prévia da imagem" className="mx-auto max-h-56 rounded-xl ring-1 ring-gray-200" />
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                <FileText className="h-8 w-8 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{mediaPreview.fileName}</p>
                  <p className="text-xs text-gray-500">{mediaPreview.sizeKB} KB</p>
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="field-label" htmlFor="mp_caption">Legenda (opcional)</label>
              <input
                id="mp_caption"
                className="input"
                maxLength={300}
                placeholder={mediaPreview.mediatype === 'image' ? 'Ex.: Foto do produto' : 'Ex.: Orçamento em anexo'}
                value={mediaPreview.caption}
                onChange={(e) => setMediaPreview((prev) => ({ ...prev, caption: e.target.value }))}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-soft" onClick={() => setMediaPreview(null)} disabled={mediaPreview.busy}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={() => sendMediaNow()} disabled={mediaPreview.busy}>
                {mediaPreview.busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" /> Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: seletor de produto da loja ============ */}
      {productOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enviar produto da loja"
            className="toast-in flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Produto da loja</h2>
                <p className="text-xs text-gray-500">Escolha um produto — enviamos nome, preço e link com 10 redações sorteadas.</p>
              </div>
              <button type="button" onClick={() => setProductOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-10"
                  placeholder="Buscar produto…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  aria-label="Buscar produto"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {productList === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : (() => {
                const f = productSearch.trim().toLowerCase()
                const visible = (productList ?? []).filter((p) => !f || p.name.toLowerCase().includes(f)).slice(0, 30)
                if (visible.length === 0) return <p className="py-10 text-center text-sm text-gray-500">Nenhum produto encontrado.</p>
                return (
                  <ul className="divide-y divide-gray-50">
                    {visible.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-gray-50"
                          onClick={() => sendProductDraft(p)}
                        >
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                              <Tag className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{p.name}</span>
                          <span className="shrink-0 text-xs font-bold text-primary">{formatBRL(effectivePrice(p))}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: seletor de cupom ativo ============ */}
      {couponOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enviar cupom de desconto"
            className="toast-in flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Cupom de desconto</h2>
                <p className="text-xs text-gray-500">Envia o código com instruções — 10 redações sorteadas.</p>
              </div>
              <button type="button" onClick={() => setCouponOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {couponList === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : (couponList ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  Nenhum cupom ativo na loja.<br />Crie em Painel → Cupons.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(couponList ?? []).map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-gray-50"
                        onClick={() => sendCouponDraft(c)}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <TicketPercent className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm font-bold text-gray-800">{c.code}</p>
                          <p className="text-xs text-gray-500">
                            {c.kind === 'percent' ? Number(c.value) + '% OFF' : formatBRL(Number(c.value)) + ' OFF'}
                            {Number(c.min_total) > 0 ? ' · mín. ' + formatBRL(Number(c.min_total)) : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ modal: central de mídias/arquivos/links ============ */}
      {galleryOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mídias, arquivos e links"
            className="toast-in flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-800">Mídias, arquivos e links</h2>
              <button type="button" onClick={() => setGalleryOpen(false)} aria-label="Fechar" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1.5 px-5 pt-3">
              {[
                { k: 'midias', l: '🖼️ Mídias' },
                { k: 'arquivos', l: '📎 Arquivos' },
                { k: 'links', l: '🔗 Links' },
              ].map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setGalleryTab(t.k)}
                  className={'rounded-full px-3.5 py-1.5 text-xs font-bold transition ' +
                    (galleryTab === t.k ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700')}
                >
                  {t.l}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {galleryMsgs === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : (() => {
                if (galleryTab === 'links') {
                  const links = []
                  for (const m of galleryMsgs ?? []) {
                    const urls = String(m.text ?? '').match(/https?:\/\/[^\s]+/g) ?? []
                    for (const u of urls) links.push({ url: u, at: m.at, fromMe: m.fromMe })
                  }
                  if (links.length === 0) return <p className="py-10 text-center text-sm text-gray-500">Nenhum link trocado nesta conversa.</p>
                  return (
                    <ul className="space-y-2">
                      {[...links].reverse().slice(0, 50).map((l, i) => (
                        <li key={i} className="flex items-center gap-2.5 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                          <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                          >
                            {l.url}
                          </a>
                          <span className="shrink-0 text-[10px] text-gray-400">
                            {new Date(l.at).toLocaleDateString('pt-BR')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                }
                const want = galleryTab === 'midias' ? ['image', 'video'] : ['document']
                const list = (galleryMsgs ?? []).filter((m) => want.includes(m.type)).reverse().slice(0, 60)
                if (list.length === 0) {
                  return (
                    <p className="py-10 text-center text-sm text-gray-500">
                      {galleryTab === 'midias' ? 'Nenhuma imagem ou vídeo trocado ainda.' : 'Nenhum arquivo trocado ainda.'}
                    </p>
                  )
                }
                if (galleryTab === 'midias') {
                  return (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {list.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => openImage(m)}
                          className="flex aspect-square items-center justify-center rounded-xl bg-gray-100 ring-1 ring-gray-200 transition hover:ring-primary/50"
                          title="Abrir"
                        >
                          <span className="text-lg">{m.type === 'video' ? '🎥' : '🖼️'}</span>
                        </button>
                      ))}
                    </div>
                  )
                }
                return (
                  <ul className="space-y-2">
                    {list.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-primary hover:underline" onClick={() => downloadDoc(m)}>
                          {m.text?.replace(/^[\u{1F4C4}]\s*/u, '') || 'Arquivo'}
                        </button>
                        <span className="shrink-0 text-[10px] text-gray-400">{new Date(m.at).toLocaleDateString('pt-BR')}</span>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* lightbox de imagem/vídeo baixado da Evolution */}
      {lightbox?.base64 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.base64} alt="Mídia da conversa" className="max-h-[85dvh] max-w-full rounded-xl ring-1 ring-white/20" />
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Fechar"
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-2 text-white hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      {lightbox && !lightbox.base64 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}

      {/* confirmações (encerrar atendimento) */}
      {confirm.dialog}
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
