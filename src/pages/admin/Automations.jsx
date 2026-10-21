import { useCallback, useEffect, useState } from 'react'
import { Bell, Loader2, MessageCircle, ShoppingBag, Timer } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../context/StoreContext'
import { formatBRL, formatDateTime, waNumber } from '../../lib/utils'

// Automações de WhatsApp (v1 sem disparo automático): o painel APONTA quem
// acionar e o lojista confirma com 1 clique — abre o WhatsApp com a
// mensagem pronta. Sem spam sem controle; a loja decide o tom.
//
// 1) CARRINHOS ABANDONADOS (migration-35): sacolas paradas > 2h com contato;
// 2) PÓS-ENTREGA: pedido entregue há 3+ dias sem follow-up → pesquisa de satisfação;
// 3) RECOMPRA: cliente sem compra entregue há 15+ dias → convite para repetir.
export default function Automations() {
  const { settings } = useStore()
  const [loading, setLoading] = useState(true)
  const [carts, setCarts] = useState([])
  const [followups, setFollowups] = useState([])
  const [rebuy, setRebuy] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()

      // carrinhos abandonados: snapshot com itens, parado a > 2h
      const { data: snap } = await supabase
        .from('cart_snapshots')
        .select('device_id, user_id, phone, items, total, updated_at')
        .lt('updated_at', twoHoursAgo)
        .order('updated_at', { ascending: false })
        .limit(100)
      const liveCarts = (snap ?? []).filter((c) => Array.isArray(c.items) && c.items.length > 0)
      // nome de quem logou (visita anônima segue sem nome)
      const ids = liveCarts.map((c) => c.user_id).filter(Boolean)
      const names = new Map()
      if (ids.length) {
        const { data: prof } = await supabase.from('profiles').select('id, full_name, phone').in('id', [...new Set(ids)])
        for (const p of prof ?? []) names.set(p.id, p)
      }
      setCarts(liveCarts.map((c) => ({
        ...c,
        items: c.items,
        itemCount: c.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
        name: names.get(c.user_id)?.full_name ?? null,
        phone: c.phone ?? names.get(c.user_id)?.phone ?? null,
      })))

      // pós-entrega: entregue há 3+ dias, sem follow-up ainda
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
      const { data: del } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, total, created_at, followup_sent_at')
        .eq('status', 'delivered')
        .lt('created_at', threeDaysAgo)
        .is('followup_sent_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      setFollowups((del ?? []).filter((o) => o.customer_phone))

      // recompra: última entrega por telefone há 15+ dias
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString()
      const { data: last } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, total, created_at')
        .eq('status', 'delivered')
        .lt('created_at', fifteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(1000)
      const byPhone = new Map()
      for (const o of last ?? []) {
        if (!o.customer_phone) continue
        if (!byPhone.has(o.customer_phone)) byPhone.set(o.customer_phone, o)
      }
      setRebuy([...byPhone.values()].slice(0, 50))
    } catch (e) {
      setMsg({ type: 'err', text: 'Falha ao carregar: ' + (e?.message ?? e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function waLink(phone, text) {
    const num = waNumber(phone)
    if (!num) return null
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text)
  }

  async function markFollowup(o) {
    setBusyId(o.id)
    const { error } = await supabase
      .from('orders')
      .update({ followup_sent_at: new Date().toISOString() })
      .eq('id', o.id)
    setBusyId(null)
    if (error) setMsg({ type: 'err', text: 'Não foi possível marcar: ' + error.message })
    else setFollowups((fs) => fs.filter((f) => f.id !== o.id))
  }

  const storeName = settings.store_name ?? 'sua loja'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Automações de WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Quem acionar hoje — a mensagem abre PRONTA no WhatsApp; 1 clique envia. O disparo é sempre seu, nunca automático.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</p>}
      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      {!loading && (
        <>
          {/* ===== CARRINHOS ABANDONADOS ===== */}
          <section className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <ShoppingBag className="h-5 w-5 text-primary" /> Carrinhos abandonados
              {carts.length > 0 && <span className="badge-count">{carts.length}</span>}
            </h2>
            <p className="text-xs text-gray-500">Sacolas paradas há mais de 2h. Sem telefone = não dá para chamar (fica só como dado).</p>
            {carts.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nenhum carrinho abandonado agora — boa sinal! 🎉</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {carts.slice(0, 20).map((c) => {
                  const link = c.phone ? waLink(c.phone,
                    'Olá' + (c.name ? ', ' + String(c.name).split(' ')[0] : '') + '! 👋 Vi que você deixou uns itens no carrinho da ' + storeName +
                    ' (' + c.itemCount + ' produto(s), ' + formatBRL(c.total) + '). Quer que eu reserve pra você? Podemos combinar a entrega por aqui!') : null
                  return (
                    <div key={c.device_id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                        {c.name ?? 'Visitante'}
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          {c.itemCount} item(ns) · {formatBRL(c.total)} · {formatDateTime(c.updated_at)}
                        </span>
                      </span>
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                          <MessageCircle className="h-3.5 w-3.5" /> Recuperar
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">sem contato</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ===== PÓS-ENTREGA ===== */}
          <section className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <Bell className="h-5 w-5 text-primary" /> Pesquisa pós-entrega
              {followups.length > 0 && <span className="badge-count bg-amber-500">{followups.length}</span>}
            </h2>
            <p className="text-xs text-gray-500">Entregues há 3+ dias sem follow-up. O clique marca como enviado.</p>
            {followups.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nenhum follow-up pendente.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {followups.map((o) => {
                  const link = waLink(o.customer_phone,
                    'Olá, ' + String(o.customer_name ?? '').split(' ')[0] + '! Seu pedido #' + String(o.id).slice(0, 8) +
                    ' da ' + storeName + ' foi entregue — a experiência foi boa? Se quiser, já deixo o contato salvo pra próxima obra. 💪')
                  return (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                        {o.customer_name ?? 'Cliente'}
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          #{String(o.id).slice(0, 8)} · {formatBRL(o.total)} · {formatDateTime(o.created_at)}
                        </span>
                      </span>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="btn-primary btn-sm" onClick={() => markFollowup(o)}>
                          {busyId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                          Enviar pesquisa
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ===== RECOMPRA ===== */}
          <section className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-800">
              <Timer className="h-5 w-5 text-primary" /> Convite de recompra
              {rebuy.length > 0 && <span className="badge-count">{rebuy.length}</span>}
            </h2>
            <p className="text-xs text-gray-500">Clientes sem entrega há 15+ dias — a hora certa de aparecer de novo.</p>
            {rebuy.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Ninguém esquecido por aqui. 🎉</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {rebuy.map((o) => {
                  const link = waLink(o.customer_phone,
                    'Olá, ' + String(o.customer_name ?? '').split(' ')[0] + '! Faz um tempinho desde a última compra na ' + storeName +
                    ' — está precisando de material para uma nova obra? Posso separar tudo e combinar a entrega. 😉')
                  return (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                        {o.customer_name ?? 'Cliente'}
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          última compra {formatDateTime(o.created_at)} · {formatBRL(o.total)}
                        </span>
                      </span>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="btn-soft btn-sm">
                          <MessageCircle className="h-3.5 w-3.5" /> Chamar
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
