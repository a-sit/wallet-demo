import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  root: 'web',
  // relative Pfade: läuft unter / (lokal) und unter einem Unterpfad wie /wallet-demo/
  base: './',
  plugins: [react()],
  css: {
    postcss: { plugins: [tailwind({ config: path.resolve(__dirname, 'tailwind.config.js') }), autoprefixer()] }
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } }
})
