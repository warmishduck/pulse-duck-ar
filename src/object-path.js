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

/** A fit needs this many tracked points on the object's side. */
export const MIN_FIT_POINTS = 6
/** Points this far from the guessed centre (in radii) and no further can be on the object. */
export const FIT_SEARCH_RADII = 3
/** How far off the fitted circle (in radii) a point may lie and still count, round after round. */
export const FIT_INLIER_SHARES = [0.6, 0.35, 0.2]
/** Points lower than this share of the object's height are taken to be floor. */
export const FIT_MIN_HEIGHT_SHARE = 0.1

/**
 * Where an upright cylinder of known size stands, from the engine's tracked points on its side:
 * the centre whose circle the points lie closest to (a least-squares circle of fixed radius).
 *
 * The points lie on the side facing the viewer, and a circle of that radius fits an arc from
 * either side of it, so the search starts on the far side: one radius beyond the points' middle.
 *
 * @param {{position: {x: number, y: number, z: number}}[]} points - The tracked world points.
 * @param {{x: number, z: number}} guess - Where the centre is thought to be (from the tap).
 * @param {Object} options
 * @param {number} options.floorY
 * @param {number} options.radius - Scene units.
 * @param {number} options.height - Scene units.
 * @param {{x: number, z: number}} options.viewer - The camera, which sees the points' side.
 * @returns {{centre: THREE.Vector3, count: number} | null} null with too few points on the side.
 */
export const fitCylinderCentre = (points, guess, {floorY, radius, height, viewer}) => {
  const reach = radius * FIT_SEARCH_RADII
  const side = points
    .map(({position}) => position)
    .filter((p) => p.y >= floorY + height * FIT_MIN_HEIGHT_SHARE && p.y <= floorY + height &&
      Math.hypot(p.x - guess.x, p.z - guess.z) <= reach)
  if (side.length < MIN_FIT_POINTS) {
    return null
  }
  const middleX = side.reduce((sum, p) => sum + p.x, 0) / side.length
  const middleZ = side.reduce((sum, p) => sum + p.z, 0) / side.length
  const away = Math.hypot(middleX - viewer.x, middleZ - viewer.z) || 1e-9
  // Each point pulls the centre to one radius behind it, as seen from the current centre.
  let x = middleX + ((middleX - viewer.x) / away) * radius
  let z = middleZ + ((middleZ - viewer.z) / away) * radius
  // Points of a wall or a neighbour behind the object pull a plain fit off it (on the phone the
  // purifier stood in a corner), so after a first fit only the points near its circle are kept,
  // and the tolerance narrows round by round.
  let used = side
  const fitTo = (points, rounds) => {
    for (let round = 0; round < rounds; round++) {
      let sumX = 0
      let sumZ = 0
      points.forEach((p) => {
        const length = Math.hypot(p.x - x, p.z - z) || 1e-9
        sumX += p.x - ((p.x - x) / length) * radius
        sumZ += p.z - ((p.z - z) / length) * radius
      })
      x = sumX / points.length
      z = sumZ / points.length
    }
  }
  fitTo(used, 20)
  for (const share of FIT_INLIER_SHARES) {
    const inliers = side.filter((p) => Math.abs(Math.hypot(p.x - x, p.z - z) - radius) <= radius * share)
    if (inliers.length < MIN_FIT_POINTS) {
      break
    }
    used = inliers
    fitTo(used, 10)
  }
  return {centre: new THREE.Vector3(x, floorY, z), count: used.length}
}
