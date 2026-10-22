import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // Keep the browser's Host so the API's same-origin check (backend/src/auth.ts)
    // matches the Origin header; the string shorthand sets changeOrigin: true.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
})
