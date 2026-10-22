import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Clock, ImagePlus, Loader2, Plus, Save, Target, Trash2, Truck } from 'lucide-react'
import { useStore } from '../../context/StoreContext'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { applyFontScale, FONT_BASE_PX } from '../../lib/brandTheme'
import { supabase, uploadImage, deleteImagesByUrls } from '../../lib/supabaseClient'
import { formatBusinessHoursText, maskCnpj, maskPhone, onlyDigits, waLocal, waNumber } from '../../lib/utils'
import { NICHE_PRESETS } from '../../lib/nichePresets'

const HEX = /^#[0-9a-fA-F]{6}$/

// Presets de tamanho da fonte (mesmos limites da migration-20/banco)
const FONT_OPTIONS = [
  { value: 85, label: 'Compacto', hint: 'cabe mais na tela' },
  { value: 100, label: 'Normal', hint: 'recomendado' },
  { value: 115, label: 'Grande', hint: 'melhor leitura' },
  { value: 130, label: 'Máximo', hint: 'acessibilidade' },
]

export default function Settings() {
  const { settings, updateSettings } = useStore()
  const confirm = useConfirmDialog()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [msg, setMsg] = useState(null)

  // O StoreContext escuta Realtime de store_settings: sem esta trava, uma
  // alteração vinda de outro dispositivo apagava o que estava sendo digitado.
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (dirtyRef.current) return
    setForm({
      store_name: settings.store_name ?? '',
      about: settings.about ?? '',
      address: settings.address ?? '',
      business_hours: settings.business_hours ?? '',
      weekday_open: (settings.weekday_open ?? '07:00').slice(0, 5),
      weekday_close: (settings.weekday_close ?? '18:00').slice(0, 5),
      sat_open: (settings.sat_open ?? '07:00').slice(0, 5),
      sat_close: (settings.sat_close ?? '13:00').slice(0, 5),
      sun_closed: settings.sun_closed ?? true,
      sun_open: settings.sun_open ? settings.sun_open.slice(0, 5) : '',
      sun_close: settings.sun_close ? settings.sun_close.slice(0, 5) : '',
      // No formulário mostramos só DDD + número; o DDI 55 entra no save.
      whatsapp: maskPhone(waLocal(settings.whatsapp)),
      cnpj: settings.cnpj ? maskCnpj(settings.cnpj) : '',
      layout: settings.layout ?? 'loja',
      font_family: settings.font_family ?? 'jakarta',     // editor visual (migration-36)
      radius_style: settings.radius_style ?? 'normal',    // editor visual (migration-36)
      pickup_scheduled: settings.pickup_scheduled ?? false, // retirada com horário
      primary_color: settings.primary_color ?? '#9ca3af',
      secondary_color: settings.secondary_color ?? '#18181b',
      font_scale: settings.font_scale ?? 100,
      daily_goal: settings.daily_goal != null ? String(settings.daily_goal) : '', // meta do dia (migration-30)
      logo_url: settings.logo_url ?? '',
      banner_url: settings.banner_url ?? '',
    })
  }, [settings])

  if (!form) return null

  function set(k, v) {
    dirtyRef.current = true
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Tamanho da fonte: o preview é AO VIVO — a loja e o painel inteiros já
  // escalam no toque. "Salvar configurações" publica para todos os visitantes.
  function setFontScale(value) {
    const pct = Math.min(130, Math.max(80, Math.round(value)))
    set('font_scale', pct)
    applyFontScale(pct)
  }

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
      setMsg({ type: 'err', text: 'As cores devem estar em hexadecimal válido (ex.: #9ca3af).' })
      return
    }
    // configurar a loja muda a vitrine INTEIRA em tempo real — confirma
    const ok = await confirm.ask({
      title: 'Salvar as configurações da loja?',
      message: 'Nome, cores, horários e WhatsApp refletem na vitrine na hora para todos os visitantes.',
      confirmLabel: 'Salvar',
    })
    if (!ok) return
    setBusy(true)
    setMsg(null)
    // business_hours (texto do rodapé) é gerado automaticamente dos seletores
    // Grava no banco no formato esperado pelo app: '55' + DDD + número, só dígitos.
    const payload = {
      ...form,
      whatsapp: waNumber(form.whatsapp),
      // CNPJ gravado em dígitos (o cupom/nota formatam na hora de imprimir)
      cnpj: onlyDigits(form.cnpj) || null,
      business_hours: formatBusinessHoursText(form),
      // meta diária: '' vira 0 (medidor escondido no Dashboard)
      daily_goal: Number(String(form.daily_goal ?? '').replace(',', '.')) || 0,
      pickup_scheduled: Boolean(form.pickup_scheduled),
      font_family: form.font_family === 'inter' ? 'inter' : 'jakarta',
      radius_style: ['normal', 'compact', 'roundy'].includes(form.radius_style) ? form.radius_style : 'normal',
    }
    const { error } = await updateSettings(payload)
    if (!error) {
      dirtyRef.current = false
      // Logo/banner trocados ou removidos: o arquivo antigo sai do Storage
      // (senão ficaria órfão ocupando o armazenamento do projeto)
      const removidas = ['logo_url', 'banner_url']
        .filter((k) => settings[k] && settings[k] !== payload[k])
        .map((k) => settings[k])
      if (removidas.length) await deleteImagesByUrls(removidas)
    }
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

      {/* PRESETS DE NICHO — a loja nasce com a cara do segmento */}
      <section className="card space-y-3">
        <div>
          <h2 className="font-bold text-gray-800">Preset de nicho</h2>
          <p className="text-sm text-gray-500">Escolha o mercado da sua loja: aplicamos cores, layout e slogan prontos. Ajuste tudo depois como quiser.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {NICHE_PRESETS.map((p) => {
            const active = form.primary_color?.toLowerCase() === p.primary_color && form.layout === p.layout
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  dirtyRef.current = true
                  setForm((f) => ({ ...f, primary_color: p.primary_color, secondary_color: p.secondary_color, layout: p.layout, about: p.about }))
                }}
                className={'flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition ' +
                  (active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300')}
                aria-pressed={active}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-lg">{p.emoji}</span>
                  <span className="text-sm font-bold text-gray-800">{p.label}</span>
                </span>
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: p.primary_color }} />
                  <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: p.secondary_color }} />
                </span>
                <span className="text-[11px] leading-tight text-gray-500">{p.desc}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500">O preset muda o formulário acima — toque em <b>Salvar configurações</b> para publicar na vitrine.</p>
      </section>

      {/* IDENTIDADE */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Identidade da loja</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_nome_da_loja">Nome da loja</label>
          <input id="f_nome_da_loja" className="input" required value={form.store_name} onChange={(e) => set('store_name', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_slogan_descricao">Slogan / descrição</label>
          <input id="f_slogan_descricao" className="input" value={form.about} onChange={(e) => set('about', e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">Layout da vitrine</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout da vitrine">
            <button
              type="button"
              onClick={() => set('layout', 'loja')}
              className={'flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition ' +
                (form.layout !== 'cardapio'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-gray-200 hover:border-gray-300')}
            >
              <span className="text-lg">🛍️</span>
              <span className="text-sm font-bold text-gray-800">Loja / E-commerce</span>
              <span className="text-xs text-gray-500">Grid de produtos com banner, categorias e carrinho</span>
            </button>
            <button
              type="button"
              onClick={() => set('layout', 'cardapio')}
              className={'flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition ' +
                (form.layout === 'cardapio'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-gray-200 hover:border-gray-300')}
            >
              <span className="text-lg">🍽️</span>
              <span className="text-sm font-bold text-gray-800">Cardápio</span>
              <span className="text-xs text-gray-500">Menu estilo restaurante com lista por categoria</span>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_cnpj_da_loja_">CNPJ da loja (para o cupom e a nota de venda)</label>
          <input
            id="f_cnpj_da_loja_"
            className="input max-w-xs font-mono"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={form.cnpj}
            onChange={(e) => set('cnpj', maskCnpj(e.target.value))}
          />
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
        <p className="text-xs leading-relaxed text-gray-500">
          Defina as cores da sua vitrine. A cor primária é usada em botões, links e destaques; a secundária é usada em textos e ícones.
          Cores muito claras são escurecidas automaticamente (mantendo o tom) para garantir contraste de leitura — padrão de acessibilidade WCAG AA.
        </p>
      </section>

      {/* TAMANHO DA FONTE DO SISTEMA */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Tamanho da fonte do sistema</h2>
        <div role="radiogroup" aria-label="Tamanho da fonte do sistema" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FONT_OPTIONS.map((o) => {
            const active = form.font_scale === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFontScale(o.value)}
                className={"flex flex-col items-center gap-1 rounded-xl px-3 py-3 ring-1 transition " +
                  + (active
                    ? "bg-primary/5 ring-primary/50"
                    : "bg-white ring-gray-200 hover:bg-gray-50 hover:ring-primary/30")}
              >
                <span
                  aria-hidden="true"
                  className={"font-bold " + (active ? "text-primary" : "text-gray-700")}
                  style={{ fontSize: (FONT_BASE_PX * o.value / 100).toFixed(2) + 'px', lineHeight: 1.1 }}
                >
                  Aa
                </span>
                <span className="text-xs font-medium text-gray-700">{o.value}%</span>
                <span className="text-[11px] text-gray-500">{o.label} · {o.hint}</span>
              </button>
            )
          })}
        </div>

        {/* Preview ao vivo: este texto já muda de tamanho no toque */}
        <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100" aria-hidden="true">
          <p className="text-base font-bold text-gray-800">Cimento CP-II 50kg</p>
          <p className="text-sm text-gray-600">Assim ficam os textos da sua loja: produtos, carrinho, checkout e painel.</p>
          <p className="mt-1 text-sm font-bold text-primary">R$ 28,90</p>
        </div>

        <p className="text-xs leading-relaxed text-gray-500">
          O tamanho escolhido já está sendo aplicado para você (preview ao vivo). Toque em
          <strong> Salvar configurações</strong> para publicar para todos os visitantes — a fonte
          nova aparece na vitrine, no carrinho e no painel, no celular e no computador.
        </p>
      </section>

      {/* EDITOR VISUAL — fonte e cantos (migration-36) */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Editor visual</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="f_font_family" className="mb-1 block text-sm font-medium text-gray-700">Fonte dos textos</label>
            <select
              id="f_font_family"
              className="input"
              value={form.font_family}
              onChange={(e) => set('font_family', e.target.value)}
            >
              <option value="jakarta">Plus Jakarta Sans (atual)</option>
              <option value="inter">Inter (mais neutra)</option>
            </select>
          </div>
          <div>
            <label htmlFor="f_radius_style" className="mb-1 block text-sm font-medium text-gray-700">Cantos das caixas e botões</label>
            <select
              id="f_radius_style"
              className="input"
              value={form.radius_style}
              onChange={(e) => set('radius_style', e.target.value)}
            >
              <option value="normal">Padrão (atual)</option>
              <option value="compact">Retinhos (ferramenta)</option>
              <option value="roundy">Bem arredondados (amigável)</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">O modo escuro é escolha de quem visita (botão na vitrine) — cada cliente vê como preferir.</p>
      </section>

      {/* RETIRADA COM HORÁRIO (migration-36) */}
      <section className="card space-y-3">
        <h2 className="font-bold text-gray-800">Retirada no balcão</h2>
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
            checked={Boolean(form.pickup_scheduled)}
            onChange={(e) => set('pickup_scheduled', e.target.checked)}
          />
          <span>
            <b>Retirada com horário marcado</b> — o cliente escolhe a hora na finalização (slots de 30 min dentro do seu funcionamento).
            <span className="block text-xs text-gray-500">Desligado, a retirada segue como hoje: "buscar quando quiser".</span>
          </span>
        </label>
      </section>

      {/* META DE VENDAS DO DIA (migration-30) */}
      <section className="card space-y-4">
        <h2 className="flex items-center gap-2 font-bold text-gray-800">
          <Target className="h-5 w-5 text-primary" /> Meta de vendas do dia
        </h2>
        <div className="sm:max-w-xs">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_meta_do_dia">Meta diária (R$)</label>
          <input
            id="f_meta_do_dia"
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0 = sem medidor"
            value={form.daily_goal}
            onChange={(e) => set('daily_goal', e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-500">
          O Dashboard mostra o progresso de hoje (vendas entregues) contra a meta — um termômetro simples para o dia da equipe.
        </p>
      </section>

      {/* CONTATO / ENDEREÇO / HORÁRIOS */}
      <section className="card space-y-4">
        <h2 className="font-bold text-gray-800">Contato, endereço e horários</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_whatsapp_de_destino_dos_">WhatsApp de destino dos pedidos (DDD + número)</label>
          <input id="f_whatsapp_de_destino_dos_" className="input" required placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="f_endereco">Endereço</label>
          <input id="f_endereco" className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>

        {/* HORÁRIOS ESTRUTURADOS — a vitrine mostra "Aberto agora" de verdade */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <label className="text-sm font-medium text-gray-700">Horário de funcionamento</label>
          </div>

          <ScheduleRow
            label="Segunda a sexta"
            open={form.weekday_open}
            close={form.weekday_close}
            onOpen={(v) => set('weekday_open', v)}
            onClose={(v) => set('weekday_close', v)}
          />
          <ScheduleRow
            label="Sábado"
            open={form.sat_open}
            close={form.sat_close}
            onOpen={(v) => set('sat_open', v)}
            onClose={(v) => set('sat_close', v)}
          />
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
            <label className="flex flex-1 items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={!form.sun_closed}
                onChange={(e) => set('sun_closed', !e.target.checked)}
              />
              Abre no domingo
            </label>
            {!form.sun_closed && (
              <div className="flex items-center gap-2">
                <input type="time" className="input w-auto px-2 py-1.5" value={form.sun_open} onChange={(e) => set('sun_open', e.target.value)} />
                <span className="text-xs text-gray-500">até</span>
                <input type="time" className="input w-auto px-2 py-1.5" value={form.sun_close} onChange={(e) => set('sun_close', e.target.value)} />
              </div>
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            O banner da loja mostra "Aberto agora" / "Fechado — abre às Xh" automaticamente com base nesses horários.
          </p>
        </div>
        <p className="text-xs text-gray-500">
          O texto exibido no rodapé da vitrine é gerado automaticamente a partir dos horários acima.
        </p>
      </section>

      {/* ZONAS DE ENTREGA (frete por zona — migration-31) */}
      <DeliveryZonesSection />

      {/* FRETE POR FAIXA DE CEP (migration-36) */}
      <CepRangesSection />

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

      {/* confirmação em popup (salvar configurações da loja) */}
      {confirm.dialog}
    </form>
  )
}

// Faixas de CEP (frete por CEP — migration-36): o cliente digita o CEP no
// checkout e a taxa da faixa entra no total (validada de novo no servidor).
// CEP fora das faixas: cotação Melhor Envio (se configurado) ou aviso.
function CepRangesSection() {
  const { reloadCepRanges } = useStore()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [novo, setNovo] = useState({ label: '', cep_start: '', cep_end: '', fee: '', eta: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('delivery_cep_ranges').select('*').order('cep_start')
    if (error) {
      setRows([])
      setMsg({ type: 'err', text: 'Faixas de CEP indisponíveis — rode a migration-36 no Supabase.' })
      return
    }
    setRows(data ?? [])
  }

  function only8(v) { return v.replace(/\D/g, '').slice(0, 8) }

  async function addRange() {
    if (only8(novo.cep_start).length !== 8 || only8(novo.cep_end).length !== 8) {
      setMsg({ type: 'err', text: 'CEP inicial e final precisam de 8 dígitos (ex.: 60000000 a 60999999).' })
      return
    }
    if (only8(novo.cep_start) > only8(novo.cep_end)) {
      setMsg({ type: 'err', text: 'O CEP inicial precisa ser menor que o final.' })
      return
    }
    setBusy(true)
    const { error } = await supabase.from('delivery_cep_ranges').insert({
      label: novo.label.trim() || 'Faixa',
      cep_start: only8(novo.cep_start),
      cep_end: only8(novo.cep_end),
      fee: Math.max(0, Number(String(novo.fee).replace(',', '.')) || 0),
      eta: novo.eta.trim() || null,
      active: true,
    })
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else {
      setNovo({ label: '', cep_start: '', cep_end: '', fee: '', eta: '' })
      setMsg(null)
      reloadCepRanges()
      await load()
    }
  }

  async function removeRange(id) {
    setBusy(true)
    const { error } = await supabase.from('delivery_cep_ranges').delete().eq('id', id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else { reloadCepRanges(); await load() }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-gray-800">
          <Truck className="h-5 w-5 text-primary" /> Frete por faixa de CEP
        </h2>
        <p className="text-sm text-gray-500">
          O cliente digita o CEP no checkout e a taxa da faixa entra no total — sem escolher zona. Use junto ou no lugar das zonas.
          CEP fora das faixas tenta cotação automática do Melhor Envio (se configurado).
        </p>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' + (msg.type === 'ok'
          ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100 sm:grid-cols-[1fr_7rem_7rem_6rem_1fr_auto]">
        <input className="input" placeholder="Nome (ex.: Fortaleza centro)" value={novo.label} onChange={(e) => setNovo({ ...novo, label: e.target.value })} aria-label="Nome da faixa" />
        <input className="input" inputMode="numeric" placeholder="CEP de" value={novo.cep_start} onChange={(e) => setNovo({ ...novo, cep_start: only8(e.target.value) })} aria-label="CEP inicial" />
        <input className="input" inputMode="numeric" placeholder="CEP até" value={novo.cep_end} onChange={(e) => setNovo({ ...novo, cep_end: only8(e.target.value) })} aria-label="CEP final" />
        <input className="input" type="number" min="0" step="0.01" placeholder="Taxa R$" value={novo.fee} onChange={(e) => setNovo({ ...novo, fee: e.target.value })} aria-label="Taxa da faixa" />
        <input className="input" placeholder="Prazo (ex.: 2 dias)" value={novo.eta} onChange={(e) => setNovo({ ...novo, eta: e.target.value })} aria-label="Prazo da faixa" />
        <button type="button" className="btn-primary" onClick={addRange} disabled={busy}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nenhuma faixa cadastrada — o frete por CEP fica desligado.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{r.label}</span>
              <span className="font-mono text-xs text-gray-500">{r.cep_start} → {r.cep_end}</span>
              <span className="font-bold text-primary">R$ {Number(r.fee).toFixed(2).replace('.', ',')}</span>
              {r.eta && <span className="text-xs text-gray-400">{r.eta}</span>}
              <button type="button" className="p-1.5 text-gray-400 transition hover:text-red-500" onClick={() => removeRange(r.id)} aria-label={'Excluir faixa ' + r.label}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Zonas de entrega (frete por zona — migration-31): CRUD independente do
// form principal (tabela própria), com ativar/desativar por zona. Todos os
// botões são type="button" porque vivem DENTRO do <form> das configurações.
function DeliveryZonesSection() {
  const { reloadZones } = useStore()
  const [rows, setRows] = useState(null) // null = carregando
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [novo, setNovo] = useState({ name: '', fee: '', eta: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('delivery_zones').select('*').order('sort')
    if (error) {
      setRows([])
      // tabela ausente = migration-31 ainda não rodou: avisa sem quebrar a página
      setMsg({ type: 'err', text: 'Zonas indisponíveis — rode a migration-31 no Supabase para habilitar o frete por zona.' })
      return
    }
    setRows(data ?? [])
  }

  function setLocal(id, key, value) {
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }

  async function saveZone(z) {
    setBusy(true)
    const { error } = await supabase.from('delivery_zones').update({
      name: String(z.name ?? '').trim() || 'Zona',
      fee: Math.max(0, Number(String(z.fee ?? '').replace(',', '.')) || 0),
      eta: String(z.eta ?? '').trim() || null,
      active: z.active,
    }).eq('id', z.id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao salvar: ' + error.message })
    else {
      setMsg({ type: 'ok', text: 'Zona salva! A vitrine reflete na hora (Realtime).' })
      reloadZones()
    }
  }

  async function removeZone(id) {
    setBusy(true)
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id)
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao excluir: ' + error.message })
    else { reloadZones(); await load() }
  }

  async function addZone() {
    const name = novo.name.trim()
    if (!name) { setMsg({ type: 'err', text: 'Dê um nome para a zona (ex.: Caponga).' }); return }
    setBusy(true)
    const { error } = await supabase.from('delivery_zones').insert({
      name,
      fee: Math.max(0, Number(String(novo.fee).replace(',', '.')) || 0),
      eta: novo.eta.trim() || null,
      active: true,
    })
    setBusy(false)
    if (error) setMsg({ type: 'err', text: 'Erro ao criar: ' + error.message })
    else {
      setNovo({ name: '', fee: '', eta: '' })
      setMsg(null)
      reloadZones()
      await load()
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-gray-800">
          <Truck className="h-5 w-5 text-primary" /> Zonas de entrega (frete)
        </h2>
        <p className="text-sm text-gray-500">
          O cliente escolhe a zona no checkout e vê a taxa e o prazo ANTES de finalizar — menos carrinho abandonado.
        </p>
      </div>

      {msg && (
        <div className={'rounded-lg p-3 text-sm ' + (msg.type === 'ok'
          ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
          : 'bg-red-50 text-red-700 ring-1 ring-red-200')}>
          {msg.text}
        </div>
      )}

      {/* nova zona */}
      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100 sm:grid-cols-[1fr_7rem_1fr_auto]">
        <input className="input" placeholder="Nome (ex.: Caponga)" value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} aria-label="Nome da nova zona" />
        <input className="input" type="number" min="0" step="0.01" placeholder="Taxa R$" value={novo.fee} onChange={(e) => setNovo({ ...novo, fee: e.target.value })} aria-label="Taxa da nova zona" />
        <input className="input" placeholder="Prazo (ex.: hoje)" value={novo.eta} onChange={(e) => setNovo({ ...novo, eta: e.target.value })} aria-label="Prazo da nova zona" />
        <button type="button" className="btn-primary" onClick={addZone} disabled={busy}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          Nenhuma zona cadastrada — a entrega continua "a combinar" (taxa zero no checkout).
        </p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((z) => (
            <div key={z.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_7rem_1fr_auto_auto] sm:items-center">
              <input className="input" value={String(z.name ?? '')} onChange={(e) => setLocal(z.id, 'name', e.target.value)} aria-label={'Nome da zona ' + z.name} />
              <input className="input" type="number" min="0" step="0.01" value={z.fee == null ? '' : String(z.fee)} onChange={(e) => setLocal(z.id, 'fee', e.target.value)} aria-label="Taxa da zona" />
              <input className="input" value={z.eta ?? ''} onChange={(e) => setLocal(z.id, 'eta', e.target.value)} aria-label="Prazo da zona" placeholder="hoje" />
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(z.active)} onChange={(e) => setLocal(z.id, 'active', e.target.checked)} />
                ativa
              </label>
              <div className="flex gap-1">
                <button type="button" className="btn-soft btn-sm" onClick={() => saveZone(z)} disabled={busy}>Salvar</button>
                <button type="button" className="p-2 text-gray-400 transition hover:text-red-500" onClick={() => removeZone(z.id)} aria-label={'Excluir zona ' + z.name}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Linha de horário: label fixo + das Xh às Xh (seletor nativo de hora)
function ScheduleRow({ label, open, close, onOpen, onClose }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
      <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <input type="time" className="input w-auto px-2 py-1.5" value={open} onChange={(e) => onOpen(e.target.value)} />
        <span className="text-xs text-gray-500">até</span>
        <input type="time" className="input w-auto px-2 py-1.5" value={close} onChange={(e) => onClose(e.target.value)} />
      </div>
    </div>
  )
}

function ColorPicker({ label, value, onChange }) {
  const safe = HEX.test(value) ? value : '#000000'
  // useId: o componente aparece duas vezes (primária e secundária) e ids
  // repetidos atrapalhariam justamente quem lê a tela
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          className="input font-mono uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#9ca3af"
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
