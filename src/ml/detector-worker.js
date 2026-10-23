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

const TF_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js'

let model = null
let labels = []

/**
 * @param {string} modelUrl - A Teachable Machine model folder (model.json and metadata.json in it).
 */
const load = async (modelUrl) => {
  const started = performance.now()
  importScripts(TF_CDN)
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
