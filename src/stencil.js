// The stencil (ML exhibits): an outline of the exhibit object drawn over the camera view, sized as
// the object looks from a step or two away. The visitor fits the real object into it; the classifier
// then looks only inside it (so a similar object beside it does not count), and the outline says
// where the object is, so nobody has to tap. Two shapes: an upright cylinder standing on the floor
// (stencilShape: its bottom edge is where it stands) and a box on a wall, seen face on
// (boxStencilShape: its top edge is where a creature sits).
//
// The shapes are pure maths (tested in Node); createStencil draws either as an SVG overlay.

/** The distance the outline is drawn for (metres), and how far it may move to fit the screen. */
export const PREFERRED_DISTANCE = 1.3
export const MIN_DISTANCE = 0.8
export const MAX_DISTANCE = 6   // a 2 m object needs about 5 m to fit a portrait screen
/** How tall the whole outline may be, as a share of the screen's height. */
export const MIN_HEIGHT_SHARE = 0.18
export const MAX_HEIGHT_SHARE = 0.36
/** Where the outline's middle sits, as a share of the screen's height from the top (above the hint). */
export const CENTRE_SHARE = 0.42
/** How far down a visitor looks at an object on the floor (radians, about 35°): it shows its top. */
export const VIEW_TILT = 0.6
/**
 * The square the classifier gets is this much bigger than the outline. Close to it: with a wider
 * square the classifier saw the object before it sat in the outline, and it was placed beside it.
 */
export const CROP_MARGIN = 1.1

/**
 * @typedef {Object} StencilShape
 * @property {'cylinder' | 'box'} kind
 * @property {number} centreX - CSS px from the left of the view.
 * @property {number} width - The cylinder's width on screen, CSS px.
 * @property {number} topY - The middle of its top ellipse, CSS px from the top.
 * @property {number} bottomY - The middle of its bottom ellipse.
 * @property {number} capHeight - How tall the top (and bottom) ellipse looks, CSS px.
 * @property {number} footY - The lowest point of the outline: where the object's near edge meets
 *   the floor.
 * @property {{x: number, y: number, size: number}} crop - The square (CSS px) the classifier looks at.
 * @property {number} distance - Metres the outline is drawn for.
 * @property {number} [footDistance] - Cylinder: metres from the camera to the object's near foot when
 *   the object fills the outline, looking VIEW_TILT down (see footDistanceAt for the real tilt).
 */

/**
 * The distance to draw an outline for: PREFERRED_DISTANCE, unless the outline would then be too tall
 * or too short for the screen.
 *
 * @param {(distance: number) => number} heightAt - The outline's height on screen (CSS px) at a distance.
 * @param {number} viewHeight - CSS px.
 * @returns {number} Metres.
 */
const fitDistance = (heightAt, viewHeight) => {
  let distance = PREFERRED_DISTANCE
  const tallest = MAX_HEIGHT_SHARE * viewHeight
  const shortest = MIN_HEIGHT_SHARE * viewHeight
  if (heightAt(distance) > tallest) {
    distance *= heightAt(distance) / tallest
  } else if (heightAt(distance) < shortest) {
    distance *= heightAt(distance) / shortest
  }
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance))
}

/**
 * Metres from the camera to the object's near foot when the object fills an outline drawn for
 * `distance`, the camera looking `tilt` down at its middle. With the same distance in scene units
 * (the ray to the outline's foot) it gives units per metre. The tilt matters (0.4 to 0.9 rad
 * changes it by about 9%), so the camera's real one is used.
 *
 * @param {{radius: number, height: number}} size - The object, metres.
 * @param {number} distance - Metres, the outline's `distance`.
 * @param {number} tilt - Radians below the horizon.
 * @returns {number} Metres.
 */
export const footDistanceAt = ({radius, height}, distance, tilt) =>
  Math.hypot(distance * Math.cos(tilt) - radius, distance * Math.sin(tilt) + height / 2)

/**
 * The outline of an upright cylinder as it looks from `distance` away, looking down at it a little.
 *
 * @param {{radius: number, height: number}} size - The object, metres.
 * @param {number[]} projection - The camera's projectionMatrix.elements (column-major, as three.js).
 * @param {{width: number, height: number}} view - The camera view on screen, CSS px.
 * @returns {StencilShape}
 */
