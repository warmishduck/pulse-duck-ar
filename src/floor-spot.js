// Where content goes once a recognised object (a painting on a wall) is found and the visitor
// points the camera down: on the floor below the object, just out from its wall on the visitor's
// side, so it never lands behind the wall however close they stand. Pure (three.js maths only,
// no DOM, no 8th Wall), so it can be tested in Node. The floor is the plane y = 0, as the
// 8th Wall world tracking sets it up (see placeCameraAtStart in threejs-scene-init.js).

import * as THREE from 'three'

/** Camera forward `y` below this counts as looking at the floor (about 20° down). */
export const FLOOR_PITCH = -0.35
/** How far out from the object's wall the content stands (scene units). */
export const WALL_GAP = 0.5
/** Content stays below this share of the object's height above the floor, so it never covers it. */
export const MAX_HEIGHT_SHARE = 0.6
/** Never shrink content below this, even under an object hanging very low. */
export const MIN_SCALE = 0.25

/**
 * @param {THREE.Vector3} objectPosition - The recognised object's centre, in world space.
 * @param {THREE.Vector3} cameraPosition - The camera's world position.
 * @param {THREE.Vector3} forward - The camera's unit view direction, in world space.
 * @param {number} contentHeight - How tall the tallest creature to place is, unscaled.
 * @returns {{position: THREE.Vector3, yaw: number, scale: number} | null} Where to stand the
 *   content, the turn that makes it (facing +z, as in the AR view) face the camera, and how much
 *   to shrink it; null while the camera is not looking down at the floor.
 */
export const floorSpotBelow = (objectPosition, cameraPosition, forward, contentHeight) => {
  if (forward.y >= FLOOR_PITCH) {
    return null
  }
  const toCamera = new THREE.Vector3(cameraPosition.x - objectPosition.x, 0, cameraPosition.z - objectPosition.z)
  const distance = toCamera.length()
  if (distance < 1e-6) {
    toCamera.set(0, 0, 1)
  } else {
    toCamera.divideScalar(distance)
  }
  const gap = Math.min(WALL_GAP, distance / 2)
  const position = new THREE.Vector3(objectPosition.x, 0, objectPosition.z).addScaledVector(toCamera, gap)
  const yaw = Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z)
  const fit = contentHeight > 0 ? (objectPosition.y * MAX_HEIGHT_SHARE) / contentHeight : 1
  const scale = THREE.MathUtils.clamp(fit, MIN_SCALE, 1)
  return {position, yaw, scale}
}
