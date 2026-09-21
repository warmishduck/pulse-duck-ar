// The level diorama: a small stage standing in front of the camera that shows a slice of a
// side-scrolling level from the Lumina game, and the level's cooperative puzzle:
//  - you steer the acorn with on-screen buttons (or the keyboard);
//  - you send the Glowcap somewhere by tapping the ground (tap the Glowcap itself to call it
//    to the acorn). It walks there slowly and stops at ledges. It always shines, and the
//    "bloom" platforms are only there, and only solid, while it is close enough to light them;
//  - standing at the anchor, the acorn can grow a branch back over the gap. The branch holds
//    only while the acorn stays near the anchor;
//  - the level is won when the Glowcap reaches the green sphere.
//
// The level is much wider than the stage, so the stage is a window that scrolls (as the game's
// own camera does), clipped at its edges so it reads as a diorama box.
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

import acornUrl from './assets/Acorn.glb'
import glowcapUrl from './assets/Glowcap.glb'

import {branchPoints, branchSurface} from './branch'
import {createGlow, makeHaloTexture, updateGlow} from './glow'
import {LIGHT_THE_WAY} from './level-data'
import {createPlatformer, GLOWCAP, GLOWCAP_WALK, groundTopAt, PLAYER, walkToward} from './platformer'
import {measureModel, pinRootHorizontally} from './rig'
import {playSound} from './sound'

// Where the stage stands and how big it is, in world units. Its ground line (the top of the
// ground slabs) is `groundY` above the floor.
const STAGE = {x: 0, z: -0.35, width: 1.9, height: 1.5, groundY: 0.5}
const PLAYER_WORLD_HEIGHT = 0.30                       // the acorn's height on the stage
const SCALE = PLAYER_WORLD_HEIGHT / PLAYER.height      // world units per game unit
const VIEW_HALF = STAGE.width / 2 / SCALE              // half the stage's width, in game units

const FADE_SPEED = 8            // how fast a bloom platform fades in and out (the game's value)
const GHOST_ALPHA = 0.12        // how see-through an unlit bloom platform is (the game's value)
const BLOOM_EMISSION = 1.1      // how brightly a solid bloom platform glows
const TRAIL_SECONDS = 2.5       // how long a light puddle left by the acorn takes to fade
const TRAIL_SPACING = 0.7       // game units between puddles
const BRANCH_GROW_SECONDS = 0.7
const BRANCH_FADE_SECONDS = 0.4
const BRANCH_SEGMENTS = 7       // like the game's tapered branch
const RESET_AFTER_WIN = 7       // seconds after winning before the level starts over

// The acorn's jump clip, from probing it frame by frame: it crouches until ~0.5 s, leaves
// the ground at ~0.5 s, peaks at ~0.8 s and lands at ~1.1 s. Gameplay cannot wait for the
// crouch, so it starts at the take-off; it is slowed a little so its ~0.6 s in the air
// spans the physics jump's ~0.9 s. While falling it holds the mid-descent pose.
const JUMP_TAKEOFF_TIME = 0.45
const JUMP_APEX_TIME = 0.85
const JUMP_HOLD_TIME = 1.0
const JUMP_TIME_SCALE = 0.66

