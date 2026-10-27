import {
  CENTRE_SHARE, MAX_DISTANCE, MAX_HEIGHT_SHARE, MIN_DISTANCE, PREFERRED_DISTANCE, stencilShape,
} from '../src/stencil.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// A phone in portrait: 390 x 844 CSS px, a 60° vertical field of view.
const view = {width: 390, height: 844}
const focalY = 1 / Math.tan(Math.PI / 6)
const focalX = focalY / (view.width / view.height)
const projection = [focalX, 0, 0, 0, 0, focalY, 0, 0, 0, 0, -1, -1, 0, 0, -0.02, 0]
const purifier = {radius: 0.13, height: 0.49}

const shape = stencilShape(purifier, projection, view)
const top = shape.topY - shape.capHeight / 2
const total = shape.footY - top
check('drawn for about the preferred distance', Math.abs(shape.distance - PREFERRED_DISTANCE) < 0.1, shape.distance.toFixed(2))
check('no taller than its share of the screen', total <= MAX_HEIGHT_SHARE * view.height + 1e-6, `${(total / view.height).toFixed(2)} of the height`)
check('centred across the screen', near(shape.centreX, view.width / 2))
check('its middle sits where it should', near((top + shape.footY) / 2, CENTRE_SHARE * view.height))
check('its foot stays above the hint at the bottom', shape.footY < 0.62 * view.height, `${(shape.footY / view.height).toFixed(2)}`)
check('as wide as the object at that distance', near(shape.width, 2 * purifier.radius * (focalX / shape.distance) * (view.width / 2)))
const {crop} = shape
check('the classifier\'s square holds the whole outline', crop.x <= shape.centreX - shape.width / 2 && crop.x + crop.size >= shape.centreX + shape.width / 2 &&
  crop.y <= top && crop.y + crop.size >= shape.footY)

const tall = stencilShape({radius: 0.4, height: 2}, projection, view)
const tallTotal = tall.footY - (tall.topY - tall.capHeight / 2)
check('a tall object: drawn for further away, still fits the screen', tall.distance > PREFERRED_DISTANCE && tallTotal <= MAX_HEIGHT_SHARE * view.height + 1e-6, tall.distance.toFixed(2))
const tiny = stencilShape({radius: 0.03, height: 0.08}, projection, view)
check('a tiny object: drawn for closer, but not closer than the minimum', tiny.distance < PREFERRED_DISTANCE && tiny.distance >= MIN_DISTANCE, tiny.distance.toFixed(2))
const huge = stencilShape({radius: 2, height: 10}, projection, view)
check('a huge object: no further than the maximum', huge.distance <= MAX_DISTANCE)

console.log(failures === 0 ? '\nALL STENCIL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
