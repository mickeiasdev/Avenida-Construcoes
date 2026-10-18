import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banknote, Ban, Check, ChevronRight, ClipboardList, CreditCard, Download, Eraser, Loader2, MapPin, MessageCircle, Phone, PlusCircle, QrCode, RotateCcw, Search, Store, Trash2, Truck, User } from 'lucide-react'
import { downloadCsv } from '../../lib/csv'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { supabase } from '../../lib/supabaseClient'
import { DELIVERY_LABELS, fulfillmentTotals, PAYMENT_LABELS } from '../../lib/storeOrder'
import { maskCpf } from '../../lib/checkout'
import { waCall } from '../../lib/whatsappChat'
import { formatBRL, formatDateTime, onlyDigits, ORDER_CLS, ORDER_LABELS, ORDER_NEXT_ACTION, ORDER_PIPELINE, ORDER_SHORT } from '../../lib/utils'
import { useStore } from '../../context/StoreContext'


const TABS = [
  { k: 'all', l: 'Todos' },
  { k: 'pending', l: 'Aguardando' },
  { k: 'confirmed', l: 'Confirmados' },
  { k: 'preparing', l: 'Separando' },
  { k: 'shipping', l: 'Em rota' },
  { k: 'delivered', l: 'Entregues' },
  { k: 'cancelled', l: 'Cancelados' },
]

