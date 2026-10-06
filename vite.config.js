import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  plugins: [
    // Copy 8th Wall engine packages from node_modules into public/external/xr at dev time
    // and into dist/external/xr at build time.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@8thwall/engine-binary/dist/*',
          dest: 'external/xr',
        },
        {
          src: 'node_modules/@8thwall/xrextras/dist/*',
          dest: 'external/xr',
        },
        {
          src: 'node_modules/@8thwall/landing-page/dist/*',
          dest: 'external/xr',
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        qr: resolve(import.meta.dirname, 'qr.html'),
      },
    },
  },
  server: {
    allowedHosts: ['.ngrok-free.dev', '.trycloudflare.com', '.loca.lt', '.serveo.net', '.serveousercontent.com'],
  },
})
