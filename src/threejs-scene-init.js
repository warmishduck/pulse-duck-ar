// Define an 8th Wall XR Camera Pipeline Module that loads a glTF (.glb) model into a
// threejs scene on startup.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Vite turns this import into a served URL for the binary model file.
import modelUrl from './assets/Duck.glb'

export const initScenePipelineModule = () => {
  const bpm = 70                        // "heartbeat" rate for the pulse animation
  const targetHeight = 1.0              // scale the model so it stands ~1 unit tall
  const clock = new THREE.Clock()

  // Container the model is loaded into. Added to the scene up front so onUpdate always
  // has something to animate, even before the async model finishes loading.
  const content = new THREE.Group()

  // Populates the scene and sets the initial camera position.
  const initXrScene = ({scene, camera, renderer}) => {
    // Enable shadows in the renderer.
    renderer.shadowMap.enabled = true

    // Key light that casts shadows.
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Hemisphere fill light so the model's shaded side isn't pitch black.
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 1.0)
    scene.add(hemiLight)

    // The animated container that will hold the loaded model.
    scene.add(content)

    // Load the .glb model asynchronously.
    const loader = new GLTFLoader()
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene

        // Normalize size and footing: scale so the model is ~targetHeight tall, then
        // recenter horizontally and lift so its base sits on the floor (y = 0).
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const scale = targetHeight / size.y
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        // Let every mesh in the model cast shadows.
        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
          }
        })

        content.add(model)
      },
      undefined,
      (err) => {
        console.error('Failed to load model:', err)  // shows up in the phone's console
      }
    )

    // A plane that receives the model's shadow.
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)

    const planeMaterial = new THREE.ShadowMaterial()
    planeMaterial.opacity = 0.67

    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.receiveShadow = true
    scene.add(plane)

    // Set the initial camera position relative to the scene. Must be above y = 0.
    camera.position.set(0, 2, 2)
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

      // Recenter content when the canvas is tapped.
      canvas.addEventListener(
        'touchstart', (e) => {
          e.touches.length === 1 && XR8.XrController.recenter()
        }, true
      )
    },

    // onUpdate is called once per frame. Spin, bob, and pulse the model.
    onUpdate: () => {
      const dt = clock.getDelta()       // seconds since last frame (framerate-independent)
      const t = clock.getElapsedTime()  // total seconds since start

      content.rotation.y += dt * 0.8    // ~0.8 rad/s continuous spin
      content.position.y = 0.08 + Math.sin(t * 1.5) * 0.05  // gentle hover + bob

      // Subtle "heartbeat" scale pulse at `bpm`.
      const beat = t * (bpm / 60) * Math.PI * 2
      content.scale.setScalar(1 + Math.sin(beat) * 0.05)    // ±5% breathing
    },
  }
}
