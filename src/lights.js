// The lighting and the floor that catches shadows, shared by the AR view and the welcome page so
// the creatures look the same in both.
import * as THREE from 'three'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'

// Adds the lights to `scene` and returns {glowLight}: the one point light the glowcap's glow
// drives. It is created up front at zero intensity, because adding a light later changes the
// light count and makes three recompile every lit material, which would freeze the first tap
// for a moment. Each glow moves it into its own group when it is on show.
export const addLights = (scene, renderer) => {
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
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x444466, 0.4))

  const glowLight = new THREE.PointLight(0x9dff7a, 0, 2.5, 2)
  scene.add(glowLight)
  return {glowLight}
}

// A plane that receives the models' shadows and is otherwise invisible (in AR the camera feed
// shows through it).
export const addShadowFloor = (scene) => {
  const geometry = new THREE.PlaneGeometry(2000, 2000)
  geometry.rotateX(-Math.PI / 2)

  const material = new THREE.ShadowMaterial()
  material.opacity = 0.6

  const floor = new THREE.Mesh(geometry, material)
  floor.receiveShadow = true
  scene.add(floor)
  return floor
}
