import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  // Sandbox'lı preload ESM yükleyemiyor: CommonJS olarak derleniyor.
  preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { plugins: [react(), tailwindcss()] },
})
