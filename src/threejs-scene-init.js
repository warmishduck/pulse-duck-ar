// Define an 8th Wall XR Camera Pipeline Module that loads a couple of glTF (.glb)
// models into a threejs scene on startup, and lets the player tap them to make them
// hop.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Vite turns these imports into served URLs for the binary model files.
import duckUrl from './assets/Duck.glb'
import pineconeUrl from './assets/Pinecone.glb'

export const initScenePipelineModule = () => {
  const bpm = 70                 // "heartbeat" rate for the idle pulse animation
  const jumpDuration = 0.45      // seconds a tap-triggered hop takes, start to finish
  const jumpHeight = 0.35        // how high a tapped character hops
  const clock = new THREE.Clock()

  // Each entry describes one model: where to load it from, how tall to scale it,
  // where to place it (side by side), and the phase offset for its idle bob/pulse so
  // the two don't move in perfect lockstep.
  const items = [
    {url: duckUrl, targetHeight: 1.0, offsetX: -0.6, spinSpeed: 0.8, phase: 0},
    {url: pineconeUrl, targetHeight: 0.9, offsetX: 0.6, spinSpeed: -0.6, phase: Math.PI},
  ]

  // Each item's animated container, populated once its model finishes loading.
  const groups = []
  // Elapsed-clock timestamp when an item was last tapped, or null if not hopping.
  // Parallel array to `items`/`groups`.
  const jumpStart = items.map(() => null)

  const raycaster = new THREE.Raycaster()

  // Loads one model into its own group, normalizing scale/footing so it stands on
  // the floor at (offsetX, 0, 0) regardless of the source model's original size/pivot.
  const loadItem = ({url, targetHeight, offsetX}, scene) => {
    const group = new THREE.Group()
    group.position.x = offsetX
    scene.add(group)
    groups.push(group)

    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene

        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const scale = targetHeight / size.y
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
          }
        })

        group.add(model)
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

    // Key light that casts shadows.
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Hemisphere fill light so the models' shaded side isn't pitch black.
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 1.0)
    scene.add(hemiLight)

    items.forEach((item) => loadItem(item, scene))

    // A plane that receives the models' shadows.
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)

    const planeMaterial = new THREE.ShadowMaterial()
    planeMaterial.opacity = 0.67

    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.receiveShadow = true
    scene.add(plane)

    // Set the initial camera position relative to the scene. Must be above y = 0.
    // Pulled back a bit further than a single-model scene since there are two items
    // side by side now.
    camera.position.set(0, 2, 2.6)
  }

  // Casts a ray from the tap position through the camera and returns the index into
  // `items`/`groups` of whichever character was hit, or -1 if the tap missed both.
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
