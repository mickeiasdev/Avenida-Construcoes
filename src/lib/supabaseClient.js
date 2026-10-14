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

// Extrai o caminho interno do objeto (ex.: products/1234-abcd.png) a partir da
// URL pública. Retorna null quando a URL não é do nosso bucket (ex.: imagens
// externas do seed — não devem ser apagadas).
export function storagePathFromUrl(url) {
  const marker = '/storage/v1/object/public/' + STORAGE_BUCKET + '/'
  const i = String(url ?? '').indexOf(marker)
  return i >= 0 ? String(url).slice(i + marker.length) : null
}

// Apaga o arquivo do Storage quando a URL é do nosso bucket.
// Best-effort de propósito: arquivo inexistente/URL externa NÃO trava a tela.
export async function deleteImageByUrl(url) {
  const path = storagePathFromUrl(url)
  if (!path) return // imagem externa (ex.: Unsplash do seed)
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path])
  if (error) console.warn('[storage] não consegui apagar', path, error.message)
}

export async function deleteImagesByUrls(urls) {
  for (const u of urls ?? []) await deleteImageByUrl(u)
}