// Lista de pedidos com as ETAPAS DE ENTREGA que o admin avança;
// o cliente acompanha tudo em /pedidos (Realtime em ambos os lados)
export default function OrdersAdmin() {
  const { settings } = useStore()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [search, setSearch] = useState('')
  // Limite de 30 dias da limpeza em lote (atualizado a cada carga, para não
  // ficar congelado numa aba aberta por horas).
  const [limiteAntigos, setLimiteAntigos] = useState(() => Date.now() - 30 * 24 * 3600 * 1000)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(500)   // teto de segurança: o Realtime recarrega a lista a cada evento
    setOrders(data ?? [])
    setLimiteAntigos(Date.now() - 30 * 24 * 3600 * 1000)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('admin-orders-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function advance(o) {
    const idx = ORDER_PIPELINE.indexOf(o.status)
    const next = ORDER_PIPELINE[Math.min(idx + 1, ORDER_PIPELINE.length - 1)]
    setBusyId(o.id)
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', o.id)
    setBusyId(null)
    if (error) { window.alert('Não foi possível avançar o pedido: ' + error.message); return }
    load()
    // Aviso automático no WhatsApp (best-effort: nunca trava o pedido).
    // Sem telefone/número inválido → só um alerta informativo.
    try {
      const res = await waCall('notifyOrder', { orderId: o.id, status: next })
      if (!res.ok) {
        const motivos = {
          'sem-telefone': 'o pedido não tem telefone do cliente',
          'telefone-invalido': 'o telefone está incompleto (sem DDD?)',
          'evolution-recusou': 'o número não existe no WhatsApp',
          'status-sem-aviso': 'esta etapa não tem mensagem automática',
        }
        window.alert('Pedido avançado ✔\nAviso no WhatsApp NÃO enviado: ' + (motivos[res.reason] ?? res.reason ?? 'motivo desconhecido') + '.')
      }
    } catch (e) {
      window.alert('Pedido avançado ✔\nAviso no WhatsApp indisponível agora (' + (e?.message ?? 'erro') + ').')
    }
  }

  async function cancelOrder(o) {
    const ok = await confirm.ask({
      title: 'Cancelar o pedido nº ' + o.id.slice(0, 8) + '?',
      message: 'O cliente já não vê mais andamento. A cancelação pode ser vista no histórico, mas o pedido não volta ao fluxo.',
      confirmLabel: 'Cancelar pedido',
      danger: true,
    })
    if (!ok) return
    setBusyId(o.id)
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', o.id)
    setBusyId(null)
    if (error) { window.alert('Não foi possível cancelar o pedido: ' + error.message); return }
    load()
  }

  // marca (ou desmarca) o item como retirado no balcão / entregue
  async function markItems(ids, value) {
    setBusyId('items')
    const { error } = await supabase.from('order_items').update({ fulfilled_at: value }).in('id', ids)
    setBusyId(null)
    if (error) { window.alert('Não foi possível atualizar: ' + error.message); return }
    load()
  }

  // exclui UM pedido (os itens caem junto pelo "on delete cascade")
  // Aviso rápido ao cliente: abre a conversa no WhatsApp do PAINEL com o
  // texto pronto — é só conferir e enviar (sai pelo número da loja, igual
  // às notificações automáticas da Evolution)
  function avisarCliente(o) {
    const digits = onlyDigits(o.customer_phone ?? '')
    if (!digits) return
    const intl = digits.length <= 11 ? '55' + digits : digits // Brasil
    const etapa = ORDER_LABELS[o.status] ?? o.status
    const texto =
      'Olá, ' + (o.customer_name ?? 'cliente') + '! Aqui é da ' + (settings.store_name ?? 'loja') + '.\n\n' +
      'Atualização do seu pedido nº ' + String(o.id).slice(0, 8) + ': *' + etapa + '*' +
      (o.status === 'pending' ? ' — confirmamos o recebimento e já vamos dar andamento.' : '') +
      (o.status === 'confirmed' ? ' — seu pedido foi confirmado e já está em preparo.' : '') +
      (o.status === 'preparing' ? ' — estamos separando seus itens neste momento.' : '') +
      (o.status === 'shipping' ? ' — saiu para entrega! 🚚' : '') +
      (o.status === 'delivered' ? ' — entrega concluída. ✅ Obrigado pela preferência!' : '') +
      '\n\nQualquer dúvida é só responder por aqui.'
    navigate('/admin/whatsapp?to=' + intl + '&text=' + encodeURIComponent(texto))
  }

  async function removeOrder(o) {
    const ok = await confirm.ask({
      title: 'Excluir o pedido nº ' + o.id.slice(0, 8) + '?',
      message: 'Os itens vão junto e não tem como desfazer.',
      confirmLabel: 'Excluir pedido',
      danger: true,
    })
    if (!ok) return
    setBusyId(o.id)
    const { error } = await supabase.from('orders').delete().eq('id', o.id)
    setBusyId(null)
    if (error) { window.alert('Não foi possível excluir: ' + error.message); return }
    load()
  }

  // limpeza em lote: a lista não cresce para sempre
  async function purge({ label, status, olderThanDays }) {
    const ok = await confirm.ask({
      title: 'Excluir ' + label + '?',
      message: 'Exclusão em lote e permanente — não tem como desfazer.',
      confirmLabel: 'Excluir agora',
      danger: true,
    })
    if (!ok) return
    setBusyId('purge')
    let query = supabase.from('orders').delete().eq('status', status)
    if (olderThanDays) {
      query = query.lt('created_at', new Date(Date.now() - olderThanDays * 24 * 3600 * 1000).toISOString())
    }
    const { error } = await query
    setBusyId(null)
    if (error) { window.alert('Não foi possível excluir: ' + error.message); return }
    load()
  }

  // Exporta todos os pedidos (não só os filtrados) como CSV
  function exportCsv() {
    downloadCsv('pedidos.csv', (orders ?? []).map((o) => ({
      pedido: o.id.slice(0, 8),
      cliente: o.customer_name ?? '',
      telefone: o.customer_phone ?? '',
      cpf: o.customer_cpf ? maskCpf(o.customer_cpf) : '',
      endereco: o.delivery_address ?? '',
      origem: o.origin === 'loja' ? 'Loja' : 'Site',
      entrega: DELIVERY_LABELS[o.delivery_method] ?? o.delivery_method ?? '',
      itens: (o.order_items ?? [])
        .map((i) => i.quantity + 'x ' + i.product_name
          + ((i.fulfillment ?? (o.delivery_method === 'retirada' ? 'retirada' : 'entrega')) === 'retirada'
            ? ' [retirada]' : ' [entrega]'))
        .join(' | '),
      total: Number(o.total),
      status: ORDER_LABELS[o.status] ?? o.status,
      data: new Date(o.created_at).toLocaleString('pt-BR'),
    })))
  }

  const f = search.trim().toLowerCase()
  const visible = (orders ?? []).filter((o) =>
    (tab === 'all' || o.status === tab)
    && (!f
      || (o.customer_name || '').toLowerCase().includes(f)
      || o.id.slice(0, 8).toLowerCase().includes(f)
      || (o.delivery_address || '').toLowerCase().includes(f))
  )

  // quantos pedidos a limpeza em lote removeria agora
  const all = orders ?? []
  const cancelledCount = all.filter((o) => o.status === 'cancelled').length
  const oldDeliveredCount = all.filter(
    (o) => o.status === 'delivered' && new Date(o.created_at).getTime() < limiteAntigos
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pedidos</h1>
          <p className="text-sm text-gray-500">
            Avance as etapas conforme o processo de entrega — o cliente vê cada mudança em tempo real.
            Os itens aparecem separados entre <b>retirada na loja</b> e <b>entrega</b>.
          </p>
        </div>
        <Link to="/admin/nova-venda" className="btn-primary shrink-0">
          <PlusCircle className="h-4 w-4" /> Nova venda na loja
        </Link>
      </div>

      {/* Filtros por etapa */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map(({ k, l }) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={'shrink-0 rounded-lg px-3.5 py-1.5 text-xs ring-1 transition ' +
              (tab === k ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:ring-primary/40')}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Busca + exportação */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-10"
            placeholder="Buscar por cliente, nº do pedido ou endereço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="btn-primary px-4" onClick={exportCsv} disabled={!orders || orders.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </button>
          {cancelledCount > 0 && (
            <button
              type="button"
              disabled={busyId === 'purge'}
              onClick={() => purge({ label: cancelledCount + ' pedido(s) cancelado(s)', status: 'cancelled' })}
              className="btn-soft text-red-500 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Eraser className="h-4 w-4" /> Limpar cancelados ({cancelledCount})
            </button>
          )}
          {oldDeliveredCount > 0 && (
            <button
              type="button"
              disabled={busyId === 'purge'}
              onClick={() => purge({
                label: oldDeliveredCount + ' pedido(s) entregue(s) com mais de 30 dias',
                status: 'delivered',
                olderThanDays: 30,
              })}
              className="btn-soft text-gray-500 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <Eraser className="h-4 w-4" /> Limpar entregues 30+ dias ({oldDeliveredCount})
            </button>
          )}
        </div>
      </div>

      {!orders ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center text-gray-500">
          <ClipboardList className="h-8 w-8 text-gray-300" />
          <p>Nenhum pedido nesta etapa.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((o) => {
            const cancelled = o.status === 'cancelled'
            const done = o.status === 'delivered'
            // pedidos antigos (antes da migration-9) não têm fulfillment por item:
            // cai no modo de entrega do pedido para a separação não mentir
            const itemList = (o.order_items ?? []).map((it) => ({
              ...it,
              fulfillment: it.fulfillment ?? (o.delivery_method === 'retirada' ? 'retirada' : 'entrega'),
            }))
            const totals = fulfillmentTotals(itemList)
            return (
              <div key={o.id} className="card space-y-4">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800">Pedido nº {o.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(o.created_at)}</p>
                  </div>
                  <span className={'rounded-lg px-3 py-1 text-xs font-medium ' + (ORDER_CLS[o.status] ?? ORDER_CLS.pending)}>
                    {ORDER_LABELS[o.status] ?? o.status}
                  </span>
                </div>

                {/* Steper do processo */}
                {!cancelled && <Stepper status={o.status} />}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Cliente */}
                  <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-gray-800">
                      <User className="h-4 w-4 text-gray-500" /> <span className="min-w-0 break-words">{o.customer_name || 'Cliente'}</span>
                    </p>
                    <p className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4 text-gray-500" /> {o.customer_phone || '—'}
                    </p>
                    {o.customer_cpf && (
                      <p className="flex items-center gap-2 text-gray-600">
                        <User className="h-4 w-4 text-gray-500" /> CPF {maskCpf(o.customer_cpf)}
                      </p>
                    )}
                    <p className="flex items-start gap-2 text-gray-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      {o.delivery_method === 'retirada' ? (
                        <span className="font-semibold text-amber-700">Retirada no balcão</span>
                      ) : (
                        <TextoExpansivel
                          className="flex-1"
                          texto={(o.delivery_method === 'misto' ? 'Retirada parcial · ' : '') + (o.delivery_address || '')}
                        />
                      )}
                    </p>
                    <p className="text-[11px] font-medium text-gray-500">
                      {DELIVERY_LABELS[o.delivery_method] ?? o.delivery_method}
                    </p>
                    <p className="flex items-center gap-2 text-gray-600">
                      {o.payment_method === 'dinheiro'
                        ? <Banknote className="h-4 w-4 text-gray-500" />
                        : o.payment_method === 'cartao'
                          ? <CreditCard className="h-4 w-4 text-gray-500" />
                          : <QrCode className="h-4 w-4 text-gray-500" />}
                      <span className="font-semibold text-gray-700">
                        {PAYMENT_LABELS[o.payment_method ?? 'pix'] ?? 'Pix'}
                      </span>
                      {o.origin === 'loja' && (
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                          Venda na loja
                        </span>
                      )}
                      {o.is_guest && (
                        <span className="rounded-lg bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Visitante
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Itens separados por destino: retirada na loja x entrega */}
                  <div className="space-y-3 rounded-lg bg-gray-50 p-3 text-sm">
                    <ItemsPanel totals={totals} onMark={markItems} busy={busyId === 'items'} hideMark={cancelled} />
                    <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-800">
                      <span>Total</span>
                      <span className="text-primary">{formatBRL(o.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Ações do processo */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {done ? (
                      <span className="text-sm font-medium text-green-600">
                        ✓ {o.origin === 'loja' ? 'Venda concluída' : 'Entrega concluída'}
                      </span>
                    ) : cancelled ? (
                      <span className="text-sm font-medium text-red-500">Pedido cancelado</span>
                    ) : (
                      <>
                        <button type="button" className="btn-primary" disabled={busyId === o.id} onClick={() => advance(o)}>
                          {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                          {ORDER_NEXT_ACTION[o.status]}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-500 ring-1 ring-red-200 transition hover:bg-red-50"
                          disabled={busyId === o.id}
                          onClick={() => cancelOrder(o)}
                        >
                          <Ban className="h-4 w-4" /> Cancelar pedido
                        </button>
                      </>
                    )}
                    {o.customer_phone && !cancelled && (
                      <button
                        type="button"
                        title={onlyDigits(o.customer_phone).length < 10
                          ? 'Telefone sem DDD neste pedido — corrija o contato para avisar pelo WhatsApp'
                          : 'Abre a conversa no WhatsApp do painel com a atualização já escrita — é só enviar'}
                        disabled={onlyDigits(o.customer_phone).length < 10}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-bold text-green-700 ring-1 ring-green-300 transition hover:bg-green-100 disabled:opacity-40 disabled:hover:bg-green-50"
                        onClick={() => avisarCliente(o)}
                      >
                        <MessageCircle className="h-4 w-4" /> Avisar cliente
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    disabled={busyId === o.id}
                    onClick={() => removeOrder(o)}
                  >
                    {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* confirmações em popup (cancelar/excluir/lote) */}
      {confirm.dialog}
    </div>
  )
}

function Stepper({ status }) {
  const idx = ORDER_PIPELINE.indexOf(status)
  return (
    <div className="flex items-start gap-1 rounded-lg bg-gray-50 px-2 py-2.5">
      {ORDER_PIPELINE.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div className={'h-0.5 flex-1 rounded ' + (i === 0 ? 'bg-transparent' : i <= idx ? 'bg-primary' : 'bg-gray-200')} />
            <div className={'h-2.5 w-2.5 shrink-0 rounded-full ' + (i <= idx ? 'bg-primary' : 'bg-gray-300')} />
            <div className={'h-0.5 flex-1 rounded ' + (i === ORDER_PIPELINE.length - 1 ? 'bg-transparent' : i < idx ? 'bg-primary' : 'bg-gray-200')} />
          </div>
          <span className={'text-center text-[9px] leading-tight sm:text-[10px] ' + (i <= idx ? 'font-semibold text-primary' : 'text-gray-500')}>
            {ORDER_SHORT[s]}
          </span>
        </div>
      ))}
    </div>
  )
}

// Itens do pedido separados por destino (retirada no balcão x entrega), com o
// "✓" que marca o item como retirado/entregue de verdade.
// No mobile nomes/endereços longos não podem estourar a largura da tela:
// mostra 2 linhas e um 'Mostrar detalhes' que abre o resto empilhado.
function TextoExpansivel({ texto, className = '' }) {
  const [aberto, setAberto] = useState(false)
  const t = String(texto ?? '').trim() || '—'
  const longo = t.length > 38
  return (
    <span className={'block min-w-0 ' + className}>
      <span className={'break-words ' + (longo && !aberto ? 'line-clamp-2' : '')}>{t}</span>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          className="mt-0.5 block text-[11px] font-semibold text-primary hover:underline"
        >
          {aberto ? 'Mostrar menos' : 'Mostrar detalhes'}
        </button>
      )}
    </span>
  )
}

function ItemsPanel({ totals, onMark, busy, hideMark }) {
  const groups = [
    { kind: 'retirada', label: 'Retirada na loja', icon: Store, cls: 'text-amber-700' },
    { kind: 'entrega', label: 'Entrega', icon: Truck, cls: 'text-primary' },
  ]
  return groups
    .filter(({ kind }) => totals[kind].items.length > 0)
    .map(({ kind, label, icon: Icon, cls }) => (
      <div key={kind} className="space-y-1.5">
        <p className={'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ' + cls}>
          <Icon className="h-3.5 w-3.5" /> {label} · {totals[kind].count} un.
        </p>
        {totals[kind].items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 text-gray-600">
              <span className="min-w-0 flex-1">
                <TextoExpansivel texto={it.quantity + '× ' + it.product_name} />
              {it.fulfilled_at && (
                <span className="ml-1.5 text-[10px] font-semibold text-green-600">
                  ✓ {kind === 'retirada' ? 'retirado' : 'entregue'} em {formatDateTime(it.fulfilled_at).slice(0, 10)}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-gray-500">{formatBRL(it.quantity * it.unit_price)}</span>
              {!hideMark && (
                <button
                  type="button"
                  disabled={busy}
                  title={it.fulfilled_at ? 'desfazer' : kind === 'retirada' ? 'marcar como retirado' : 'marcar como entregue'}
                      aria-label={it.fulfilled_at ? 'Desfazer baixa do item' : kind === 'retirada' ? 'Marcar item como retirado' : 'Marcar item como entregue'}
                  onClick={() => onMark([it.id], it.fulfilled_at ? null : new Date().toISOString())}
                  className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 transition disabled:opacity-50 ' +
                    (it.fulfilled_at
                      ? 'text-green-600 ring-green-200 hover:bg-white'
                      : 'text-gray-500 ring-gray-200 hover:bg-white hover:text-green-600')}
                >
                  {it.fulfilled_at ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    ))
}
