// Turns a file name (a creature's `file` in content/creatures.js, or a puzzle's `art`) into the
// URL it is served from. Vite finds every matching file in src/assets/ at build time, so adding
// one means dropping it there and naming it in creatures.js: nothing to register here. Only the
// files an exhibit actually uses are ever downloaded: this makes the URLs, not the requests.

const MODEL_URLS = import.meta.glob('./assets/*.glb', {eager: true, query: '?url', import: 'default'})
const ART_URLS = import.meta.glob('./assets/*.{png,jpg,jpeg,webp}', {eager: true, query: '?url', import: 'default'})

export const modelUrl = (file) => {
  const url = MODEL_URLS[`./assets/${file}`]
  if (!url) {
    throw new Error(`No model file src/assets/${file}`)
  }
  return url
}

export const artUrl = (file) => {
  const url = ART_URLS[`./assets/${file}`]
  if (!url) {
    throw new Error(`No art file src/assets/${file}`)
  }
  return url
}
