// Where content goes once a recognised object (a painting on a wall) is found and the visitor
// points the camera down: where the view meets the floor, but close to the visitor (on the phone,
// the view ray at a shallow tilt met the floor metres away, behind the wall) and never past the
// object's wall. The object's own distance is only a guard: it is the least certain part of an
// image target's pose and came out far too large on the phone. Pure (three.js maths only, no
// DOM, no 8th Wall), so it can be tested in Node. The floor is the plane y = 0, as the 8th Wall
// world tracking sets it up (see placeCameraAtStart in threejs-scene-init.js).

import * as THREE from 'three'

/** Camera forward `y` below this counts as looking at the floor (30° down). */
export const FLOOR_PITCH = -0.5
/** How far out from the object's wall content stands at most (scene units). */
export const WALL_GAP = 0.5
/** Closest and farthest from the camera, along the floor (scene units; the camera starts 2 up). */
export const MIN_DISTANCE = 0.8
export const MAX_DISTANCE = 1.6
/** Content stays below this share of the object's height above the floor, so it never covers it. */
export const MAX_HEIGHT_SHARE = 0.6
/** Never shrink content below this. */
export const MIN_SCALE = 0.25

/**
 * @param {THREE.Vector3} objectPosition - The recognised object's estimated centre, world space.
 * @param {THREE.Vector3} cameraPosition - The camera's world position.
 * @param {THREE.Vector3} forward - The camera's unit view direction, in world space.
 * @param {number} contentHeight - How tall the tallest creature to place is, unscaled.
 * @returns {{position: THREE.Vector3, yaw: number, scale: number} | null} Where to stand the
 *   content, the turn that makes it (facing +z, as in the AR view) face the camera, and how much
 *   to shrink it; null while the camera is not looking down at the floor.
 */
export const floorSpot = (objectPosition, cameraPosition, forward, contentHeight) => {
  if (forward.y >= FLOOR_PITCH) {
    return null
  }
  const horizontal = Math.hypot(forward.x, forward.z)
  const heading = horizontal > 1e-6
    ? new THREE.Vector3(forward.x / horizontal, 0, forward.z / horizontal)
    : new THREE.Vector3(0, 0, -1)   // straight down: no heading, so use the default one

  let along = Math.min((cameraPosition.y / -forward.y) * horizontal, MAX_DISTANCE)   // view ray meets floor
  const objectAlong = (objectPosition.x - cameraPosition.x) * heading.x + (objectPosition.z - cameraPosition.z) * heading.z
  if (objectAlong > WALL_GAP) {
    along = Math.min(along, objectAlong - WALL_GAP)
  }
  along = Math.max(along, MIN_DISTANCE)

  const position = cameraPosition.clone().addScaledVector(heading, along).setY(0)
  const yaw = Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z)

  // The object's height is only an estimate too; eye level (the camera) keeps it plausible.
  const objectHeight = THREE.MathUtils.clamp(objectPosition.y, cameraPosition.y * 0.5, cameraPosition.y * 1.5)
  const fit = contentHeight > 0 ? (objectHeight * MAX_HEIGHT_SHARE) / contentHeight : 1
  const scale = THREE.MathUtils.clamp(fit, MIN_SCALE, 1)
  return {position, yaw, scale}
}