// A glow bar: bright at the bottom, fading upward and toward both ends. Sits on top of a
// lit bloom platform so it looks like light spilling upward from it.
const makeStripTexture = () => {
  const w = 128
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const up = ctx.createLinearGradient(0, h, 0, 0)
  up.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  up.addColorStop(0.35, 'rgba(255, 255, 255, 0.25)')
  up.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = up
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-in'  // now fade the two ends
  const across = ctx.createLinearGradient(0, 0, w, 0)
  across.addColorStop(0, 'rgba(0, 0, 0, 0)')
  across.addColorStop(0.15, 'rgba(0, 0, 0, 1)')
  across.addColorStop(0.85, 'rgba(0, 0, 0, 1)')
  across.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = across
  ctx.fillRect(0, 0, w, h)
  return new THREE.CanvasTexture(canvas)
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// `glowLight` is the scene's one shared glow light (see glow.js). `onEvent(name)` is told
// about 'won', 'respawn', 'branchLost' and 'reset' so the caller can show a message.
export const createLevel = ({glowLight, onEvent = () => {}, data = LIGHT_THE_WAY}) => {
  const root = new THREE.Group()
  root.visible = false

  // The stage is a box: everything outside it is clipped away (three needs
  // `renderer.localClippingEnabled = true` for this). Planes keep what is on their
  // positive side.
  const left = STAGE.x - STAGE.width / 2
  const right = STAGE.x + STAGE.width / 2
  const clipPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -left),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), right),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), STAGE.height),
  ]
  const clip = (material) => {
    material.clippingPlanes = clipPlanes
    material.clipShadows = true   // otherwise a long slab still throws its whole shadow outside the box
    return material
  }

  // Everything that belongs to the level itself lives in `content`, in game units, and
  // slides sideways to scroll the level under the fixed stage.
  const content = new THREE.Group()
  content.scale.setScalar(SCALE)
  content.position.set(STAGE.x, STAGE.groundY, STAGE.z)
  root.add(content)

  // The level's plane in the world, so a tap can be turned into a spot on the ground.
  const stagePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -STAGE.z)

  // ---- the stage box: a dim back wall and a thin outline ----
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE.width, STAGE.height),
    new THREE.MeshBasicMaterial({color: 0x08121c, transparent: true, opacity: 0.6, depthWrite: false})
  )
  backWall.position.set(STAGE.x, STAGE.height / 2, STAGE.z - 0.55)
  backWall.raycast = () => {}
  root.add(backWall)

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(STAGE.width, STAGE.height, 0.9)),
    new THREE.LineBasicMaterial({color: 0x59ffc0, transparent: true, opacity: 0.55})
  )
  outline.position.set(STAGE.x, STAGE.height / 2, STAGE.z)
  root.add(outline)

  // ---- ground slabs ----
  const slabMaterial = clip(new THREE.MeshStandardMaterial({color: 0x2a3644, roughness: 0.95}))
  const solids = []   // what the characters stand on: the slabs, and the bloom platforms while lit
  data.slabs.forEach((spec) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), slabMaterial)
    mesh.position.set(spec.x, spec.y, 0)
    mesh.receiveShadow = true
    mesh.castShadow = true
    content.add(mesh)
    solids.push({x: spec.x, y: spec.y, w: spec.w, h: spec.h, solid: true})
  })

  // ---- bloom platforms: solid and bright in the Glowcap's light, ghostly outside it ----
  const stripTexture = makeStripTexture()
  const blooms = data.blooms.map((spec) => {
    // The game's material is a light green with a strong emission, but the game applies tone
    // mapping and three (here) does not, so the same numbers blow out to white. A darker base
    // color and a gentler emission keep it looking green.
    const material = clip(new THREE.MeshStandardMaterial({
      color: 0x1f5a37,
      emissive: new THREE.Color(0.15, 0.6, 0.3),
      emissiveIntensity: BLOOM_EMISSION * GHOST_ALPHA,
      roughness: 0.6,
      transparent: true,
      opacity: GHOST_ALPHA,
    }))
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), material)
    mesh.position.set(spec.x, spec.y, 0)
    mesh.receiveShadow = true
    content.add(mesh)

    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w + 0.6, 1.0),
      clip(new THREE.MeshBasicMaterial({
        map: stripTexture, color: 0x8dffb0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
    )
    strip.position.set(spec.x, spec.y + spec.h / 2 + 0.5, spec.d / 2 + 0.02)
    strip.raycast = () => {}
    content.add(strip)

    const bloom = {spec, x: spec.x, y: spec.y, w: spec.w, h: spec.h, solid: false, oneWay: true, lit: false, alpha: GHOST_ALPHA, mesh, strip}
    solids.push(bloom)   // every bloom can be stood on while lit (from above: see `oneWay`)
    return bloom
  })

  // ---- puddles of light the acorn leaves behind on whatever it walks on ----
  const haloTexture = makeHaloTexture()
  const puddles = []
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      clip(new THREE.MeshBasicMaterial({
        map: haloTexture, color: 0x7dffb0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
    )
    mesh.rotation.x = -Math.PI / 2   // lie flat on the platform
    mesh.raycast = () => {}
    content.add(mesh)
    puddles.push({mesh, life: 0})
  }
  let nextPuddle = 0
  let lastPuddleX = -Infinity
  const dropPuddle = (x, y) => {
    const puddle = puddles[nextPuddle]
    nextPuddle = (nextPuddle + 1) % puddles.length
    puddle.mesh.position.set(x, y + 0.03, 0)
    puddle.life = TRAIL_SECONDS
    lastPuddleX = x
  }

  // ---- how far the Glowcap's light reaches: a soft disc behind the platforms ----
  const maxRadius = Math.max(...data.blooms.map((b) => b.radius))
  const lightDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(maxRadius * 2, maxRadius * 2),
    clip(new THREE.MeshBasicMaterial({
      map: haloTexture, color: 0x4dff9a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
  )
  lightDisc.position.z = -1.5
  lightDisc.raycast = () => {}
  content.add(lightDisc)

  // ---- the exit: a glowing green sphere at the far end ----
  const exit = new THREE.Mesh(
    new THREE.SphereGeometry(data.exit.r, 24, 16),
    clip(new THREE.MeshStandardMaterial({color: 0x4de680, emissive: 0x1ab333, emissiveIntensity: 2.5}))
  )
  exit.position.set(data.exit.x, data.exit.y, 0)
  content.add(exit)
  const exitHalo = new THREE.Sprite(clip(new THREE.SpriteMaterial({
    map: haloTexture, color: 0x7dffb0, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })))
  exitHalo.scale.setScalar(data.exit.r * 5)
  exitHalo.position.copy(exit.position)
  exitHalo.raycast = () => {}
  content.add(exitHalo)

  // ---- the anchor and the branch the acorn grows from it ----
  const anchor = data.anchor
  const nub = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 12),   // the game's nub is 0.18 across; bigger here so it can be seen
    clip(new THREE.MeshStandardMaterial({color: 0x3f9a5f, emissive: new THREE.Color(0.15, 0.55, 0.28), emissiveIntensity: 0.8}))
  )
  nub.position.set(anchor.x, anchor.y, 0)
  content.add(nub)
  const nubHalo = new THREE.Sprite(clip(new THREE.SpriteMaterial({
    map: haloTexture, color: 0x62d888, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })))
  nubHalo.scale.setScalar(2.6)
  nubHalo.position.copy(nub.position)
  nubHalo.raycast = () => {}
  content.add(nubHalo)

  // The branch is built from the same curve as the walkable surface, as tapered pieces that
  // appear one after another from the anchor.
  const surface = branchSurface(branchPoints(anchor))
  const surfaces = [surface]
  const branchMaterial = clip(new THREE.MeshStandardMaterial({color: 0x6b4a26, roughness: 0.95}))
  const branchPieces = []
  const pieceEnds = branchPoints({...anchor, samples: BRANCH_SEGMENTS})
  for (let i = 0; i < BRANCH_SEGMENTS; i++) {
    const a = pieceEnds[i]
    const b = pieceEnds[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const radiusA = 0.16 + (0.06 - 0.16) * (i / BRANCH_SEGMENTS)
    const radiusB = 0.16 + (0.06 - 0.16) * ((i + 1) / BRANCH_SEGMENTS)
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(radiusB, radiusA, length, 10), branchMaterial)
    piece.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
    piece.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y)   // aim the cylinder's axis along the piece
    piece.castShadow = true
    piece.visible = false
    content.add(piece)
    branchPieces.push(piece)
  }
  let branchWanted = false   // the acorn asked for it
  let branchGrow = 0         // 0 = gone, 1 = fully grown (and walkable)

  // ---- where the Glowcap was told to go ----
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.75, 32),
    clip(new THREE.MeshBasicMaterial({color: 0x9dffb0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide}))
  )
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  marker.raycast = () => {}
  content.add(marker)
  let glowTarget = null      // an x on the level, or null when it has nowhere to be

  // ---- the two characters ----
  const acorn = createPlatformer({spawns: data.respawns.acorn, fallY: data.fallY, body: PLAYER})
  const glowcap = createPlatformer({
    spawns: data.respawns.glowcap, fallY: data.fallY, body: GLOWCAP,
    exit: {...data.exit, r: data.exitTouchRadius},
  })
  const as = acorn.state
  const gs = glowcap.state

  const minCam = data.bounds.minX + VIEW_HALF
  const maxCam = data.bounds.maxX - VIEW_HALF
  // The opening shot frames both characters, so the Glowcap is on screen (and tappable) from
  // the start. The camera holds that shot until something happens, then only follows once
  // the followed character gets within `edgeMargin` of the stage's edge.
  const startCam = clamp((data.respawns.acorn[0].x + data.respawns.glowcap[0].x) / 2 + 3, minCam, maxCam)
  const edgeMargin = 2.0
  let camX = startCam
  let started = false
  content.position.x = STAGE.x - camX * SCALE

  const playerGroup = new THREE.Group()
  playerGroup.visible = false
  content.add(playerGroup)
  const glowcapGroup = new THREE.Group()
  glowcapGroup.visible = false
  content.add(glowcapGroup)

  // A generous invisible box to tap on: the Glowcap is small on the stage, and a fingertip is not.
  const glowcapHit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 3.6), new THREE.MeshBasicMaterial())
  glowcapHit.position.y = GLOWCAP.height / 2
  glowcapHit.visible = false
  glowcapGroup.add(glowcapHit)

  let active = false
  let loadStarted = false
  let acornReady = false
  let glowcapReady = false
  const mixers = []
  let actions = null
  let current = null
  let glow = null
  let glowAction = null
  let yaw = 0
  let glowYaw = 0
  let celebrate = 0     // seconds of victory light left
  let resetIn = null    // seconds until the level starts over after a win

  const finishModel = (model) => {
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach(clip)
      }
      if (node.isSkinnedMesh) {
        node.frustumCulled = false  // see threejs-scene-init.js: cached bounds go stale once bones move
      }
    })
  }

  const loadAcorn = () => {
    new GLTFLoader().load(acornUrl, (gltf) => {
      const model = gltf.scene
      const clips = gltf.animations
      const idleClip = THREE.AnimationClip.findByName(clips, 'Idle')
      // The physics decides how high the acorn is, so the jump clip must not add its own leap.
      pinRootHorizontally(model, clips, idleClip, {pinVerticallyIn: ['Jump']})
      const {box, mixer} = measureModel(model, idleClip)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const scale = PLAYER.height / size.y
      model.scale.setScalar(scale)
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
      finishModel(model)
      playerGroup.add(model)

      actions = {
        idle: mixer.clipAction(idleClip),
        run: mixer.clipAction(THREE.AnimationClip.findByName(clips, 'Run')),
        jump: mixer.clipAction(THREE.AnimationClip.findByName(clips, 'Jump')),
      }
      actions.jump.setLoop(THREE.LoopOnce, 1)
      actions.jump.clampWhenFinished = true
      current = actions.idle
      mixers.push(mixer)
      playerGroup.visible = true
      acornReady = true
    })
  }

  const loadGlowcap = () => {
    new GLTFLoader().load(glowcapUrl, (gltf) => {
      const model = gltf.scene
      const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0]
      const {box, mixer} = measureModel(model, idleClip)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const scale = GLOWCAP.height / size.y
      model.scale.setScalar(scale)
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
      finishModel(model)
      glowcapGroup.add(model)
      glowcapGroup.visible = true
      if (mixer) {
        mixers.push(mixer)
        glowAction = mixer.clipAction(idleClip)   // its one clip is the walk: played only while it moves, as in the game
      }
      // Sizes are in game units here, because the whole level is scaled down.
      glow = createGlow(glowcapGroup, model, glowLight, {haloSize: 5, haloY: 0.85, lightY: 1.0, lightDistance: 2.2})
      clip(glow.halo.material)
      if (active) {
        glow.attachLight()
        glow.target = 1   // in the game the Glowcap always shines
      }
      glowcapReady = true
    })
  }

  // ---- input: the on-screen buttons come in through update(); the keyboard is handled here ----
  const keys = new Set()
  let keyJump = false
  const onKeyDown = (event) => {
    if (event.repeat) {
      return
    }
    keys.add(event.code)
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      keyJump = true
    }
  }
  const onKeyUp = (event) => keys.delete(event.code)

  const switchAnimation = (next) => {
    if (!actions || next === current) {
      return
    }
    next.reset().play().crossFadeFrom(current, 0.12, false)
    current = next
  }

  const startJump = (fromApex) => {
    if (!actions) {
      return
    }
    const jump = actions.jump
    jump.reset()
    jump.time = fromApex ? JUMP_APEX_TIME : JUMP_TAKEOFF_TIME
    jump.timeScale = JUMP_TIME_SCALE
    jump.play()
    jump.crossFadeFrom(current, 0.08, false)
    current = jump
  }

  // How close the acorn is to the anchor (its centre against the nub).
  const distanceToAnchor = () => Math.hypot(as.x - anchor.x, as.y + PLAYER.height / 2 - anchor.y)

  // Starts the whole level over: both characters, the branch, the camera.
  const resetLevel = () => {
    acorn.reset()
    glowcap.reset()
    branchWanted = false
    branchGrow = 0
    glowTarget = null
    celebrate = 0
    resetIn = null
    camX = startCam
    started = false
    lastPuddleX = -Infinity
    onEvent('reset')
  }

  return {
    root,

    // Loads the acorn and the Glowcap the first time the level is shown, so the creature
    // showcase (and the page's first load) does not pay for them.
    ensureLoaded() {
      if (!loadStarted) {
        loadStarted = true
        loadAcorn()
        loadGlowcap()
      }
    },
    isReady: () => acornReady && glowcapReady,

    setActive(on) {
      active = on
      root.visible = on
      if (on) {
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        if (glow) {
          glow.attachLight()
          glow.target = 1
        }
      } else {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        keys.clear()
        if (glow) {
          glow.target = 0
          glow.level = 0
          glowLight.intensity = 0
        }
      }
    },

    // Turns a tap into an order for the Glowcap: tap the Glowcap itself and it comes to the
    // acorn; tap the stage and it walks toward that spot. Returns false when the tap missed
    // the stage (the caller then treats it as a tap on empty space).
    tap(raycaster) {
      if (!active || !acornReady || !glowcapReady) {
        return false
      }
      // Raycasting reads each object's world matrix, which normally is refreshed when the
      // frame is drawn. Refresh it here so a tap always hits where things are NOW.
      root.updateMatrixWorld(true)
      if (raycaster.intersectObject(glowcapHit, false).length > 0) {
        glowTarget = as.x
        playSound('pop')
        return true
      }
      const point = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(stagePlane, point) ||
          Math.abs(point.x - STAGE.x) > STAGE.width / 2 || point.y < 0 || point.y > STAGE.height) {
        return false
      }
      glowTarget = clamp((point.x - content.position.x) / SCALE, data.bounds.minX, data.bounds.maxX)
      playSound('pop')
      return true
    },

    // The context button for the anchor: its label while the acorn is close enough to use it,
    // otherwise null (no button).
    action() {
      if (!active || !acornReady || distanceToAnchor() > anchor.interactRange) {
        return null
      }
      return branchWanted ? 'remove' : 'grow'
    },
    pressAction() {
      if (this.action() === null) {
        return
      }
      branchWanted = !branchWanted
      playSound(branchWanted ? 'plink' : 'glowOff')
    },

    // Called every frame while the level is showing. `input` is {dir: -1|0|1, jumpPressed}
    // from the on-screen buttons; the keyboard adds to it.
    update(dt, t, input) {
      if (!active) {
        return
      }
      mixers.forEach((mixer) => mixer.update(dt))
      if (!acornReady || !glowcapReady) {
        return
      }

      // The Glowcap's light decides which bloom platforms exist. A bloom is solid while the
      // Glowcap is within its radius: the same rule as the game's night_bloom_platform.gd
      // (distance to the Glowcap <= light_radius).
      const glowX = gs.x
      const glowY = gs.y + GLOWCAP.height / 2
      blooms.forEach((bloom) => {
        bloom.lit = Math.hypot(bloom.x - glowX, bloom.y - glowY) <= bloom.spec.radius
        bloom.solid = bloom.lit
      })

      // The branch: it holds while the acorn stays near the anchor and goes when it wanders off.
      if (branchWanted && distanceToAnchor() > anchor.lightRange) {
        branchWanted = false
        playSound('glowOff')
        onEvent('branchLost')
      }
      branchGrow = clamp(branchGrow + (branchWanted ? dt / BRANCH_GROW_SECONDS : -dt / BRANCH_FADE_SECONDS), 0, 1)
      surface.active = branchGrow >= 1

      // The acorn.
      const keyDir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
      const dir = clamp(input.dir + keyDir, -1, 1)
      const jumpPressed = input.jumpPressed || keyJump
      keyJump = false
      acorn.step(dt, {dir, jumpPressed}, solids, surfaces)

      // The Glowcap: it walks toward where it was sent, one step of the game's rules at a time.
      let order = {dir: 0, jumpPressed: false}
      if (glowTarget !== null) {
        const walk = walkToward(gs, glowTarget, solids, surfaces, GLOWCAP_WALK)
        if (walk.done) {
          glowTarget = null
        } else {
          order = {dir: walk.dir, jumpPressed: walk.jump}
        }
      }
      glowcap.step(dt, order, solids, surfaces)

      for (const event of acorn.drainEvents()) {
        if (event === 'jump') {
          playSound('boing')
          startJump(false)
        } else if (event === 'respawn') {
          playSound('squeak')
          camX = clamp(as.x, minCam, maxCam)
          started = as.x !== data.respawns.acorn[0].x   // back at the very start: the opening shot again
          if (!started) {
            camX = startCam
          }
          onEvent('respawn')
        } else if (event.type === 'land' && event.speed > 9) {
          playSound('pop')
        }
      }
      for (const event of glowcap.drainEvents()) {
        if (event === 'respawn') {
          glowTarget = null
          playSound('squeak')
          onEvent('respawn')
        } else if (event === 'won') {
          playSound('glowOn')
          celebrate = 4
          resetIn = RESET_AFTER_WIN
          glowTarget = null
          onEvent('won')
        }
      }
      if (resetIn !== null) {
        resetIn -= dt
        if (resetIn <= 0) {
          resetLevel()
        }
      }

      // The acorn's animation: idle, run, or the jump pose while off the ground.
      if (!as.onGround) {
        if (current !== actions.jump) {
          startJump(true)   // walked off a ledge: start in the falling pose
        }
        if (actions.jump.time > JUMP_HOLD_TIME) {
          actions.jump.time = JUMP_HOLD_TIME
        }
      } else if (dir !== 0 && Math.abs(as.vx) > 0.4) {
        actions.run.timeScale = Math.max(0.6, Math.abs(as.vx) / PLAYER.walkSpeed)
        switchAnimation(actions.run)
      } else {
        switchAnimation(actions.idle)
      }

      // Place and turn the acorn. In profile while moving, three-quarters to the viewer at rest.
      const moving = dir !== 0 || !as.onGround
      yaw += (as.facing * (moving ? 1.3 : 0.75) - yaw) * (1 - Math.exp(-dt * 12))
      playerGroup.position.set(as.x, as.y, 0)
      playerGroup.rotation.y = yaw

      // Place and turn the Glowcap; its walking animation runs only while it moves.
      const glowMoving = Math.abs(gs.vx) > 0.25
      if (glowAction) {
        glowAction.paused = !glowMoving
      }
      glowYaw += (gs.facing * (glowMoving ? 1.2 : 0.5) - glowYaw) * (1 - Math.exp(-dt * 10))
      glowcapGroup.position.set(gs.x, gs.y, 0)
      glowcapGroup.rotation.y = glowYaw

      // Light puddles under the acorn's feet.
      if (as.onGround && as.groundedOn && Math.abs(as.x - lastPuddleX) > TRAIL_SPACING) {
        dropPuddle(as.x, as.groundedOn.y + as.groundedOn.h / 2)
      }
      puddles.forEach((puddle) => {
        puddle.life = Math.max(0, puddle.life - dt)
        puddle.mesh.material.opacity = (puddle.life / TRAIL_SECONDS) * 0.55
      })

      // Bloom platforms fade toward solid or ghost, and glow while lit.
      blooms.forEach((bloom) => {
        const target = bloom.lit ? 1 : GHOST_ALPHA
        bloom.alpha += clamp(target - bloom.alpha, -FADE_SPEED * dt, FADE_SPEED * dt)
        bloom.mesh.material.opacity = bloom.alpha
        bloom.mesh.material.emissiveIntensity = BLOOM_EMISSION * bloom.alpha
        bloom.mesh.castShadow = bloom.alpha > 0.6 && !bloom.spec.decor
        const shine = (bloom.alpha - GHOST_ALPHA) / (1 - GHOST_ALPHA)
        bloom.strip.material.opacity = shine * 0.4
      })

      // The branch grows out piece by piece from the anchor.
      branchPieces.forEach((piece, i) => {
        const grown = clamp(branchGrow * BRANCH_SEGMENTS - i, 0, 1)
        piece.visible = grown > 0
        piece.scale.set(1, Math.max(grown, 0.001), 1)
      })
      // The anchor's nub calls for attention while the acorn is close enough to use it.
      const near = distanceToAnchor() <= anchor.interactRange
      nubHalo.material.opacity = (near ? 0.55 : 0.25) + 0.08 * Math.sin(t * 4)

      // The Glowcap's own glow, and the disc showing how far its light reaches.
      updateGlow(glow, dt, t)
      lightDisc.position.x = glowX
      lightDisc.position.y = glowY
      lightDisc.material.opacity = glow.level * 0.2

      // Where the Glowcap was told to go.
      marker.visible = glowTarget !== null
      if (glowTarget !== null) {
        const ground = groundTopAt(glowTarget, solids, surfaces, gs.y, 60, 60)
        marker.position.set(glowTarget, (ground === null ? gs.y : ground) + 0.05, 0)
        marker.material.opacity = 0.5 + 0.3 * Math.sin(t * 6)
      }

      // The exit pulses, and a lot more for a few seconds after you reach it.
      celebrate = Math.max(0, celebrate - dt)
      const pulse = 1 + 0.08 * Math.sin(t * 3) + (celebrate > 0 ? 0.35 * Math.sin(t * 9) : 0)
      exit.scale.setScalar(pulse)
      exitHalo.material.opacity = 0.5 + (celebrate > 0 ? 0.4 : 0)

      // Scroll the level under the stage: hold still until whoever we are following nears an
      // edge, then follow just enough to keep them `edgeMargin` inside it. While the Glowcap
      // is on its way and the acorn is standing by, the Glowcap is the one to watch. The
      // window is centred a bit ahead of the way that character faces.
      if (dir !== 0 || jumpPressed || glowTarget !== null) {
        started = true
      }
      if (started) {
        const watchGlowcap = glowTarget !== null && Math.abs(as.vx) < 0.2 && as.onGround
        const followed = watchGlowcap ? gs : as
        const slack = VIEW_HALF - edgeMargin
        const centre = followed.x + followed.facing * 1.5
        const wanted = clamp(clamp(camX, centre - slack, centre + slack), minCam, maxCam)
        camX += (wanted - camX) * (1 - Math.exp(-dt * 6))
      }
      content.position.x = STAGE.x - camX * SCALE
    },
  }
}
