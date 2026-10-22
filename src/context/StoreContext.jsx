import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { applyBrand, applyFontScale, readCachedBrand, writeCachedBrand } from '../lib/brandTheme'
import { slugify } from '../lib/utils'

const StoreContext = createContext(null)

// Defaults (usados antes do primeiro load ou se o seed ainda nao rodou)
const DEFAULT_SETTINGS = {
  id: 1,
  store_name: 'Avenida Construção',
  logo_url: null,
  banner_url: '', // vazio até o banco responder — um default externo "piscava" na vitrine; sem banner a Home mostra só o degradê da marca
  primary_color: '#9ca3af',  // cinza claro — padrão neutro (lojista troca no painel)
  secondary_color: '#18181b', // cinza quase preto
  // vazio de propósito: o app esconde os atalhos de WhatsApp até o admin
  // configurar o número real em /admin/configuracoes (evita link wa.me/ vazio)
  whatsapp: '',
  address: 'Av. das Obras, 1000 - Centro, São Paulo/SP',
  business_hours: 'Seg a Sex 7h-18h · Sáb 7h-13h · Dom fechado',
  weekday_open: '07:00', weekday_close: '18:00',
  sat_open: '07:00', sat_close: '13:00',
  sun_closed: true, sun_open: null, sun_close: null,
  about: 'Tudo para sua obra, do alicerce ao acabamento.',
  font_scale: 100,
}

// PASSO 4: aplica as cores dinâmicas vindas do banco nas variáveis CSS
// e guarda em cache para a próxima visita já abrir na cor certa (sem flash).
// A escala de fonte segue o mesmo caminho: vinda do banco, aplicada no <html>
// e cacheada — o script inline do index.html já abre na escala certa.
function applyTheme(s) {
  applyBrand(s.primary_color, s.secondary_color)
  applyFontScale(s.font_scale ?? 100)
  writeCachedBrand(s.primary_color, s.secondary_color, s.font_scale ?? 100)
  // editor visual (migration-36): fonte e raio dos cantos da loja
  const root = document.documentElement
  root.classList.toggle('font-alt', s.font_family === 'inter')
  root.classList.toggle('radius-compact', s.radius_style === 'compact')
  root.classList.toggle('radius-roundy', s.radius_style === 'roundy')
}

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState([])
  const [zones, setZones] = useState([]) // zonas de entrega (migration-31): taxa/prazo ANTES de finalizar
  const [cepRanges, setCepRanges] = useState([]) // faixas de CEP (migration-36): frete pelo CEP digitado
  const [banners, setBanners] = useState([]) // banners promocionais (migration-34): carrossel da Home
  const [loading, setLoading] = useState(true)
  // Cor em cache = já sabemos a cor da loja: pinta na hora. Sem cache (primeira
  // visita neste navegador) seguramos o primeiro paint até a cor chegar, senão o
  // cinza padrão do template piscaria antes de virar a cor configurada.
  const [themeReady, setThemeReady] = useState(() => readCachedBrand() !== null)

  async function loadSettings() {
    try {
      const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
      if (data) { setSettings(data); applyTheme(data) }
    } catch (err) {
      // rede/banco fora do ar não pode travar a loja nem sumir com o tema padrão
      console.warn('[store] não foi possível carregar as configurações da loja:', err?.message ?? err)
    } finally {
      setThemeReady(true)
      setLoading(false)
    }
  }

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data ?? [])
  }

  // Zonas/banners: sem a migration a tabela não existe — erro vira lista
  // vazia e a loja segue funcionando como sempre (frete grátis, hero fixo)
  async function loadZones() {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('id, name, fee, eta')
      .eq('active', true)
      .order('sort')
    if (!error) setZones(data ?? [])
  }

  async function loadCepRanges() {
    const { data, error } = await supabase
      .from('delivery_cep_ranges')
      .select('id, label, cep_start, cep_end, fee, eta')
      .eq('active', true)
      .order('cep_start')
    if (!error) setCepRanges(data ?? [])
  }

  async function loadBanners() {
    const { data, error } = await supabase
      .from('home_banners')
      .select('id, image_url, title, subtitle, cta_text, cta_url')
      .eq('active', true)
      .order('sort')
    if (!error) setBanners(data ?? [])
  }

  useEffect(() => {
    loadSettings()
    loadCategories()
    loadZones()
    loadCepRanges()
    loadBanners()

    // Realtime: mudanças no banco refletem na vitrine sem refresh
    const channel = supabase
      .channel('store_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, loadSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, loadCategories)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_zones' }, loadZones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_cep_ranges' }, loadCepRanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_banners' }, loadBanners)
      .subscribe()

    // trava de segurança: requisição lenta não deixa a loja presa no splash neutro
    const liberar = setTimeout(() => setThemeReady(true), 2500)

    return () => { clearTimeout(liberar); supabase.removeChannel(channel) }
  }, [])

  async function updateSettings(updates) {
    const { data, error } = await supabase
      .from('store_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .maybeSingle()
    if (!error && data) { setSettings(data); applyTheme(data) }
    return { data, error }
  }

  // ---------- CRUD de categorias ----------
  async function createCategory(name) {
    const { data, error } = await supabase.from('categories').insert({ name, slug: slugify(name) }).select().single()
    return { data, error }
  }

  async function updateCategory(id, name) {
    const { data, error } = await supabase.from('categories').update({ name, slug: slugify(name) }).eq('id', id).select().single()
    return { data, error }
  }

  // Regra: não excluir categoria com produtos (bloqueia no app e no banco via FK restrict)
  async function deleteCategory(id) {
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id)
    if (count && count > 0) {
      return { error: new Error('Esta categoria possui ' + count + ' produto(s). Mova ou exclua os produtos primeiro.') }
    }
    const { error } = await supabase.from('categories').delete().eq('id', id)
    return { error }
  }

  // Primeira visita sem cor em cache: fundo neutro por um instante, nunca o roxo padrão
  if (!themeReady) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-100" />
  }

  return (
    <StoreContext.Provider
      value={{ settings, categories, zones, cepRanges, banners, loading, updateSettings, createCategory, updateCategory, deleteCategory, reloadCategories: loadCategories, reloadZones: loadZones, reloadCepRanges: loadCepRanges, reloadBanners: loadBanners }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de StoreProvider')
  return ctx
}
