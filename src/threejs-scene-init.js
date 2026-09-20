// Define an 8th Wall XR Camera Pipeline Module that loads a few glTF (.glb) models
// into a threejs scene on startup, and lets the player tap them to make them hop.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// Vite turns these imports into served URLs for the binary model files.
import acornUrl from './assets/Acorn.glb'
import duckUrl from './assets/Duck.glb'
import glowcapUrl from './assets/Glowcap.glb'
import pineconeUrl from './assets/Pinecone.glb'

export const initScenePipelineModule = () => {
  const bpm = 70                 // "heartbeat" rate for the idle pulse animation
  const jumpDuration = 0.45      // seconds a tap-triggered hop takes, start to finish
  const jumpHeight = 0.35        // how high a tapped character hops
  const clock = new THREE.Clock()

  // Each entry describes one model: where to load it from, how tall to scale it, where
  // it stands on the floor (x/z), and the phase offset for its idle bob/pulse so they
  // don't all move in lockstep. Laid out as two rows: the tall characters (acorn,
  // pinecone) far at the back and the short ones (duck, glowcap) up front. The rows are
  // spaced deep enough that a front character never covers the one behind it, even at
  // a shallow viewing angle. Using depth instead of width keeps the group narrow, which
  // matters on a portrait phone screen (tall, so depth is cheap; narrow, so width is not).
  const items = [
    {url: acornUrl, targetHeight: 0.85, x: -0.4, z: -1.05, spinSpeed: 0.7, phase: 0},
    {url: pineconeUrl, targetHeight: 0.8, x: 0.4, z: -1.05, spinSpeed: -0.6, phase: Math.PI / 2},
    {url: duckUrl, targetHeight: 0.62, x: -0.4, z: 0.6, spinSpeed: 0.8, phase: Math.PI},
    {url: glowcapUrl, targetHeight: 0.55, x: 0.4, z: 0.6, spinSpeed: -0.5, phase: (Math.PI * 3) / 2},
  ]

  // Each item's animated container, populated once its model finishes loading.
  const groups = []
  // Elapsed-clock timestamp when an item was last tapped, or null if not hopping.
  // Parallel array to `items`/`groups`.
  const jumpStart = items.map(() => null)
  // Skeletal-animation mixers for models that ship with a built-in clip (glowcap, acorn).
  const mixers = []

  const raycaster = new THREE.Raycaster()

  // Measures a model so it can be scaled and placed and, if it ships an animation clip,
  // starts a mixer playing it. The box is "precise", built from the actual posed vertices.
  // The default Box3 only transforms each mesh's local box by its world matrix, which is a
  // loose fit whenever that matrix is rotated. The glowcap's skinned mesh node carries a
  // leftover Blender rotation and mirror, so its default box came out ~45% too tall and
  // twice too wide: the model was scaled far too small and hovered above its shadow. The
  // glowcap's idle clip only changes its height by ~2%, so its first frame is good enough.
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

  // Loads one model into its own group, normalizing scale/footing so it stands on the
  // floor at (x, 0, z) regardless of the source model's original size/pivot.
  const loadItem = ({url, targetHeight, x, z}, scene) => {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    scene.add(group)
    groups.push(group)

    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene
        const {box, mixer} = measureModel(model, gltf.animations[0])
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

        // Animated models come back with a mixer that is already playing their first clip.
        if (mixer) {
          mixers.push(mixer)
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

    items.forEach((item) => loadItem(item, scene))

    // A plane that receives the models' shadows.
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)

    const planeMaterial = new THREE.ShadowMaterial()
    planeMaterial.opacity = 0.6

    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.receiveShadow = true
    scene.add(plane)

    // Set the initial camera position relative to the scene. Must be above y = 0.
    // Pulled back a little so all three characters fit a portrait phone screen.
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

      // Tap a character to make it hop; tap empty space to recenter content instead.
      canvas.addEventListener(
        'touchstart', (e) => {
          if (e.touches.length !== 1) {
            return
          }
          const hitIndex = hitTestItems(e.touches[0], canvas, camera)
          if (hitIndex !== -1) {
            jumpStart[hitIndex] = clock.getElapsedTime()
          } else {
            XR8.XrController.recenter()
          }
        }, true
      )
    },

    // onUpdate is called once per frame. Spin, bob, and pulse each model, adding an
    // extra hop on top for whichever one was just tapped.
    onUpdate: () => {
      const dt = clock.getDelta()       // seconds since last frame (framerate-independent)
      const t = clock.getElapsedTime()  // total seconds since start

      mixers.forEach((mixer) => mixer.update(dt))

      groups.forEach((group, i) => {
        const {spinSpeed, phase} = items[i]

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

        group.position.y = 0.08 + Math.sin(t * 1.5 + phase) * 0.05 + hopOffset

        // Subtle "heartbeat" scale pulse at `bpm`, offset per item so they don't
        // beat in unison.
        const beat = t * (bpm / 60) * Math.PI * 2 + phase
        group.scale.setScalar(1 + Math.sin(beat) * 0.05)  // ±5% breathing
      })
    },
  }
}
