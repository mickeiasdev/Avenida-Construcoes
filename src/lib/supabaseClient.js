import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('SEU-PROJETO')) {
  throw new Error(
    'Supabase nao configurado! Copie .env.example para .env e preencha ' +
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os dados reais do seu projeto ' +
    '(Supabase Dashboard > Project Settings > API). Depois REINICIE o npm run dev.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const STORAGE_BUCKET = 'store'

// Upload de imagem para o bucket publico 'store' (logo, banner, produtos)
export async function uploadImage(file, folder) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = folder + '/' + Date.now() + '-' + nanoid(10) + '.' + ext
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  return getPublicUrl(path)
}

export function getPublicUrl(path) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
