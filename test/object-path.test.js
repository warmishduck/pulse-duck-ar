import * as THREE from 'three'

import {END_ANGLE, walkAroundObject} from '../src/object-path.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// The camera 3 units in front (+z) of an object whose near face is at the origin.
const camera = new THREE.Vector3(0, 2, 3)
const nearFace = new THREE.Vector3(0, 0.5, 0)
const radius = 0.2
const clearance = 0.2
const walk = walkAroundObject(nearFace, camera, {floorY: 0.1, radius, clearance})
const all = [...walk.waypoints, walk.anchor]

check('the centre is one radius behind the near face', near(walk.centre.z, -radius) && near(walk.centre.x, 0))
check('everything lies on the floor', all.every((point) => near(point.y, 0.1)) && near(walk.centre.y, 0.1))
const flatDistance = (point) => Math.hypot(point.x - walk.centre.x, point.z - walk.centre.z)
check('it never comes closer to the object than the clearance', all.every((point) => flatDistance(point) >= radius + clearance - 1e-9))
check('it starts straight behind the object', near(walk.waypoints[0].x, 0) && walk.waypoints[0].z < walk.centre.z)
check('it ends in front of the object, towards the camera', walk.anchor.z > 0)
check('it ends a little to the side, END_ANGLE round', near(Math.atan2(walk.anchor.x - walk.centre.x, walk.anchor.z - walk.centre.z), END_ANGLE))
check('it goes round the right as the visitor sees it (+x here)', walk.waypoints.slice(1).every((point) => point.x > 0))
const left = walkAroundObject(nearFace, camera, {floorY: 0, radius, clearance, side: -1})
check('side -1 goes round the left', left.waypoints.slice(1).every((point) => point.x < 0) && left.anchor.x < 0)
const steps = all.slice(1).map((point, i) => point.distanceTo(all[i]))
check('the steps are short and even', Math.max(...steps) - Math.min(...steps) < 1e-9 && Math.max(...steps) < 0.1, steps[0].toFixed(3))

const sideways = walkAroundObject(nearFace, new THREE.Vector3(3, 1.5, 0), {floorY: 0, radius, clearance})
check('a camera off to the side: the walk ends towards it', sideways.anchor.x > walk.centre.x && near(sideways.centre.x, -radius))
const above = walkAroundObject(nearFace, new THREE.Vector3(0, 2, 0), {floorY: 0, radius, clearance})
check('a camera straight above: still a walk, no NaN', [...above.waypoints, above.anchor].every((point) => Number.isFinite(point.x + point.z)))

console.log(failures === 0 ? '\nALL OBJECT PATH CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
