// The ML object flow's maths (`/?scan&c=test-purifier`): a free-standing object on the floor (an
// air purifier) that the creature hides behind, then walks round to stand in front of the visitor.
// Pure (three.js maths only, no DOM, no 8th Wall), so it can be tested in Node.
//
// The object is taken as an upright cylinder. Only its near face is measured (the camera ray at
// the object's middle height, see scan.js), so its centre is one radius further along that ray.

import * as THREE from 'three'

/** Where the walk ends: this far round from straight in front of the object (radians, about 25°). */
export const END_ANGLE = 0.45
/** The arc is cut into steps of about this angle (radians, about 10°). */
export const STEP_ANGLE = 0.18

/**
 * @typedef {Object} ObjectWalk
 * @property {THREE.Vector3} centre - The object's centre on the floor.
 * @property {THREE.Vector3[]} waypoints - From straight behind the object round one side, all on
 *   the floor; the anchor (where it ends) not included.
 * @property {THREE.Vector3} anchor - Where the creature ends up, in front of the object, a little
 *   to the side it came round, so the object stays in view.
 */

/**
 * The walk out from behind an object and round it to the front, on a circle that keeps
 * `clearance` between the creature and the object's surface, so it never walks through it.
 *
 * @param {{x: number, z: number}} nearFace - The point of the object's surface the camera looked
 *   at (its height is ignored).
 * @param {{x: number, z: number}} cameraPosition
 * @param {Object} options
 * @param {number} options.floorY - The floor's height; every point returned lies on it.
 * @param {number} options.radius - The object's radius, scene units.
 * @param {number} options.clearance - Gap between the object's surface and the creature's
 *   centre, scene units (at least the creature's half-width).
 * @param {1 | -1} [options.side] - 1 goes round the object's right as the visitor sees it, -1 its left.
 * @returns {ObjectWalk}
 */
export const walkAroundObject = (nearFace, cameraPosition, {floorY, radius, clearance, side = 1}) => {
  const toCamera = new THREE.Vector3(cameraPosition.x - nearFace.x, 0, cameraPosition.z - nearFace.z)
  if (toCamera.lengthSq() < 1e-8) {
    toCamera.set(0, 0, 1)
  }
  toCamera.normalize()
  // The visitor's right, looking at the object.
  const right = new THREE.Vector3(toCamera.z, 0, -toCamera.x).multiplyScalar(side)
  const centre = new THREE.Vector3(nearFace.x, floorY, nearFace.z).addScaledVector(toCamera, -radius)
  const pathRadius = radius + clearance

  // 0 is straight in front of the object (towards the camera), PI straight behind it.
  const pointAt = (angle) => centre.clone()
    .addScaledVector(toCamera, Math.cos(angle) * pathRadius)
    .addScaledVector(right, Math.sin(angle) * pathRadius)

  const steps = Math.max(1, Math.ceil((Math.PI - END_ANGLE) / STEP_ANGLE))
  const waypoints = []
  for (let i = 0; i < steps; i++) {
    waypoints.push(pointAt(Math.PI - (i / steps) * (Math.PI - END_ANGLE)))
  }
  return {centre, waypoints, anchor: pointAt(END_ANGLE)}
}
