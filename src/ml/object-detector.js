// 3D object recognition via a Teachable Machine image classifier.
// The model runs in a Web Worker (detector-worker.js), which loads TF.js from a CDN on first use;
// this side only cuts frames out of the camera feed and hands them over.

const INPUT_SIZE = 224
// Teachable Machine trains on square crops of the middle of the frame, so a frame is classified
// as squares, not squashed into one: this many, from one end of its long side to the other, so
// an object anywhere in view (on the phone it was often near the top) is seen whole in one.
const CROPS = 3

/** @type {Worker | null} */
let worker = null
/** @type {Promise<{backend: string, ms: number}> | null} */
let ready = null
let isReady = false
/** @type {((result: {scores: {className: string, probability: number}[], ms: number} | null) => void) | null} */
let pendingResult = null
let offscreen = null
let offCtx = null

/**
 * Starts loading the model in the worker; only loads once, so it is safe to call repeatedly.
 * The first prediction (TF.js compiling its GPU programs) is made in the worker too, so this
 * resolves only once predictions are fast.
 *
 * @param {string} modelUrl - The Teachable Machine model folder.
 * @returns {Promise<{backend: string, ms: number}>} The TF.js backend the worker got, and how
 *   long loading took. Rejects if it failed; a later call tries again.
 */
export const loadModel = (modelUrl) => {
  if (ready) {
    return ready
  }
  worker = new Worker(new URL('./detector-worker.js', import.meta.url))
  ready = new Promise((resolve, reject) => {
    worker.onmessage = ({data}) => {
      if (data.type === 'ready') {
        isReady = true
        resolve({backend: data.backend, ms: data.ms})
      } else if (data.type === 'result') {
        pendingResult?.(data)
      } else if (data.type === 'error') {
        if (!isReady) {
          worker.terminate()
          ready = null
          reject(new Error(data.message))
        }
        pendingResult?.(null)
      }
    }
  })
  worker.postMessage({type: 'load', modelUrl})
  offscreen = document.createElement('canvas')
  offscreen.width = INPUT_SIZE
  offscreen.height = INPUT_SIZE * CROPS
  offCtx = offscreen.getContext('2d', {willReadFrequently: true})
  return ready
}

/**
 * Has the worker classify one frame, as CROPS squares along its long side.
 *
 * @returns {Promise<{scores: {className: string, probability: number}[][], ms: number} | null>}
 *   One list of scores per square, from the top (or left) of the frame.
 */
const classifyFrame = (source) => {
  const width = source.videoWidth || source.width
  const height = source.videoHeight || source.height
  const side = Math.min(width, height)
  const slack = Math.max(width, height) - side
  for (let i = 0; i < CROPS; i++) {
    const offset = (slack * i) / (CROPS - 1)
    const [x, y] = width > height ? [offset, 0] : [0, offset]
    offCtx.drawImage(source, x, y, side, side, 0, i * INPUT_SIZE, INPUT_SIZE, INPUT_SIZE)
  }
  // The squares lie one under another, so their pixels come out one image after another.
  const {data} = offCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE * CROPS)
  return new Promise((resolve) => {
    pendingResult = resolve
    worker.postMessage({type: 'classify', count: CROPS, width: INPUT_SIZE, height: INPUT_SIZE, pixels: data.buffer}, [data.buffer])
  })
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
 * @param {{intervalMs?: number, threshold?: number, backgroundClass?: string,
 *   onFrame?: (best: {className: string, probability: number, crop: number}, ms: number) => void}} options -
 *   `onFrame` hears every frame's best guess (an object over background, from whichever square
 *   `crop`, 0 at the top) and how long the worker took (for ?debug).
 * @returns {() => void} stop
 */
export const startDetection = (glCanvas, onDetect, {
  intervalMs = 700,
  threshold = 0.60,
  backgroundClass = 'background',
  onFrame = null,
} = {}) => {
  if (!isReady) throw new Error('Call loadModel() first')
  let active = true

  const tick = async () => {
    if (!active) return
    try {
      // 8th Wall injects a <video> element for the raw camera stream; use it so we get a
      // live frame rather than reading a WebGL canvas that may have an empty drawing buffer.
      const source = document.querySelector('video') ?? glCanvas
      const result = await classifyFrame(source)
      if (active && result) {
        const bests = result.scores.map((scores, crop) => ({
          ...scores.reduce((a, b) => a.probability > b.probability ? a : b), crop,
        }))
        const objects = bests.filter((guess) => guess.className !== backgroundClass)
        const best = objects.length > 0
          ? objects.reduce((a, b) => a.probability > b.probability ? a : b)
          : bests[Math.floor(CROPS / 2)]
        onFrame?.(best, result.ms)
        if (best.className !== backgroundClass && best.probability >= threshold) {
          onDetect(best.className, best.probability)
        }
      }
    } catch (_) {
      // Source not ready or context lost — skip this frame
    }
    if (active) setTimeout(tick, intervalMs)
  }

  tick()
  return () => { active = false }
}
