import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'HAI JARVIS — AI Command Center',
        short_name: 'JARVIS',
        description: 'Personal AI Command Center',
        theme_color: '#04070f',
        background_color: '#04070f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  server: {
    // Listen di semua interface (0.0.0.0) agar bisa diakses perangkat lain
    // dalam 1 jaringan lokal via http://<IP-PC>:5173
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
