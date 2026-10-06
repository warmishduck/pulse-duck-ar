// The object scanner (`/?scan`), all in one camera session:
//  1. searching: the camera looks for any exhibit object registered as an image target;
//  2. found: the object glows, and the visitor is asked to point the camera at the floor;
//  3. placed: once they do, that exhibit's creatures appear on the floor below the object, facing
//     them (see floor-spot.js), and the regular exhibit view (threejs-scene-init.js) takes over.

import * as THREE from 'three'

import {CREATURES} from './content/creatures.js'
import {IMAGE_TARGET_DATA} from './image-targets'
import {routeFromImageTarget} from './route'
import {TEXT} from './i18n'
import {floorSpotBelow} from './floor-spot'
import {initScenePipelineModule, placeCameraAtStart} from './threejs-scene-init'
import {createSparkBurst} from './spark'
import {startXr} from './xr-pipeline'

const GLOW_COLOR = 0xffd98a
const GLOW_SIZE = 1.8          // the halo's diameter, in multiples of the object's size
const GLOW_PULSE_SPEED = 4     // radians per second
const GLOW_FADE_SPEED = 2      // opacity per second when it goes away
const MIN_GLOW_SECONDS = 1.2   // the glow shows at least this long, even if already looking down

/** A soft ring: clear in the middle so the object itself stays visible, brightest near its edge. */
const makeGlowTexture = () => {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(0.68, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/**
 * A pulsing halo, with a burst of sparks when it first appears, over a recognised object.
 * Round, so it looks right whichever way the object's image target is stored (portrait or
 * rotated landscape).
 *
 * @param {THREE.Scene} scene
 */
const createObjectGlow = (scene) => {
  const group = new THREE.Group()
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: GLOW_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }))
  group.add(halo)
  group.visible = false
  scene.add(group)

  let sparks = null
  let elapsed = 0
  let fading = false

  return {
    /** @param {{position: {x: number, y: number, z: number}, scale: number}} detail - From a reality.image* event. */
    show(detail) {
      group.position.copy(detail.position)
      halo.scale.setScalar(detail.scale * GLOW_SIZE)
      if (!sparks) {
        const radius = detail.scale * 0.6
        const sparkRoot = new THREE.Group()
        sparkRoot.position.y = -radius * 0.6   // createSparkBurst starts its sparks this far up
        group.add(sparkRoot)
        sparks = createSparkBurst(sparkRoot, {radius, color: GLOW_COLOR})
      }
      group.visible = true
    },
    hide() {
      fading = true
    },
    /** @param {number} dt - Seconds since the last frame. */
    update(dt) {
      if (!group.visible) {
        return
      }
      elapsed += dt
      if (sparks) {
        sparks.update(dt)
      }
      const material = halo.material
      if (fading) {
        material.opacity = Math.max(0, material.opacity - dt * GLOW_FADE_SPEED)
        if (material.opacity === 0) {
          group.visible = false
          scene.remove(group)
        }
      } else {
        material.opacity = 0.45 + 0.25 * Math.sin(elapsed * GLOW_PULSE_SPEED)
      }
    },
  }
}

/** A hint at the bottom of the screen; returns {setText, remove}. */
const createHint = (text) => {
  const root = document.createElement('div')
  root.className = 'ui'
  const hint = document.createElement('div')
  hint.className = 'ui-toast ui-hint is-visible'
  hint.textContent = text
  root.appendChild(hint)
  document.body.appendChild(root)
  return {
    setText: (next) => { hint.textContent = next },
    remove: () => root.remove(),
  }
}

/**
 * How tall the exhibit's tallest creature is, as it would stand in the QR view.
 *
 * @param {import('./content/exhibits.js').Exhibit} exhibit
 * @returns {number} Scene units; 0 for an exhibit with no creatures.
 */
const tallestCreature = (exhibit) => Math.max(0, ...exhibit.creatures.map(
  (placement) => placement.targetHeight ?? CREATURES[placement.id].targetHeight
))

/** The scanner's camera pipeline module: steps 1-3 above. */
const scanPipelineModule = () => {
  const clock = new THREE.Clock()
  const forward = new THREE.Vector3()
  const objectPosition = new THREE.Vector3()
  let state = 'searching'   // -> 'found' -> 'placed'
  let foundName = null
  let foundSeconds = 0
  let exhibit = null
  let glow = null
  let hint = null
  let canvas = null
  let exhibitModule = null

  const onObjectSeen = ({detail}) => {
    if (state === 'searching') {
      const match = routeFromImageTarget(detail.name)
      if (!match) {
        return
      }
      state = 'found'
      foundName = detail.name
      exhibit = match.exhibit
      hint.setText(TEXT.scanFloor)
    }
    if (state === 'found' && detail.name === foundName) {
      objectPosition.copy(detail.position)
      glow.show(detail)
    }
  }

  const placeExhibit = (anchor) => {
    state = 'placed'
    glow.hide()
    hint.remove()
    exhibitModule = initScenePipelineModule(exhibit, {anchor})
    exhibitModule.onStart({canvas})
  }

  return {
    name: 'object-scanner',

    onStart: (args) => {
      canvas = args.canvas
      const {scene, camera} = XR8.Threejs.xrScene()
      placeCameraAtStart(camera)
      glow = createObjectGlow(scene)
      hint = createHint(TEXT.scanHint)
    },

    onUpdate: () => {
      const dt = clock.getDelta()
      glow.update(dt)
      if (state === 'placed') {
        exhibitModule.onUpdate()
        return
      }
      if (state === 'found') {
        foundSeconds += dt
        if (foundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        const anchor = floorSpotBelow(objectPosition, camera.position, camera.getWorldDirection(forward), tallestCreature(exhibit))
        if (anchor) {
          placeExhibit(anchor)
        }
      }
    },

    // Without A-Frame, 8th Wall delivers reality.* events only to pipeline-module listeners.
    listeners: [
      {event: 'reality.imagefound', process: onObjectSeen},
      {event: 'reality.imageupdated', process: onObjectSeen},
    ],
  }
}

/** Starts the camera, with world tracking and every configured image target. */
export const startScan = () => {
  startXr(scanPipelineModule(), {imageTargetData: IMAGE_TARGET_DATA})
}

/** True when at least one image target is configured, so scanning can find something. */
export const canScan = IMAGE_TARGET_DATA.length > 0
