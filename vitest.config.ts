import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// ATENÇÃO: o plugin react() é obrigatório aqui. Sem ele o esbuild compila o
// JSX no modo clássico (React.createElement) e todo teste morre com
// "React is not defined", porque os arquivos não importam React.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./setupTests.ts'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  }
})
