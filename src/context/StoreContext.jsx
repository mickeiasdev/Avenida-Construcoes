import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { slugify } from '../lib/utils'

const StoreContext = createContext(null)

// Defaults (usados antes do primeiro load ou se o seed ainda nao rodou)
const DEFAULT_SETTINGS = {
  id: 1,
  store_name: 'Depósito ConstruFácil',
  logo_url: null,
  banner_url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1600&q=80',
  primary_color: '#f97316',
  secondary_color: '#1e293b',
  whatsapp: '5511999999999',
  address: 'Av. das Obras, 1000 - Centro, São Paulo/SP',
  business_hours: 'Seg a Sex 7h-18h · Sáb 7h-13h',
  about: 'Tudo para sua obra, do alicerce ao acabamento.',
}

// PASSO 4: aplica as cores dinâmicas vindas do banco nas variáveis CSS
function applyTheme(s) {
  document.documentElement.style.setProperty('--brand-primary', s.primary_color)
  document.documentElement.style.setProperty('--brand-secondary', s.secondary_color)
}

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadSettings() {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
    if (data) { setSettings(data); applyTheme(data) }
    setLoading(false)
  }

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data ?? [])
  }

  useEffect(() => {
    loadSettings()
    loadCategories()

    // Realtime: mudanças no banco refletem na vitrine sem refresh
    const channel = supabase
      .channel('store_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, loadSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, loadCategories)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
    const { data, error } = await supabase
      .from('categories').insert({ name, slug: slugify(name) }).select().single()
    return { data, error }
  }

  async function updateCategory(id, name) {
    const { data, error } = await supabase
      .from('categories').update({ name, slug: slugify(name) }).eq('id', id).select().single()
    return { data, error }
  }

  // Regra: não excluir categoria com produtos (bloqueia no app e no banco via FK restrict)
  async function deleteCategory(id) {
    const { count } = await supabase
      .from('products').select('id', { count: 'exact', head: true }).eq('category_id', id)
    if (count && count > 0) {
      return { error: new Error('Esta categoria possui ' + count + ' produto(s). Mova ou exclua os produtos primeiro.') }
    }
    const { error } = await supabase.from('categories').delete().eq('id', id)
    return { error }
  }

  return (
    <StoreContext.Provider
      value={{ settings, categories, loading, updateSettings, createCategory, updateCategory, deleteCategory, reloadCategories: loadCategories }}
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
