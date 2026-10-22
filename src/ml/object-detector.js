// 3D object recognition via a Teachable Machine image classifier.
// Loads TF.js and @teachablemachine/image from CDN on first use (lazy, ~2-4 MB total).
// Runs the model on the renderer's WebGL canvas every intervalMs milliseconds.

const TF_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js'
const TM_CDN = 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js'
const INPUT_SIZE = 224

let model = null
let offscreen = null
let offCtx = null

const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
  const el = document.createElement('script')
  el.src = src
  el.onload = resolve
  el.onerror = () => reject(new Error(`Failed to load ${src}`))
  document.head.appendChild(el)
})

/** Load the Teachable Machine model from the given URL (only loads once; safe to call repeatedly). */
export const loadModel = async (modelUrl) => {
  if (model) return model
  await loadScript(TF_CDN)
  await loadScript(TM_CDN)
  const base = modelUrl.endsWith('/') ? modelUrl : modelUrl + '/'
  model = await window.tmImage.load(base + 'model.json', base + 'metadata.json')
  offscreen = document.createElement('canvas')
  offscreen.width = INPUT_SIZE
  offscreen.height = INPUT_SIZE
  offCtx = offscreen.getContext('2d')
  return model
}

/**
 * Run inference on the camera feed every intervalMs.
 * Prefers the raw <video> element that 8th Wall injects (avoids the preserveDrawingBuffer
 * issue where reading a WebGL canvas outside the render frame produces a black image).
 * Falls back to glCanvas when no video element is found.
 * Calls onDetect(className, confidence) when a non-background class exceeds the threshold.
 * Returns a stop function — call it to cancel the detection loop.
 *
 * @param {HTMLCanvasElement} glCanvas - The WebGL renderer canvas (used as fallback source).
 * @param {(className: string, confidence: number) => void} onDetect
 * @param {{intervalMs?: number, threshold?: number, backgroundClass?: string}} options
 * @returns {() => void} stop
 */
export const startDetection = (glCanvas, onDetect, {
  intervalMs = 700,
  threshold = 0.60,
  backgroundClass = 'background',
} = {}) => {
  if (!model) throw new Error('Call loadModel() first')
  let active = true

  const tick = async () => {
    if (!active) return
    try {
      // 8th Wall injects a <video> element for the raw camera stream; use it so we get a
      // live frame rather than reading a WebGL canvas that may have an empty drawing buffer.
      const source = document.querySelector('video') ?? glCanvas
      offCtx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE)
      const predictions = await model.predict(offscreen)
      const best = predictions.reduce((a, b) => a.probability > b.probability ? a : b)
      if (best.className !== backgroundClass && best.probability >= threshold) {
        onDetect(best.className, best.probability)
      }
    } catch (_) {
      // Source not ready or context lost — skip this frame
    }
    if (active) setTimeout(tick, intervalMs)
  }

  tick()
  return () => { active = false }
}
