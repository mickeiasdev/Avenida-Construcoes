// TEMA CLARO/ESCURO (por dispositivo): classe .dark no <html> + cache.
// Pre-paint no index.html evita o flash claro.
export const THEME_CACHE_KEY = 'wls.theme'

export function readCachedTheme() {
  try { return localStorage.getItem(THEME_CACHE_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function applyTheme(mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

export function setTheme(mode) {
  applyTheme(mode)
  try { localStorage.setItem(THEME_CACHE_KEY, mode) } catch { /* modo privado */ }
}

export function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  setTheme(next)
  return next
}
