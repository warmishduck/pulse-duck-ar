// The object scanner (`/?scan`), all in one camera session:
//  1. searching: the camera looks for any exhibit object registered as an image target;
//  2. found: the object glows, and the visitor is asked to point the camera at the floor;
//  3. placed: once they do, that exhibit's creatures appear on the floor where they look, short
//     of the object's wall, facing them (see floor-spot.js), and the regular exhibit view
//     (threejs-scene-init.js) takes over. Two things are measured from the engine's tracked
//     world points first, because what the engine reports is only an assumption: how far the
//     object's wall is (an image target's own distance came out several times too far) and how
//     high the floor is (y = 0 is only where the engine puts it).
// Add `debug` to the address (/?scan&debug) for a live readout of all this on the phone.
//
// `/?scan&marker` is the marker flow: the exhibit's object still names the exhibit and gives the
// wall, but the content stands on a marker printed and laid on the floor (FLOOR_MARKER) and is
// re-anchored to it whenever the marker is seen again, which keeps it from drifting. An invisible
// plane on the real wall hides what is behind it, and the creature starts behind the wall and
// walks out through it (see marker-anchor.js).

import * as THREE from 'three'

import {CREATURES} from './content/creatures.js'
import {IMAGE_TARGET_DATA} from './image-targets'
import {routeFromImageTarget} from './route'
import {TEXT} from './i18n'
import {FLOOR_PITCH, floorHeight, floorSpot, median, wallDistance} from './floor-spot'
import {
  MARKER_SEARCH_ANGLE, MIN_MARKER_POINTS, contentScale, emergeStart, markerPosition, wallPlane, yawToward,
} from './marker-anchor'
import {createDebugPanel} from './debug-panel'
import {initScenePipelineModule, placeCameraAtStart} from './threejs-scene-init'
import {createSparkBurst} from './spark'
import {startXr} from './xr-pipeline'
import {loadModel, startDetection} from './ml/object-detector.js'
import {OBJECT_MODEL_URL} from './ml/model-config.js'
import {EXHIBITS} from './content/exhibits.js'

/** The image target (public/image-targets/floor-marker.json) that is laid on the floor. */
const FLOOR_MARKER = 'floor-marker'
const MARKER_SCALE = 0.6       // content scale when the marker reports no width (see contentScale)
const OBJECT_GAP = 0.12        // object mode: how far in front of the exhibit surface the creature hovers
const OBJECT_SCALE_FALLBACK = 0.5

const GLOW_COLOR = 0xffd98a
const GLOW_SIZE = 1.8          // the halo's diameter, in multiples of the object's size
const GLOW_PULSE_SPEED = 4     // radians per second
const GLOW_FADE_SPEED = 2      // opacity per second when it goes away
const MIN_GLOW_SECONDS = 1.2   // the glow shows at least this long, even if already looking down

