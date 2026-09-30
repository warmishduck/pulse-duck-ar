// Renders an already-loaded creature model to a flat 2D image, for use as a puzzle's own art
// (see minigames/puzzle.js's config.art) until the museum's real illustrations exist — an actual
// picture of the character is far easier to recognise mid-puzzle than an abstract placeholder
// pattern (minigames/placeholder-art.js), which is what the puzzle otherwise falls back to.
import * as THREE from 'three'

let sharedRenderer = null
const SIZE = 640

const getRenderer = () => {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true})
    sharedRenderer.setSize(SIZE, SIZE, false)
    sharedRenderer.setPixelRatio(1)
  }
  return sharedRenderer
}

// `model` must be an orphan (no current parent) — call this right after showcase.js scales and
// centres it (feet at y=0, `targetHeight` tall) but before `group.add(model)`, so there is a
// clean, undistorted idle pose to render before any silhouette override or animation plays. Hands
// the model back detached from this module's own scene either way, for the caller to add to its
// real one. Returns a square <canvas> (not a data URL — puzzle.js's loadArt draws directly from
// either, and this avoids a base64 round trip for a 640x640 image).
export const snapshotCreature = (model, targetHeight, {backgroundColor = '#2f3d34'} = {}) => {
  const renderer = getRenderer()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(backgroundColor)

  const key = new THREE.DirectionalLight(0xfff4e0, 2.4)
  key.position.set(1.2, 2, 2)
  scene.add(key)
  scene.add(new THREE.AmbientLight(0xffffff, 0.9))
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.7)
  rim.position.set(-1.5, 1, -1.5)
  scene.add(rim)

  scene.add(model)

  const fov = 32
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 20)
  const distance = (targetHeight * 0.65) / Math.tan(THREE.MathUtils.degToRad(fov / 2))
  camera.position.set(0, targetHeight * 0.55, distance)
  camera.lookAt(0, targetHeight * 0.5, 0)

  model.updateMatrixWorld(true)
  renderer.render(scene, camera)

  // Copy out of the shared renderer's own canvas before it's reused for anything else.
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.getContext('2d').drawImage(renderer.domElement, 0, 0)

  scene.remove(model)
  return canvas
}
