// The object classifier, run in a Web Worker (see object-detector.js). TF.js compiles its GPU
// programs on the first prediction, which blocked the page for seconds on a phone: the camera
// froze. Here that happens off the main thread, before the first camera frame is classified.
//
// Messages in:  {type: 'load', modelUrl}
//             | {type: 'classify', count, width, height, pixels: ArrayBuffer (RGBA, `count` images one after another)}
// Messages out: {type: 'ready', backend, ms} | {type: 'error', message}
//             | {type: 'result', scores: one [{className, probability}] list per image, ms}
//
// The input is prepared as Teachable Machine's own library does it (capture() in
// @teachablemachine/image): a centre square of the frame at the model's size, scaled to -1..1.

// TF.js is pinned to one version and checked against its SHA-384 before it runs: a compromised CDN
// must not be able to put its own code on visitors' phones (see "External scripts" in CLAUDE.md).
// importScripts cannot check an integrity hash itself, so the file is fetched, hashed, and only then
// loaded from a blob URL. To upgrade: change the version, then set the hash with
//   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
const TF_SHA384 = 'vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre'

/** Loads TF.js into the worker, or throws if the file is not the pinned one. */
const importTf = async () => {
  const bytes = await fetch(TF_URL).then((response) => {
    if (!response.ok) {
      throw new Error(`TF.js: HTTP ${response.status}`)
    }
    return response.arrayBuffer()
  })
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))
  if (btoa(String.fromCharCode(...digest)) !== TF_SHA384) {
    throw new Error('TF.js does not match its pinned hash: not loaded')
  }
  const url = URL.createObjectURL(new Blob([bytes], {type: 'text/javascript'}))
  importScripts(url)
  URL.revokeObjectURL(url)
}

let model = null
let labels = []

/**
 * @param {string} modelUrl - A Teachable Machine model folder (model.json and metadata.json in it).
 */
const load = async (modelUrl) => {
  const started = performance.now()
  await importTf()
  await tf.ready()
  const base = modelUrl.endsWith('/') ? modelUrl : modelUrl + '/'
  const [loaded, metadata] = await Promise.all([
    tf.loadLayersModel(base + 'model.json'),
    fetch(base + 'metadata.json').then((response) => response.json()),
  ])
  model = loaded
  labels = metadata.labels
  const size = metadata.imageSize ?? 224
  const warmUp = tf.tidy(() => model.predict(tf.zeros([1, size, size, 3])))
  await warmUp.data()
  warmUp.dispose()
  postMessage({type: 'ready', backend: tf.getBackend(), ms: performance.now() - started})
}

/**
 * Classifies several images in one batch.
 *
 * @param {{count: number, width: number, height: number, pixels: ArrayBuffer}} frames - RGBA,
 *   each already the model's size.
 */
const classify = async ({count, width, height, pixels}) => {
  const started = performance.now()
  const output = tf.tidy(() => {
    const rgba = tf.tensor4d(new Uint8Array(pixels), [count, height, width, 4], 'int32')
    const rgb = rgba.slice([0, 0, 0, 0], [count, height, width, 3])
    return model.predict(rgb.toFloat().div(127).sub(1))
  })
  const probabilities = await output.data()
  output.dispose()
  const scores = Array.from({length: count}, (_, image) =>
    labels.map((className, i) => ({className, probability: probabilities[image * labels.length + i]})))
  postMessage({type: 'result', scores, ms: performance.now() - started})
}

onmessage = ({data}) => {
  const job = data.type === 'load' ? load(data.modelUrl) : classify(data)
  job.catch((error) => postMessage({type: 'error', message: String(error?.message ?? error)}))
}
