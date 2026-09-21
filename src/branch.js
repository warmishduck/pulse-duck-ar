// The branch the acorn grows from an anchor. In the game (grow_anchor.gd) it is a gentle arc,
// a quadratic curve that rises in the middle, thick at the anchor and thin at the tip. This
// file only does the maths, so the picture (level.js) and the walkable surface (platformer.js)
// come from the same curve.

// The curve as a list of points from the anchor to the tip, in the level's XY plane.
// `dir` is -1 to grow to the left, +1 to the right. The game ends the tip 0.3 above the
// anchor; here it comes down a little (`tipDrop`) so it lands about on the ground, where
// the slow Glowcap, which can only hop 0.3, can step onto it.
export const branchPoints = ({x, y, dir, length, rise = 0.7, tipDrop = 0.25, samples = 40}) => {
  const p0 = {x, y}
  const p1 = {x: x + dir * length * 0.5, y: y + rise}
  const p2 = {x: x + dir * length, y: y - tipDrop}
  const points = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    points.push({x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y})
  }
  return points
}

// A walkable surface along those points (see platformer.js). Its x is monotonic because
// the middle control point sits halfway along, so the height at any x is a simple lookup.
export const branchSurface = (points) => {
  const sorted = points.slice().sort((a, b) => a.x - b.x)
  return {
    active: false,
    x0: sorted[0].x,
    x1: sorted[sorted.length - 1].x,
    heightAt(x) {
      let lo = 0
      let hi = sorted.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (sorted[mid].x <= x) {
          lo = mid
        } else {
          hi = mid
        }
      }
      const a = sorted[lo]
      const b = sorted[hi]
      const span = b.x - a.x
      return span === 0 ? a.y : a.y + ((x - a.x) / span) * (b.y - a.y)
    },
  }
}
