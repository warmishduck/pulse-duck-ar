// Define an 8th Wall XR Camera Pipeline Module that loads a few glTF (.glb) models
// into a threejs scene on startup. Tapping a character makes it react, each in its own
// way: the pinecone hops, the acorn plays one of its animations, the glowcap lights up.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// Vite turns these imports into served URLs for the binary model files.
import acornUrl from './assets/Acorn.glb'
import glowcapUrl from './assets/Glowcap.glb'
import pineconeUrl from './assets/Pinecone.glb'

export const initScenePipelineModule = () => {
  const bpm = 70                 // "heartbeat" rate for the idle pulse animation
  const jumpDuration = 0.45      // seconds a tap-triggered hop takes, start to finish
  const jumpHeight = 0.35        // how high a tapped character hops
  const hitBoxExtraHeight = 0.4  // headroom above an animated character that still counts as a hit
  const clock = new THREE.Clock()

  // Each entry describes one model. Required: where to load it from, how tall to scale it,
  // where it stands on the floor (x/z), and the phase offset for its idle bob/pulse so they
  // don't all move in lockstep. Optional:
  //   spinSpeed  turntable spin in rad/s (default 0: it just faces the viewer)
  //   yaw        starting rotation about the vertical axis, in radians
  //   hover/bob  how high it floats above the floor and how much it bobs (defaults 0.08/0.05)
  //   hop        set false to skip the tap-triggered hop
  //   reactions  built-in clips to play on tap (random pick, never the same one twice in a
  //              row), then it eases back to its 'Idle' clip. `repeat` loops a short clip.
  //   glow       tapping toggles a glow instead
  // The tall characters (acorn, pinecone) stand far at the back and the short glowcap up
  // front, spaced by depth rather than width: that keeps the group narrow, which matters
  // on a portrait phone screen (tall, so depth is cheap; narrow, so width is not).
  const items = [
    {
      url: acornUrl, targetHeight: 0.85, x: -0.45, z: -0.85, phase: 0,
      yaw: 0.3, hover: 0, bob: 0, hop: false,
      reactions: [
        {clip: 'Jump'},
        {clip: 'Ouch'},
        {clip: 'PickUp'},
        {clip: 'PickThrow'},
        {clip: 'Run', repeat: 3},
      ],
    },
    {url: pineconeUrl, targetHeight: 0.8, x: 0.45, z: -0.85, spinSpeed: -0.6, phase: Math.PI / 2},
    {url: glowcapUrl, targetHeight: 0.55, x: 0, z: 0.5, spinSpeed: -0.5, phase: Math.PI, hop: false, glow: true},
  ]

  // Each item's animated container, populated once its model finishes loading.
  const groups = []
  // Elapsed-clock timestamp when an item was last tapped, or null if not hopping.
  // Parallel array to `items`/`groups`.
  const jumpStart = items.map(() => null)
  // Skeletal-animation mixers for models that ship with a built-in clip (glowcap, acorn).
  const mixers = []
  // Tap-reaction state for items with `reactions` and glow state for items with `glow`
  // (both parallel to `items`, filled in once the model has loaded).
  const reactionStates = items.map(() => null)
  const glows = items.map(() => null)
  let glowLight = null  // the point light the glow drives, created in initXrScene

  const raycaster = new THREE.Raycaster()

  // Measures a model so it can be scaled and placed and, if it ships an animation clip,
  // starts a mixer playing it. The box is "precise", built from the actual posed vertices.
  // The default Box3 only transforms each mesh's local box by its world matrix, which is a
  // loose fit whenever that matrix is rotated. The glowcap's skinned mesh node carries a
  // leftover Blender rotation and mirror, so its default box came out ~45% too tall and
  // twice too wide: the model was scaled far too small and hovered above its shadow. The
  // idle clips only change their model's height by a few %, so their first frame is fine.
  const measureModel = (model, clip) => {
    const mixer = clip ? new THREE.AnimationMixer(model) : null
    if (mixer) {
      mixer.clipAction(clip).play()
      mixer.setTime(0)
    }
    // Bones need world matrices before a skinned mesh can report its posed vertices.
    model.updateMatrixWorld(true)
    return {box: new THREE.Box3().setFromObject(model, true), mixer}
  }

  // The reaction clips ship with the root bone ("Hips") travelling: the jump leaps forward,
  // the run cycle drifts. On screen the character would slide off its spot and snap back
  // when the clip ends. Pin the root's horizontal position to where the idle clip starts and
  // keep its vertical motion: that IS the jump, the crouch and the bend. Must run before the
  // model is scaled or moved, so "model space" here is the model's own Y-up space.
  const pinRootHorizontally = (model, clips, idleClip) => {
    const hips = model.getObjectByName('Hips')
    const anchorTrack = idleClip.tracks.find((track) => track.name === 'Hips.position')
    if (!hips || !hips.parent || !anchorTrack) {
      return
    }
    model.updateMatrixWorld(true)
    // The root's translation is expressed in its parent's space (which carries the
    // armature's rotation and scale). Convert to model space, pin x/z, convert back.
    const toModel = new THREE.Matrix3().setFromMatrix4(hips.parent.matrixWorld)
    const toParent = toModel.clone().invert()
    const anchor = new THREE.Vector3().fromArray(anchorTrack.values, 0).applyMatrix3(toModel)
    const v = new THREE.Vector3()
    clips.forEach((clip) => {
      const track = clip.tracks.find((t) => t.name === 'Hips.position')
      if (!track || clip === idleClip) {
        return
      }
      for (let i = 0; i < track.values.length; i += 3) {
        v.fromArray(track.values, i).applyMatrix3(toModel)
        v.x = anchor.x
        v.z = anchor.z
        v.applyMatrix3(toParent).toArray(track.values, i)
      }
    })
  }

  // Sets up tap reactions for an animated model: one action per reaction clip, and the way
  // back to the idle loop once a reaction has finished.
  const setupReactions = (index, mixer, idleAction, clips, reactions) => {
    const list = []
    reactions.forEach(({clip, repeat}) => {
      const found = THREE.AnimationClip.findByName(clips, clip)
      if (!found) {
        console.warn(`Reaction clip "${clip}" not found in the model`)
        return
      }
      const action = mixer.clipAction(found)
      action.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat || 1)
      action.clampWhenFinished = true  // hold the last pose while easing back to idle
      list.push(action)
    })
    if (list.length === 0) {
      return
    }

    // The first tap always plays the first listed reaction (the jump); the rest of that
    // round follows in random order.
    const rest = shuffled(list.map((action, i) => i).slice(1))
    const state = {idle: idleAction, list, current: null, queue: [0, ...rest], last: -1}
    reactionStates[index] = state
    mixer.addEventListener('finished', (event) => {
      // Ignore clips that were interrupted by a newer tap; only the current one returns to idle.
      if (event.action === state.current) {
        idleAction.reset().play().crossFadeFrom(event.action, 0.4, false)
        state.current = null
      }
    })
  }

  // Returns a copy of `array` in random order (Fisher-Yates).
  const shuffled = (array) => {
    const copy = array.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const swap = copy[i]
      copy[i] = copy[j]
      copy[j] = swap
    }
    return copy
  }

  // Picks which reaction plays next. They come out of a shuffled "bag": every reaction
  // plays once before any repeats, so a few taps show all of them (pure random would
  // sometimes take a dozen taps to show one), and never the same one twice in a row.
  const nextReactionIndex = (state) => {
    if (state.queue.length === 0) {
      state.queue = shuffled(state.list.map((action, i) => i))
      if (state.queue.length > 1 && state.queue[0] === state.last) {
        state.queue.push(state.queue.shift())  // don't open a round with the one that just played
      }
    }
    return state.queue.shift()
  }

  // Plays the next reaction. A tap during a reaction interrupts it and blends straight
  // into the next one.
  const playReaction = (index) => {
    const state = reactionStates[index]
    if (!state) {
      return
    }
    const pick = nextReactionIndex(state)
    state.last = pick

    const next = state.list[pick]
    const from = state.current || state.idle
    next.reset().play().crossFadeFrom(from, state.current ? 0.2 : 0.25, false)
    state.current = next
  }

  // A soft round blob used as the glowcap's halo: white in the middle, fading to nothing.
  const makeHaloTexture = () => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    // Several stops make a smooth, roughly quadratic falloff; with just two or three the
    // edge of the disc shows up as a visible ring.
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.55)')
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)')
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.03)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }

  // Sets up the glowcap's glow: its emissive spots get brighter, a green point light and a
  // halo sprite fade in around it. `level` eases toward `target` (0 = off, 1 = on) so it
  // fades smoothly; tapping flips `target`.
  const createGlow = (group, model) => {
    const materials = []
    model.traverse((node) => {
      if (node.isMesh && node.material && node.material.emissive) {
        materials.push(node.material)
      }
    })

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeHaloTexture(),
      color: 0xb6ff8a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,  // adds light instead of covering what's behind it
      depthWrite: false,
      depthTest: false,  // otherwise the floor plane slices off the bottom of the halo
    }))
    halo.scale.setScalar(1.3)
    halo.position.y = 0.28
    // The halo is a big see-through billboard in front of whatever stands behind the
    // glowcap. Raycasting ignores transparency, so left alone it would swallow taps meant
    // for those characters.
    halo.raycast = () => {}
    group.add(halo)

    glowLight.position.set(0, 0.3, 0)
    group.add(glowLight)

    return {
      materials,
      baseEmissive: materials.map((material) => material.emissiveIntensity),
      halo,
      level: 0,
      target: 0,
    }
  }

  const updateGlow = (glow, dt, t) => {
    glow.level += (glow.target - glow.level) * (1 - Math.exp(-dt * 4))
    const flicker = 0.85 + 0.15 * Math.sin(t * 3)  // slow shimmer while lit
    glow.materials.forEach((material, i) => {
      material.emissiveIntensity = glow.baseEmissive[i] + glow.level * 0.9 * flicker
    })
    glowLight.intensity = glow.level * 1.6 * flicker
    glow.halo.material.opacity = glow.level * 0.5 * flicker
  }

  // Loads one model into its own group, normalizing scale/footing so it stands on the
  // floor at (x, 0, z) regardless of the source model's original size/pivot.
  const loadItem = (index, scene) => {
    const {url, targetHeight, x, z, yaw = 0, reactions, glow} = items[index]
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = yaw
    scene.add(group)
    groups[index] = group

    if (reactions) {
      // An invisible box to tap on. A moving skinned mesh is a poor hit target (its cached
      // bounds are computed once, in one pose, so a jump can leave them). Raycasting ignores
      // `visible`, so this box still catches taps without being drawn.
      const height = targetHeight + hitBoxExtraHeight
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), new THREE.MeshBasicMaterial())
      hitBox.position.y = height / 2
      hitBox.visible = false
      group.add(hitBox)
    }

    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene
        const clips = gltf.animations
        const idleClip = THREE.AnimationClip.findByName(clips, 'Idle') || clips[0]
        if (reactions) {
          pinRootHorizontally(model, clips, idleClip)
        }

        const {box, mixer} = measureModel(model, idleClip)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        const scale = targetHeight / size.y
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
          }
          if (node.isSkinnedMesh) {
            // three caches the bounding sphere once, from a single pose; once the bones
            // animate, the mesh can drift outside it and get wrongly culled.
            node.frustumCulled = false
          }
        })

        group.add(model)

        // Animated models come back with a mixer that is already playing their idle clip.
        if (mixer) {
          mixers.push(mixer)
          if (reactions) {
            setupReactions(index, mixer, mixer.clipAction(idleClip), clips, reactions)
          }
        }
        if (glow) {
          glows[index] = createGlow(group, model)
        }
      },
      undefined,
      (err) => {
        console.error(`Failed to load model ${url}:`, err)  // shows up in the phone's console
      }
    )
  }

  // Populates the scene and sets the initial camera position.
  const initXrScene = ({scene, camera, renderer}) => {
    // Enable shadows in the renderer.
    renderer.shadowMap.enabled = true

    // Image-based lighting. The models use PBR materials, which look flat and dark
    // with only direct lights; a small built-in "room" environment gives them soft,
    // believable reflections and ambient fill. It does not touch the camera feed.
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.8
    pmrem.dispose()

    // Warm key light that casts the shadows. The shadow camera is fitted tightly around
    // the play area (default is +/-5, which smears a 512px shadow map into mush).
    const directionalLight = new THREE.DirectionalLight(0xfff4e5, 1.6)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(1024, 1024)
    directionalLight.shadow.camera.left = -2
    directionalLight.shadow.camera.right = 2
    directionalLight.shadow.camera.top = 2
    directionalLight.shadow.camera.bottom = -2
    directionalLight.shadow.camera.near = 1
    directionalLight.shadow.camera.far = 25
    directionalLight.shadow.camera.updateProjectionMatrix()
    directionalLight.shadow.bias = -0.0004       // avoid self-shadow "acne" speckles
    directionalLight.shadow.normalBias = 0.02
    scene.add(directionalLight)

    // Soft sky/ground fill so the shaded side isn't pitch black. Dimmer than before
    // because the environment map now supplies most of the ambient light.
    const hemiLight = new THREE.HemisphereLight(0xdde8ff, 0x444466, 0.4)
    scene.add(hemiLight)

    // The glowcap's glow light. It is created up front at zero intensity, because adding a
    // light later changes the light count and makes three recompile every lit material,
    // which would freeze the first tap for a moment. Once the glowcap loads it moves in.
    glowLight = new THREE.PointLight(0x9dff7a, 0, 2.5, 2)
    scene.add(glowLight)

    items.forEach((item, i) => loadItem(i, scene))

    // A plane that receives the models' shadows.
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)

    const planeMaterial = new THREE.ShadowMaterial()
    planeMaterial.opacity = 0.6

    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.receiveShadow = true
    scene.add(plane)

    // Set the initial camera position relative to the scene. Must be above y = 0.
    // Pulled back a little so all the characters fit a portrait phone screen.
    camera.position.set(0, 2, 3.5)
  }

  // Casts a ray from the tap position through the camera and returns the index into
  // `items`/`groups` of whichever character was hit, or -1 if the tap missed them all.
  const hitTestItems = (touch, canvas, camera) => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((touch.clientX - rect.left) / rect.width) * 2 - 1,
      -((touch.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)

    const hits = raycaster.intersectObjects(groups, true)  // true: check nested meshes too
    if (hits.length === 0) {
      return -1
    }

    // Walk up from the hit mesh to whichever top-level group it belongs to.
    let node = hits[0].object
    while (node && !groups.includes(node)) {
      node = node.parent
    }
    return groups.indexOf(node)
  }

  // Makes the tapped character react in whatever way its entry in `items` describes.
  const onTap = (index) => {
    if (items[index].hop !== false) {
      jumpStart[index] = clock.getElapsedTime()
    }
    playReaction(index)  // does nothing for models without reactions
    if (glows[index]) {
      glows[index].target = glows[index].target ? 0 : 1
    }
  }

  // Return a camera pipeline module that adds scene elements on start.
  return {
    // Camera pipeline modules need a unique name.
    name: 'threejsinitscene',

    // onStart is called once when the camera feed begins.
    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()  // Get the 3js scene.

      initXrScene({scene, camera, renderer})  // Add objects and set the starting camera.

      // Prevent scroll/pinch gestures on the canvas.
      canvas.addEventListener('touchmove', (event) => {
        event.preventDefault()
      })

      // Sync the xr controller's 6DoF position and camera parameters with our scene.
      XR8.XrController.updateCameraProjectionMatrix(
        {origin: camera.position, facing: camera.quaternion}
      )

      // Tap a character to make it react; tap empty space to recenter content instead.
      canvas.addEventListener(
        'touchstart', (e) => {
          if (e.touches.length !== 1) {
            return
          }
          const hitIndex = hitTestItems(e.touches[0], canvas, camera)
          if (hitIndex !== -1) {
            onTap(hitIndex)
          } else {
            XR8.XrController.recenter()
          }
        }, true
      )
    },

    // onUpdate is called once per frame. Advance the skeletal animations, then spin, bob
    // and pulse each model, adding a hop on top for whichever one was just tapped.
    onUpdate: () => {
      const dt = clock.getDelta()       // seconds since last frame (framerate-independent)
      const t = clock.getElapsedTime()  // total seconds since start

      mixers.forEach((mixer) => mixer.update(dt))
      glows.forEach((glow) => glow && updateGlow(glow, dt, t))

      groups.forEach((group, i) => {
        const {spinSpeed = 0, phase, hover = 0.08, bob = 0.05} = items[i]

        group.rotation.y += dt * spinSpeed

        // Tap-triggered hop: a half sine arc over `jumpDuration` seconds, then done.
        let hopOffset = 0
        if (jumpStart[i] !== null) {
          const elapsed = t - jumpStart[i]
          if (elapsed < jumpDuration) {
            hopOffset = Math.sin((elapsed / jumpDuration) * Math.PI) * jumpHeight
          } else {
            jumpStart[i] = null
          }
        }

        group.position.y = hover + Math.sin(t * 1.5 + phase) * bob + hopOffset

        // Subtle "heartbeat" scale pulse at `bpm`, offset per item so they don't
        // beat in unison.
        const beat = t * (bpm / 60) * Math.PI * 2 + phase
        group.scale.setScalar(1 + Math.sin(beat) * 0.05)  // ±5% breathing
      })
    },
  }
}
