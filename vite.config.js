import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // Treat 3D model files as static assets so `import model from './x.glb'` returns a URL.
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  server: {
    allowedHosts: ['.ngrok-free.dev', '.trycloudflare.com', '.loca.lt', '.serveo.net', '.serveousercontent.com'],
  },
});