export const stencilShape = ({radius, height}, projection, view) => {
  const focalX = projection[0]   // 1 / tan(horizontal half-angle)
  const focalY = projection[5]   // 1 / tan(vertical half-angle)
  // On screen (CSS px) per metre at a distance, along each axis.
  const pxX = (d) => (focalX / d) * (view.width / 2)
  const pxY = (d) => (focalY / d) * (view.height / 2)
  const shapeHeight = (d) => (height * Math.cos(VIEW_TILT) + 2 * radius * Math.sin(VIEW_TILT)) * pxY(d)

  const distance = fitDistance(shapeHeight, view.height)

  const width = 2 * radius * pxX(distance)
  const bodyHeight = height * Math.cos(VIEW_TILT) * pxY(distance)
  const capHeight = 2 * radius * Math.sin(VIEW_TILT) * pxY(distance)
  const total = bodyHeight + capHeight
  const centreX = view.width / 2
  const middle = CENTRE_SHARE * view.height
  const topY = middle - total / 2 + capHeight / 2
  const bottomY = topY + bodyHeight
  const side = Math.max(width, total) * CROP_MARGIN
  const footDistance = footDistanceAt({radius, height}, distance, VIEW_TILT)
  return {
    kind: 'cylinder', centreX, width, topY, bottomY, capHeight, footY: bottomY + capHeight / 2, distance, footDistance,
    crop: {x: centreX - side / 2, y: middle - side / 2, size: side},
  }
}

/**
 * The outline of a box on a wall seen face on, at about eye level: a plain rectangle.
 *
 * @param {{width: number, height: number}} size - The box's front face, metres.
 * @param {number[]} projection - The camera's projectionMatrix.elements (column-major, as three.js).
 * @param {{width: number, height: number}} view - The camera view on screen, CSS px.
 * @returns {StencilShape} topY and bottomY are the face's top and bottom edges; capHeight is 0.
 */
export const boxStencilShape = ({width: faceWidth, height: faceHeight}, projection, view) => {
  const pxX = (d) => (projection[0] / d) * (view.width / 2)
  const pxY = (d) => (projection[5] / d) * (view.height / 2)
  const distance = fitDistance((d) => faceHeight * pxY(d), view.height)
  const width = faceWidth * pxX(distance)
  const height = faceHeight * pxY(distance)
  const centreX = view.width / 2
  const middle = CENTRE_SHARE * view.height
  const topY = middle - height / 2
  const bottomY = middle + height / 2
  const side = Math.max(width, height) * CROP_MARGIN
  return {
    kind: 'box', centreX, width, topY, bottomY, capHeight: 0, footY: bottomY, distance,
    crop: {x: centreX - side / 2, y: middle - side / 2, size: side},
  }
}

const SVG = 'http://www.w3.org/2000/svg'

/**
 * Draws a stencil over the camera view. Taps go through it to the canvas.
 *
 * @param {StencilShape} shape
 * @param {{left: number, top: number, width: number, height: number}} view - The canvas on screen.
 * @returns {{setMatched: (matched: boolean) => void, remove: () => void}} setMatched shows that the
 *   classifier sees the object in it.
 */
export const createStencil = (shape, view) => {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'ui-stencil')
  svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`)
  Object.assign(svg.style, {left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px`})

  const {centreX, width, topY, bottomY, capHeight} = shape
  const rx = width / 2
  const ry = capHeight / 2
  const left = centreX - rx
  const right = centreX + rx
  const outline = document.createElementNS(SVG, 'path')
  // A box: a rectangle. A cylinder: the sides and the near half of the bottom ellipse, then the
  // whole top ellipse.
  outline.setAttribute('d', shape.kind === 'box'
    ? `M ${left} ${topY} L ${right} ${topY} L ${right} ${bottomY} L ${left} ${bottomY} Z`
    : [
      `M ${left} ${topY} L ${left} ${bottomY}`,
      `A ${rx} ${ry} 0 0 0 ${right} ${bottomY}`,
      `L ${right} ${topY}`,
      `M ${left} ${topY} A ${rx} ${ry} 0 1 0 ${right} ${topY} A ${rx} ${ry} 0 1 0 ${left} ${topY}`,
    ].join(' '))
  svg.appendChild(outline)
  document.body.appendChild(svg)

  return {
    setMatched: (matched) => svg.classList.toggle('is-matched', matched),
    remove: () => svg.remove(),
  }
}
