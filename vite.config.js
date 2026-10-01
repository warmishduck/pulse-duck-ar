import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  // Treat 3D model files as static assets so `import model from './x.glb'` returns a URL.
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  build: {
    rollupOptions: {
      // The app, plus the staff QR-code generator page (qr.html) — a second entry so it is built
      // and deployed alongside index.html, reachable at <site>/qr.html.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        qr: resolve(import.meta.dirname, 'qr.html'),
      },
    },
  },
  server: {
    allowedHosts: ['.ngrok-free.dev', '.trycloudflare.com', '.loca.lt', '.serveo.net', '.serveousercontent.com'],
  },
});
