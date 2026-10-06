import * as THREE from 'three'

import {floorSpot, MAX_HEIGHT_SHARE, MIN_DISTANCE, MIN_SCALE, WALL_GAP} from '../src/floor-spot.js'

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
// Where the view ray `down` degrees below the horizon meets the floor, from `height`.
const hitDistance = (height, down) => height / Math.tan(THREE.MathUtils.degToRad(down))

const camera = new THREE.Vector3(0, 2, 3.5)      // where the AR view starts the camera
const painting = new THREE.Vector3(0, 1.9, 0.5)  // on a wall 3 units in front of it
const acornAlone = 0.85 * 3

check('looking ahead: no spot yet', floorSpot(painting, camera, looking(5), acornAlone) === null)
check('looking just above the threshold: no spot yet', floorSpot(painting, camera, looking(19), acornAlone) === null)

const steep = floorSpot(painting, camera, looking(50), acornAlone)
check('looking at the floor short of the wall: lands where the view meets the floor',
  steep && near(camera.z - steep.position.z, hitDistance(2, 50)) && near(steep.position.x, 0) && steep.position.y === 0,
  steep && `along=${(camera.z - steep.position.z).toFixed(3)}`)
check('facing the camera straight on: no turn', steep && near(steep.yaw, 0))

const shallow = floorSpot(painting, camera, looking(25), acornAlone)
check('looking at the floor past the wall: stops just out from the wall instead',
  shallow && near(shallow.position.z, painting.z + WALL_GAP), shallow && `z=${shallow.position.z.toFixed(3)}`)

const wrongDepth = floorSpot(new THREE.Vector3(0, 1.9, -40), camera, looking(40), acornAlone)
check('object estimated far too far away: still lands where the camera looks',
  wrongDepth && near(camera.z - wrongDepth.position.z, hitDistance(2, 40)))
const wrongSide = floorSpot(new THREE.Vector3(0, 1.9, 9), camera, looking(40), acornAlone)
check('object estimated behind the camera: ignored, lands where the camera looks',
  wrongSide && near(camera.z - wrongSide.position.z, hitDistance(2, 40)))

const down = floorSpot(painting, camera, new THREE.Vector3(0, -1, 0), acornAlone)
check('straight down: not closer than the minimum', down && near(camera.z - down.position.z, MIN_DISTANCE))

const ok = [0, 45, 90, 135, 180, -60].every((heading) => {
  const cam = new THREE.Vector3(1, 1.5, -2)
  const s = floorSpot(new THREE.Vector3(1, 1.7, -2).addScaledVector(looking(0, heading), 3), cam, looking(35, heading), acornAlone)
  const toCamera = new THREE.Vector3(cam.x - s.position.x, 0, cam.z - s.position.z).normalize()
  return facing(s.yaw).dot(toCamera) > 0.9999
})
check('whatever way the camera is turned, content faces it', ok)

check('a tall creature shrinks to stay below the painting', steep && near(steep.scale * acornAlone, painting.y * MAX_HEIGHT_SHARE),
  steep && `scale=${steep.scale.toFixed(3)}`)
check('a small creature keeps its size', floorSpot(painting, camera, looking(35), 0.5).scale === 1)
check('an implausibly low object estimate is bounded by eye level',
  near(floorSpot(new THREE.Vector3(0, 0.05, 0.5), camera, looking(35), 1).scale, 2 * 0.5 * MAX_HEIGHT_SHARE))
check('never shrinks below the minimum', floorSpot(painting, camera, looking(35), 100).scale === MIN_SCALE)
check('no creatures (a game only): no shrinking', floorSpot(painting, camera, looking(35), 0).scale === 1)

console.log(failures === 0 ? '\nALL FLOOR SPOT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
