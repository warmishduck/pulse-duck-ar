import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Serves (dev) and copies (build) an 8th Wall package's scripts and its resources/ folder to
// external/xr/, the layout index.html and the engine expect. stripBase drops the 4 leading
// segments node_modules/@8thwall/<pkg>/dist; LICENSE is skipped so the packages don't collide.
const engineFiles = (pkg) => ({
  src: `node_modules/@8thwall/${pkg}/dist/{*.js,resources/**/*}`,
  dest: 'external/xr',
  rename: {stripBase: 4},
})

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  plugins: [
    viteStaticCopy({
      targets: [
        engineFiles('engine-binary'),
        engineFiles('xrextras'),
        engineFiles('landing-page'),
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
