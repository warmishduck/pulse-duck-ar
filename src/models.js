// Turns a model's file name (the `file` of a creature in content/creatures.js) into the URL it
// is served from. Vite finds every .glb in src/assets/ at build time, so adding a creature
// means dropping its file there and naming it in creatures.js: nothing to register here.
// Only the models an exhibit uses are ever downloaded: this makes the URLs, not the requests.

const URLS = import.meta.glob('./assets/*.glb', {eager: true, query: '?url', import: 'default'})

export const modelUrl = (file) => {
  const url = URLS[`./assets/${file}`]
  if (!url) {
    throw new Error(`No model file src/assets/${file}`)
  }
  return url
}
