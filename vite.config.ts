import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // relative asset paths: the build works from any folder or sub-path on any static host
  base: './',
  plugins: [react()],
  // host: true exposes the dev/preview server on your LAN, so phones and tablets can join
  server: { host: true, port: 5173, open: true },
  preview: { host: true, port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
})
