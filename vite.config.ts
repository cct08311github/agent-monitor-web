import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  // Vue source root
  root: 'src/frontend',

  // Build output at project root dist/
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },

  // Serve existing vanilla static assets alongside the Vue dev server
  publicDir: resolve(__dirname, 'src/frontend/public'),

  // Sub-path for Tailscale serve or reverse proxy (e.g. /agent-monitor)
  base: process.env.BASE_PATH ?? '/',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/frontend/src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `https://localhost:${process.env.PORT ?? 3001}`,
        changeOrigin: true,
        // Accept self-signed mkcert certs in dev
        secure: false,
      },
    },
  },
})
