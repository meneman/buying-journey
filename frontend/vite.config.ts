import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envDir: path.resolve(__dirname, '..'),
  server: {
    // Browser-Einstieg ist immer http://localhost:1337 (dev wie prod);
    // das Backend läuft im Dev per PORT=3000 daneben (siehe package.json).
    port: 1337,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