const FLOOR_SAMPLE_SECONDS = 0.1   // between two readings of the floor's height
const FLOOR_SAMPLES_NEEDED = 5     // readings before the floor counts as measured
const FLOOR_SAMPLES_KEPT = 9       // the median is taken over the latest of them
const FLOOR_GIVE_UP_SECONDS = 2    // looking down this long without a measurement: assume y = 0

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
  let worldPoints = []        // the engine's tracked points, as of the latest frame
  // Until the engine has worked out where the phone is it returns no points and keeps moving the
  // world about, so content placed then jumps or follows the camera. null until the first report.
  let tracking = null
  const floorSamples = []     // readings of the floor's height
  let lookingDownSeconds = 0
  let secondsSinceSample = 0
  let exhibit = null
  let glow = null
  let hint = null
  let canvas = null
  let exhibitModule = null
  const debug = createDebugPanel()
  const urlParams = new URLSearchParams(window.location.search)
  const markerMode = urlParams.has('marker')
  const objectMode = urlParams.has('object')
  // /?scan&c=<code> pre-selects an exhibit so the scanner uses its imageTarget as the poster trigger.
  const preloadedCode = urlParams.get('c')?.trim().toLowerCase() ?? null
  if (preloadedCode && Object.hasOwn(EXHIBITS, preloadedCode)) {
    exhibit = EXHIBITS[preloadedCode]
  }
  let wall = null              // marker flow: the exhibit object's wall plane (marker-anchor.js)
  let markerAt = null          // marker flow: where the floor marker is, a THREE.Vector3
  let markerWidth = 0          // marker flow: its width in world units (detail.scale)
  let latestObjectDetail = null  // object/two-target mode: last seen detail for the exhibit object
  let objectFoundSeconds = 0   // two-target mode: seconds since the exhibit object was first seen
  let mlDetectorStop = null    // ML detection: cancel function returned by startDetection, or null

  // Starts the ML detection loop after the poster is recognised and exhibit.mlTarget is set.
  // Loads the model on demand (async, ~2-4 s); re-guards if the state changed while loading.
  const startMlDetection = async () => {
    if (mlDetectorStop || !exhibit?.mlTarget) return
    try {
      await loadModel(OBJECT_MODEL_URL)
    } catch (e) {
      debug?.set('ml', `model load failed: ${e.message}`)
      return
    }
    if (state !== 'found' || !exhibit?.mlTarget) return
    const {renderer} = XR8.Threejs.xrScene()
    mlDetectorStop = startDetection(renderer.domElement, (className, confidence) => {
      if (state !== 'found' || className !== exhibit.mlTarget) return
      const {camera} = XR8.Threejs.xrScene()
      camera.getWorldDirection(forward)
      const probePoint = camera.position.clone().addScaledVector(forward, 2.0)
      const dist = wallDistance(worldPoints, camera.position, probePoint) ?? 1.5
      objectPosition.copy(camera.position).addScaledVector(forward, dist)
      latestObjectDetail = null  // use OBJECT_SCALE_FALLBACK for creature scale
      glow.show({position: objectPosition.clone(), scale: 0.4})
      state = 'found_object'
      objectFoundSeconds = 0
      debug?.set('ml', `${className} ${(confidence * 100).toFixed(0)}% dist=${dist.toFixed(2)}`)
    })
  }

  const onObjectSeen = ({detail}) => {
    if (markerMode && detail.name === FLOOR_MARKER) {
      onMarkerSeen({detail})
      return
    }
    debug?.set('seen', `${detail.name} scale=${detail.scale?.toFixed(2)} pos=${detail.position.x.toFixed(2)}, ${detail.position.y.toFixed(2)}, ${detail.position.z.toFixed(2)}`)
    // After placement: re-anchor if the tracked target moves.
    // objectMode (single-target URL param) re-anchors on the poster/object target;
    // two-target flow re-anchors on the exhibit object specifically.
    if (state === 'placed') {
      const isAnchorTarget = objectMode
        ? detail.name === foundName
        : exhibit?.objectTarget && detail.name === exhibit.objectTarget
      if (isAnchorTarget) {
        const {camera} = XR8.Threejs.xrScene()
        const pos = new THREE.Vector3(detail.position.x, detail.position.y, detail.position.z)
        const distance = wallDistance(worldPoints, camera.position, detail.position)
        if (distance !== null) {
          pos.sub(camera.position).setLength(distance).add(camera.position)
        }
        const toCamera = new THREE.Vector3(camera.position.x - pos.x, 0, camera.position.z - pos.z)
        if (toCamera.lengthSq() > 1e-8) {
          toCamera.normalize()
        }
        exhibitModule.moveAnchor(pos.addScaledVector(toCamera, OBJECT_GAP))
      }
      return
    }

    // Two-target flow: the exhibit object itself (second target — mortar, clock, etc.) found.
    // Fires when the poster was already scanned and the exhibit declares an objectTarget.
    if ((state === 'found' || state === 'found_object') && exhibit?.objectTarget && detail.name === exhibit.objectTarget) {
      if (state !== 'found_object') {
        state = 'found_object'
        objectFoundSeconds = 0
      }
      const {camera} = XR8.Threejs.xrScene()
      objectPosition.copy(detail.position)
      const distance = wallDistance(worldPoints, camera.position, detail.position)
      if (distance !== null) {
        objectPosition.sub(camera.position).setLength(distance).add(camera.position)
      }
      latestObjectDetail = detail
      debug?.set('object', `scale=${detail.scale?.toFixed(2)} pos=${objectPosition.x.toFixed(2)},${objectPosition.y.toFixed(2)},${objectPosition.z.toFixed(2)}`)
      glow.show(detail)
      return
    }

    // Poster (first target) found: identify the exhibit and set the next instruction.
    if (state === 'searching') {
      // If an exhibit was pre-loaded via ?scan&c=<code>, use it when its imageTarget matches;
      // otherwise fall back to the first exhibit whose imageTarget matches the detected target.
      const preloaded = exhibit && exhibit.imageTarget === detail.name
      const match = preloaded ? {code: preloadedCode, exhibit} : routeFromImageTarget(detail.name)
      if (!match) {
        return
      }
      state = 'found'
      foundName = detail.name
      exhibit = match.exhibit
      foundSeconds = 0
      if (exhibit.objectTarget || exhibit.mlTarget) {
        hint.setText(TEXT.scanFindObject)
        if (exhibit.mlTarget) startMlDetection()
      } else if (!objectMode) {
        hint.setText(markerMode ? TEXT.scanMarker : TEXT.scanFloor)
      }
    }

    // Single-target flows (no objectTarget): track the poster position for floor-spot / marker / objectMode.
    if (state === 'found' && detail.name === foundName && !exhibit?.objectTarget) {
      objectPosition.copy(detail.position)
      const {camera} = XR8.Threejs.xrScene()
      const reported = objectPosition.distanceTo(camera.position)
      const distance = wallDistance(worldPoints, camera.position, objectPosition)
      if (distance !== null) {
        objectPosition.sub(camera.position).setLength(distance).add(camera.position)
      }
      if (markerMode) {
        wall = wallPlane(camera.position, objectPosition, detail.rotation)
        debug?.set('wall plane normal', wall.normal)
      }
      if (objectMode) {
        latestObjectDetail = detail
      }
      debug?.set('wall', `${distance === null ? 'no points there' : `${distance.toFixed(2)} from points`}; image target says ${reported.toFixed(2)}`)
      glow.show(detail)
    }
  }

  /**
   * The floor marker, seen or seen again: where it is, along its own direction at the distance
   * the tracked points give. Before the exhibit is placed that is all; after it, the content eases
   * to the new spot, but only on a distance read from points (the reported one is not trusted).
   */
  const onMarkerSeen = ({detail}) => {
    const {camera} = XR8.Threejs.xrScene()
    const distance = wallDistance(worldPoints, camera.position, detail.position, {
      angle: MARKER_SEARCH_ANGLE, minPoints: MIN_MARKER_POINTS,
    })
    debug?.set('marker', `${distance === null ? 'no points there' : `${distance.toFixed(2)} from points`}; target says ${camera.position.distanceTo(detail.position).toFixed(2)}`)
    if (state === 'placed') {
      if (distance !== null) {
        const position = markerPosition(detail.position, camera.position, distance)
        debug?.set('marker at', position)
        exhibitModule.moveAnchor(position)
      }
      return
    }
    markerAt = markerPosition(detail.position, camera.position, distance)
    markerWidth = detail.scale
    debug?.set('marker width', detail.scale)
    debug?.set('marker at', markerAt)
  }

  /** An invisible plane on the real wall: it writes depth but no colour, so what lies behind it is not drawn. */
  const addWallOccluder = (scene) => {
    const occluder = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({colorWrite: false, side: THREE.DoubleSide})
    )
    occluder.renderOrder = -1
    occluder.position.copy(wall.point)
    occluder.lookAt(wall.point.clone().add(wall.normal))
    scene.add(occluder)
  }

  /** Marker flow: once the wall and the marker are both known and tracking is steady, stand the exhibit on the marker. */
  const placeOnMarker = (camera) => {
    if (!wall || !markerAt) {
      return
    }
    if (tracking && tracking.status !== 'NORMAL') {
      hint.setText(TEXT.scanMove)
      return
    }
    const {scene} = XR8.Threejs.xrScene()
    addWallOccluder(scene)
    const yaw = yawToward(markerAt, camera.position)
    const scale = contentScale(markerWidth, tallestCreature(exhibit), MARKER_SCALE)
    debug?.set('content scale', scale)
    const reach = tallestCreature(exhibit) * scale
    placeExhibit(
      {position: markerAt.clone(), yaw, scale},
      {puzzlesEnabled: false, emergeFrom: emergeStart(markerAt, wall, reach)}
    )
  }

  /** Object mode: once the exhibit is recognised, anchor the creature right in front of it. */
  const placeOnObject = (camera) => {
    if (tracking && tracking.status !== 'NORMAL') {
      hint.setText(TEXT.scanMove)
      return
    }
    const toCamera = new THREE.Vector3(camera.position.x - objectPosition.x, 0, camera.position.z - objectPosition.z)
    if (toCamera.lengthSq() > 1e-8) {
      toCamera.normalize()
    } else {
      toCamera.set(0, 0, 1)
    }
    // Use measured floor height. If not yet measured (camera wasn't pointed at floor), try to
    // derive it from the world points that 8th Wall has mapped so far. Last resort: assume the
    // phone is held ~1.2 m above the floor (camera.position.y − 1.2).
    const allPointYs = worldPoints.map(p => p.position.y)
    const floorY = floorSamples.length >= FLOOR_SAMPLES_NEEDED
      ? median(floorSamples)
      : (floorHeight(allPointYs, camera.position.y) ?? (camera.position.y - 1.2))
    // Anchor at floor level, a step in front of the object toward the viewer.
    const position = objectPosition.clone()
    position.y = floorY
    position.addScaledVector(toCamera, OBJECT_GAP)
    const yaw = yawToward(position, camera.position)
    const scale = contentScale(latestObjectDetail?.scale, tallestCreature(exhibit), OBJECT_SCALE_FALLBACK)
    debug?.set('object anchor', `pos=${position.x.toFixed(2)},${floorY.toFixed(2)},${position.z.toFixed(2)} scale=${scale.toFixed(3)} camY=${camera.position.y.toFixed(2)}`)
    // Invisible wall sits at the object face; creature starts BEHIND the object (opposite side
    // from the viewer) and walks around to the anchor in front, creating the emerge effect.
    const wallPoint = objectPosition.clone()
    wallPoint.y = floorY
    wall = {point: wallPoint, normal: toCamera.clone()}
    const {scene} = XR8.Threejs.xrScene()
    addWallOccluder(scene)
    const reach = tallestCreature(exhibit) * scale
    placeExhibit({position, yaw, scale}, {puzzlesEnabled: false, emergeFrom: emergeStart(position, wall, reach)})
  }

  const onTrackingStatus = ({detail}) => {
    tracking = detail
    debug?.set('tracking', `${detail.status} ${detail.reason}`)
  }

  /**
   * The floor's world height while the camera looks down at it: a median of several readings of
   * the tracked points. 8th Wall puts the floor at y = 0 only by assumption, and where the phone
   * was held at the start decides how far that is from the real one.
   *
   * @param {number} cameraY
   * @param {number} dt - Seconds since the last frame.
   * @returns {number | null} null while still measuring; 0 once it gives up (no clear floor).
   */
  const measureFloor = (cameraY, dt) => {
    lookingDownSeconds += dt
    secondsSinceSample += dt
    if (secondsSinceSample >= FLOOR_SAMPLE_SECONDS) {
      secondsSinceSample = 0
      const height = floorHeight(worldPoints.map((point) => point.position.y), cameraY)
      if (height !== null) {
        floorSamples.push(height)
        floorSamples.splice(0, floorSamples.length - FLOOR_SAMPLES_KEPT)
      }
    }
    debug?.set('floor readings', `${floorSamples.length}/${FLOOR_SAMPLES_NEEDED}, of ${worldPoints.length} points, looking down ${lookingDownSeconds.toFixed(1)}s`)
    if (floorSamples.length >= FLOOR_SAMPLES_NEEDED) {
      debug?.set('floor', `measured y=${median(floorSamples).toFixed(2)}`)
      return median(floorSamples)
    }
    if (lookingDownSeconds >= FLOOR_GIVE_UP_SECONDS) {
      debug?.set('floor', 'assumed y=0 (no clear floor in the points)')
      return 0
    }
    return null
  }

  const placeExhibit = (anchor, options = {}) => {
    if (mlDetectorStop) { mlDetectorStop(); mlDetectorStop = null }
    state = 'placed'
    debug?.set('state', state)
    debug?.set('anchor', anchor.position)
    debug?.set('anchor scale', anchor.scale)
    glow.hide()
    hint.remove()
    // Setting the scene up renders (the lights' environment map) in the middle of an 8th Wall
    // frame, so three's cached WebGL state is resynced before and after.
    const {renderer} = XR8.Threejs.xrScene()
    renderer.resetState()
    try {
      exhibitModule = initScenePipelineModule(exhibit, {anchor, ...options})
      exhibitModule.onStart({canvas})
    } catch (error) {
      debug?.set('place error', error?.stack || error)
      throw error
    } finally {
      renderer.resetState()
    }
  }

  return {
    name: 'object-scanner',

    onStart: (args) => {
      canvas = args.canvas
      const {scene, camera} = XR8.Threejs.xrScene()
      placeCameraAtStart(camera)
      glow = createObjectGlow(scene)
      hint = createHint(TEXT.scanFloorFirst)
      debug?.set('state', state)
    },

    onUpdate: ({processCpuResult}) => {
      const dt = clock.getDelta()
      glow.update(dt)
      worldPoints = processCpuResult?.reality?.worldPoints ?? worldPoints
      if (debug) {
        const {camera} = XR8.Threejs.xrScene()
        debug.set('camera', camera.position)
        debug.set(`looking down (y < ${FLOOR_PITCH})`, camera.getWorldDirection(forward).y)
        debug.set('world points', worldPoints.length)
      }
      if (state === 'placed') {
        exhibitModule.onUpdate()
        return
      }
      // Floor calibration: collect samples while still searching. Shows a hint until the floor
      // is measured, then switches to the normal scan hint.
      if (state === 'searching') {
        const {camera} = XR8.Threejs.xrScene()
        camera.getWorldDirection(forward)
        if (forward.y < FLOOR_PITCH) {
          measureFloor(camera.position.y, dt)
        }
        if (floorSamples.length < FLOOR_SAMPLES_NEEDED) {
          hint.setText(TEXT.scanFloorFirst)
        } else {
          hint.setText(TEXT.scanHint)
        }
      }
      // Two-target flow: exhibit object was found; wait MIN_GLOW_SECONDS then place the creature.
      if (state === 'found_object') {
        objectFoundSeconds += dt
        debug?.set('state', `found_object ${objectFoundSeconds.toFixed(1)}s`)
        if (objectFoundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        placeOnObject(camera)
        return
      }
      if (state === 'found') {
        foundSeconds += dt
        debug?.set('state', `${state} ${foundSeconds.toFixed(1)}s`)
        // Two-target or ML flow: poster found, waiting for the visitor to point at the exhibit object.
        if (exhibit?.objectTarget || exhibit?.mlTarget) {
          return
        }
        if (foundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        if (markerMode) {
          placeOnMarker(camera)
          return
        }
        if (objectMode) {
          placeOnObject(camera)
          return
        }
        camera.getWorldDirection(forward)
        if (forward.y >= FLOOR_PITCH) {
          hint.setText(TEXT.scanFloor)
          return
        }
        if (tracking && tracking.status !== 'NORMAL') {
          hint.setText(TEXT.scanMove)
          return
        }
        hint.setText(TEXT.scanFloor)
        const floorY = measureFloor(camera.position.y, dt)
        if (floorY === null) {
          return
        }
        // floorSpot takes the floor as y = 0, so it gets everything measured from the real one.
        const anchor = floorSpot(
          objectPosition.clone().setY(objectPosition.y - floorY),
          camera.position.clone().setY(camera.position.y - floorY),
          forward,
          tallestCreature(exhibit)
        )
        if (anchor) {
          anchor.position.y += floorY
          placeExhibit(anchor)
        }
      }
    },

    onException: (error) => debug?.set('8th Wall exception', error?.stack || error?.message || error),

    // Without A-Frame, 8th Wall delivers reality.* events only to pipeline-module listeners.
    listeners: [
      {event: 'reality.imagefound', process: onObjectSeen},
      {event: 'reality.imageupdated', process: onObjectSeen},
      {event: 'reality.trackingstatus', process: onTrackingStatus},
    ],
  }
}

/** Starts the camera, with world tracking and every configured image target. */
export const startScan = () => {
  startXr(scanPipelineModule(), {imageTargetData: IMAGE_TARGET_DATA})
}

/** True when at least one image target is configured, so scanning can find something. */
export const canScan = IMAGE_TARGET_DATA.length > 0
