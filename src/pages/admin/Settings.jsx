import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, ImagePlus, Loader2, Save } from 'lucide-react'
import { useStore } from '../../context/StoreContext'
import { uploadImage } from '../../lib/supabaseClient'

const HEX = /^#[0-9a-fA-F]{6}$/

export default function Settings() {
  const { settings, updateSettings } = useStore()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    setForm({
      store_name: settings.store_name ?? '',
      about: settings.about ?? '',
      address: settings.address ?? '',
      business_hours: settings.business_hours ?? '',
      whatsapp: settings.whatsapp ?? '',
      primary_color: settings.primary_color ?? '#f97316',
      secondary_color: settings.secondary_color ?? '#1e293b',
      logo_url: settings.logo_url ?? '',
      banner_url: settings.banner_url ?? '',
    })
  }, [settings])

  if (!form) return null

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleUpload(e, key) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(key)
    setMsg(null)
    try {
      const url = await uploadImage(file, 'branding')
      set(key, url)
    } catch (err) {
      setMsg({ type: 'err', text: 'Falha no upload: ' + err.message })
    } finally {
      setUploading('')
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!HEX.test(form.primary_color) || !HEX.test(form.secondary_color)) {
      setMsg({ type: 'err', text: 'As cores devem estar em hexadecimal válido (ex.: #f97316).' })
      return
    }
    setBusy(true)
    setMsg(null)
    const { error } = await updateSettings(form)
    setMsg(error
      ? { type: 'err', text: 'Erro: ' + error.message }
      : { type: 'ok', text: 'Configurações salvas! A vitrine reflete as mudanças em tempo real (Realtime).' })
    setBusy(false)
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Personalização visual</h1>
        <p className="text-sm text-gray-500">Nome, logo, banner, cores, endereço e WhatsApp da loja.</p>
      </div>

      {/* IDENTIDADE */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Identidade da loja</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome da loja</label>
          <input className="input" required value={form.store_name} onChange={(e) => set('store_name', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Slogan / descrição</label>
          <input className="input" value={form.about} onChange={(e) => set('about', e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadBox
            label="Logo"
            url={form.logo_url}
            uploading={uploading === 'logo_url'}
            onUpload={(e) => handleUpload(e, 'logo_url')}
            onClear={() => set('logo_url', '')}
            preview="contain"
          />
          <UploadBox
            label="Banner principal"
            url={form.banner_url}
            uploading={uploading === 'banner_url'}
            onUpload={(e) => handleUpload(e, 'banner_url')}
            onClear={() => set('banner_url', '')}
            preview="cover"
          />
        </div>
      </section>

      {/* CORES DINÂMICAS */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Cores do tema (hexadecimal)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorPicker label="Cor primária" value={form.primary_color} onChange={(v) => set('primary_color', v)} />
          <ColorPicker label="Cor secundária" value={form.secondary_color} onChange={(v) => set('secondary_color', v)} />
        </div>
        <p className="text-xs leading-relaxed text-gray-400">
          Aplicadas via variáveis CSS (--brand-primary / --brand-secondary), que o Tailwind consome através do
          bloco <code>@theme inline</code> em <code>index.css</code>. Sem rebuild — a mudança é instantânea.
        </p>
      </section>

      {/* CONTATO / ENDEREÇO / HORÁRIOS */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Contato, endereço e horários</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp de destino dos pedidos (DDI + DDD + número)</label>
          <input className="input" required placeholder="5511999999999" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Endereço</label>
          <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Horário de funcionamento</label>
          <input className="input" value={form.business_hours} onChange={(e) => set('business_hours', e.target.value)} />
        </div>
      </section>

      {msg && (
        <div className={'flex items-start gap-2 rounded-lg p-3 text-sm ' +
          (msg.type === 'ok' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
          {msg.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </button>
      </div>
    </form>
  )
}

function ColorPicker({ label, value, onChange }) {
  const safe = HEX.test(value) ? value : '#000000'
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="input font-mono uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#f97316"
        />
      </div>
    </div>
  )
}

function UploadBox({ label, url, uploading, onUpload, onClear, preview }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
          {url ? (
            <img
              src={url}
              alt=""
              className={'h-full w-full ' + (preview === 'contain' ? 'object-contain' : 'object-cover')}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300"><ImagePlus className="h-5 w-5" /></div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="btn-primary cursor-pointer px-3 py-1.5 text-xs">
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? 'Enviando...' : 'Enviar imagem'}
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </label>
          {url && (
            <button type="button" className="text-left text-xs text-red-500 hover:underline" onClick={onClear}>
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
