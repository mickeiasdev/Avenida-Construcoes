import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, MapPin, MessageCircle, Minus, Plus, ShoppingBag, Trash2, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/utils'
import { CheckoutForm, profileToForm, missingFields, fieldLabel } from '../components/CheckoutForm'

// Carrinho + checkout: form com as informações essenciais. Os campos
// obrigatórios têm validação — NÃO é possível finalizar com campos
// vazios: o pedido só sai quando os dados de entrega estiverem completos.
export default function Cart() {
  const { profile } = useAuth()
  const { items, count, total, updateQuantity, removeItem, checkout } = useCart()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [missing, setMissing] = useState(null) // campos faltando → abre o popup

  // preenche o form com os dados salvos no perfil (carrega automaticamente)
  useEffect(() => { setForm(profileToForm(profile)) }, [profile])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    // o campo deixa de ser "faltando" assim que é preenchido
    setMissing((prev) => (prev ? prev.filter((k) => k !== key) : null))
  }

  // VALIDAÇÃO: sem os dados obrigatórios o pedido não sai, em nenhuma hipótese
  function handleClickFinalizar() {
    const miss = missingFields(form)
    if (miss.length > 0) {
      setMissing(miss)
      return
    }
    handleCheckout()
  }

  async function handleCheckout() {
    setBusy(true)
    setMsg(null)
    try {
      await checkout(form)
      navigate('/pedidos')
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function preencherAgora() {
    const first = missing?.[0]
    setMissing(null)
    if (first) {
      const el = document.getElementById('f_' + first)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => el?.focus(), 350)
    }
  }

  if (items.length === 0) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center text-gray-500">
        <ShoppingBag className="h-10 w-10 text-gray-300" />
        <p className="font-medium">Seu carrinho está vazio</p>
        <Link to="/" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">
        Carrinho <span className="text-sm font-normal text-gray-400">({count} item/ns)</span>
      </h1>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        {/* ============ ITENS ============ */}
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.product_id} className="card flex items-center gap-3">
              <img src={i.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800">{i.name}</p>
                <p className="text-xs text-gray-400">{formatBRL(i.price)} / un</p>
              </div>
              <div className="flex items-center rounded-lg ring-1 ring-gray-200">
                <button type="button" className="p-2 hover:bg-gray-50" aria-label="Diminuir" onClick={() => updateQuantity(i.product_id, i.quantity - 1)}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-9 text-center text-sm font-medium">{i.quantity}</span>
                <button type="button" className="p-2 hover:bg-gray-50" aria-label="Aumentar" onClick={() => updateQuantity(i.product_id, Math.min(i.stock ?? 999, i.quantity + 1))}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <span className="w-20 shrink-0 text-right font-semibold text-gray-700">{formatBRL(i.price * i.quantity)}</span>
              <button type="button" className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover" onClick={() => removeItem(i.product_id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* ============ FORM DE ENTREGA (no lugar do resumo) ============ */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-bold text-gray-800">Dados para entrega</h2>
              <p className="text-xs text-gray-400">Já preenchemos com os dados da sua conta</p>
            </div>
          </div>

          {form && <CheckoutForm form={form} set={set} missing={missing} />}

          {msg && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{msg.text}</div>
          )}

          <div className="space-y-1.5 border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal ({count} itens)</span><span>{formatBRL(total)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-800">
              <span>Total</span><span className="text-primary">{formatBRL(total)}</span>
            </div>
          </div>

          <button type="button" className="btn-primary w-full" disabled={busy} onClick={handleClickFinalizar}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {busy ? 'Processando...' : 'Finalizar pedido via WhatsApp'}
          </button>

          <p className="text-[11px] leading-relaxed text-gray-400">
            Os campos com * são obrigatórios — o pedido só é enviado com os dados de entrega completos.
          </p>
        </div>
      </div>

      {/* ============ POPUP: DADOS INCOMPLETOS (finalização bloqueada) ============ */}
      {missing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setMissing(null)}>
          <div className="toast-in w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <User className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-gray-800">Não é possível finalizar sem os dados de entrega</p>
                <p className="text-sm text-gray-500">Preencha os campos destacados para enviar o pedido.</p>
              </div>
            </div>

            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              {missing.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  {fieldLabel(k)}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={preencherAgora}>
                Atualizar dados agora
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-white px-4 py-2.5 font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50"
                onClick={() => setMissing(null)}
              >
                Preencher depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
