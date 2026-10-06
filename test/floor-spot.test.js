import * as THREE from 'three'

import {floorSpotBelow, MAX_HEIGHT_SHARE, MIN_SCALE, WALL_GAP} from '../src/floor-spot.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// A camera's view direction, `down` degrees below the horizon, turned `heading` degrees from -z
// towards -x (the same way three.js turns a camera by rotation.y).
const looking = (down, heading = 0) => {
  const d = THREE.MathUtils.degToRad(down)
  const h = THREE.MathUtils.degToRad(heading)
  return new THREE.Vector3(-Math.sin(h) * Math.cos(d), -Math.sin(d), -Math.cos(h) * Math.cos(d))
}
// Which way content turned by `yaw` faces (it faces +z when yaw is 0).
const facing = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))

const camera = new THREE.Vector3(0, 2, 3.5)      // where the AR view starts the camera
const painting = new THREE.Vector3(0, 1.9, 1.5)  // on a wall 2 units in front of it
const acornAlone = 0.85 * 3

check('looking ahead: no spot yet', floorSpotBelow(painting, camera, looking(5), acornAlone) === null)
check('looking just above the threshold: no spot yet', floorSpotBelow(painting, camera, looking(19), acornAlone) === null)

const spot = floorSpotBelow(painting, camera, looking(35), acornAlone)
check('looking down: the spot is on the floor', spot && spot.position.y === 0)
check('it is below the painting, out from the wall towards the camera', spot && near(spot.position.x, 0) && near(spot.position.z, painting.z + WALL_GAP),
  spot && `z=${spot.position.z}`)
check('facing the camera straight on: no turn', spot && near(spot.yaw, 0))

const close = new THREE.Vector3(0, 2, painting.z + 0.4)
const closeSpot = floorSpotBelow(painting, close, looking(60), acornAlone)
check('standing very close: still between the wall and the camera', closeSpot && closeSpot.position.z > painting.z && closeSpot.position.z < close.z,
  closeSpot && `z=${closeSpot.position.z}`)

const ok = [0, 45, 90, 135, 180, -60].every((heading) => {
  const cam = new THREE.Vector3(1 + Math.sin(heading), 1.5, -2 + Math.cos(heading) * 2)
  const s = floorSpotBelow(new THREE.Vector3(1, 1.7, -2), cam, looking(35, heading), acornAlone)
  const toCamera = new THREE.Vector3(cam.x - s.position.x, 0, cam.z - s.position.z).normalize()
  return facing(s.yaw).dot(toCamera) > 0.9999
})
check('from any side, content faces the camera', ok)

check('a tall creature shrinks to stay below the painting', spot && near(spot.scale * acornAlone, painting.y * MAX_HEIGHT_SHARE),
  spot && `scale=${spot.scale.toFixed(3)}, top at ${(spot.scale * acornAlone).toFixed(2)} of ${painting.y}`)
check('a small creature keeps its size', floorSpotBelow(painting, camera, looking(35), 0.5).scale === 1)
check('an object hanging very low does not shrink content to nothing', floorSpotBelow(new THREE.Vector3(0, 0.05, 1.5), camera, looking(35), acornAlone).scale === MIN_SCALE)
check('no creatures (a game only): no shrinking', floorSpotBelow(painting, camera, looking(35), 0).scale === 1)

console.log(failures === 0 ? '\nALL FLOOR SPOT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
