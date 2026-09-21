// Checks for the level's physics (src/platformer.js, src/branch.js) against the rules of the
// Lumina game's own characters and platforms. Run with: npm test

import {createPlatformer, groundTopAt, GLOWCAP, GLOWCAP_WALK, PLAYER, walkToward} from '../src/platformer.js'
import {branchPoints, branchSurface} from '../src/branch.js'
import {LIGHT_THE_WAY as L} from '../src/level-data.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const f = (n) => +n.toFixed(2)
const idle = {dir: 0, jumpPressed: false}
const DT = 1 / 60

// As in the game: a bloom is solid only while the Glowcap's light (radius) reaches it, and here
// they are one-way (stand on them, walk through their sides). `glowX` is where the Glowcap
// stands (null = far away).
const GLOW_CENTRE_Y = GLOWCAP.height / 2
const worldFor = (glowX) => [
  ...L.slabs.map((s) => ({...s, solid: true})),
  ...L.blooms.map((b) => ({...b, oneWay: true, solid: glowX !== null && Math.hypot(b.x - glowX, b.y - GLOW_CENTRE_Y) <= b.radius})),
]
const branch = () => {
  const surface = branchSurface(branchPoints(L.anchor))
  return surface
}

const makeAcorn = (glowX) => {
  const solids = worldFor(glowX)
  const game = createPlatformer({spawns: L.respawns.acorn, fallY: L.fallY, body: PLAYER})
  const run = (seconds, input, surfaces = []) => { for (let t = 0; t < seconds; t += DT) game.step(DT, input, solids, surfaces) }
  return {game, solids, run, s: game.state}
}
const STEP_RULES = GLOWCAP_WALK   // exactly what the level passes to walkToward for the Glowcap
// `lit`: the bloom platforms follow the Glowcap's own light as they do in the level (it stands
// among them, so the bridge is solid around it); otherwise they are the fixed set for "far away".
const makeGlowcap = (surfaces = [], {lit = false} = {}) => {
  const fixed = worldFor(null)
  const game = createPlatformer({spawns: L.respawns.glowcap, fallY: L.fallY, exit: {...L.exit, r: L.exitTouchRadius}, body: GLOWCAP})
  const s = game.state
  const world = () => (lit ? worldFor(s.x) : fixed)
  // Send it toward x; returns how it stopped, and reports what it did on the way.
  const goTo = (x, seconds, watch = null) => {
    let done = null
    for (let t = 0; t < seconds && done === null; t += DT) {
      const w = walkToward(s, x, world(), surfaces, STEP_RULES)
      done = w.done
      game.step(DT, {dir: w.dir, jumpPressed: w.jump}, world(), surfaces)
      if (watch) { watch(s, game) }
    }
    return done
  }
  return {game, solids: fixed, s, goTo, surfaces}
}

// ---------------------------------------------------------------- the acorn
{ const {run, s} = makeAcorn(null); run(1, idle)
  check('acorn: spawn lands on the start slab and stands still', s.onGround && Math.abs(s.y) < 0.01 && Math.abs(s.x - L.respawns.acorn[0].x) < 0.01, `y=${f(s.y)} x=${f(s.x)}`) }
{ const {run, s} = makeAcorn(null); run(1, idle); const x0 = s.x; run(1, {dir: 1, jumpPressed: false})
  check('acorn: walks at ~5 units/s', Math.abs((s.x - x0) - 4.9) < 0.3, `moved ${f(s.x - x0)} in 1 s`) }
{ const {run, s, game, solids} = makeAcorn(null); run(1, idle)
  let apex = 0, air = 0, pressed = true
  for (let t = 0; t < 2; t += DT) { game.step(DT, {dir: 0, jumpPressed: pressed}, solids); pressed = false; if (!s.onGround) air += DT; apex = Math.max(apex, s.y) }
  check('acorn: jump apex ~2.27 units (10^2 / (2*22))', Math.abs(apex - 2.27) < 0.1, `apex ${f(apex)}`)
  check('acorn: jump air time ~0.91 s (2*10/22)', Math.abs(air - 0.91) < 0.06, `air ${f(air)} s`) }

// The gap (8 units) is longer than a running jump (5 units/s * 0.91 s = 4.5): impossible without the bridge.
{ const {s, game, solids} = makeAcorn(null); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  let respawned = false, crossed = false
  for (let t = 0; t < 8; t += DT) {
    game.step(DT, {dir: 1, jumpPressed: s.x > 7.2 && s.onGround}, solids)
    if (game.drainEvents().includes('respawn')) respawned = true
    if (s.x > 16) crossed = true
  }
  check('acorn, Glowcap far away: cannot cross the gap (falls and respawns)', respawned && !crossed) }

// With the Glowcap standing at x = 6 a bot runs over the two bridge blooms to the far slab.
{ const {s, game, solids} = makeAcorn(6); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  let respawns = 0, maxX = 0; const jumps = []
  for (let t = 0; t < 20 && s.x < 20; t += DT) {
    const ahead = s.x + 1.0
    const groundAhead = solids.some((p) => p.solid && ahead > p.x - p.w / 2 && ahead < p.x + p.w / 2 && Math.abs(s.y - (p.y + p.h / 2)) < 0.6)
    const wallAhead = solids.some((p) => p.solid && ahead > p.x - p.w / 2 && ahead < p.x + p.w / 2 && p.y + p.h / 2 > s.y + 0.05 && p.y - p.h / 2 < s.y + PLAYER.height)
    const jump = s.onGround && (!groundAhead || wallAhead)
    if (jump) jumps.push(f(s.x))
    game.step(DT, {dir: 1, jumpPressed: jump}, solids)
    for (const e of game.drainEvents()) if (e === 'respawn') respawns++
    maxX = Math.max(maxX, s.x)
  }
  check('acorn, Glowcap at x=6: crosses the bridge blooms to the far slab without falling', respawns === 0 && s.x >= 16 && s.onGround, `reached x=${f(maxX)}, jumps at x=[${jumps.join(', ')}]`) }

// Switch the light off (the Glowcap walks away) while standing on a bloom: it drops the acorn.
{ const {run, s, solids} = makeAcorn(6); run(0.6, idle)
  s.x = 10; s.y = 0.35 + 0.001; s.vy = 0; run(0.3, idle)
  const stood = s.onGround && s.groundedOn && s.groundedOn.x === 10
  solids.forEach((p) => { if (p.radius) p.solid = false })
  run(0.6, idle)
  check('acorn on a bloom, Glowcap leaves: falls through', stood && s.y < 0.2, `stood=${stood} y after=${f(s.y)}`) }

// The shelf of six blooms over the start slab (the game's DecorBloomA-F) is a real platform in
// the Glowcap's light: the acorn can jump up onto it and stand on it, it never blocks walking
// along the slab, and it lets you fall when the light goes.
{ const shelf = (glowX) => worldFor(glowX).filter((p) => p.radius && p.y === 0.7)
  check('start shelf: all six blooms are solid with the Glowcap at its start, none with it far away',
    shelf(-1).length === 6 && shelf(-1).every((p) => p.solid) && shelf(null).every((p) => !p.solid))
  const game = createPlatformer({spawns: L.respawns.acorn, fallY: L.fallY, body: PLAYER}); const s = game.state
  let solids = worldFor(-1)
  for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  const spawnedOn = {y: s.y, onGround: s.onGround}
  // walking along the ground through the shelf is not blocked
  const x0 = s.x; for (let t = 0; t < 1; t += DT) game.step(DT, {dir: 1, jumpPressed: false}, solids)
  const walked = s.x - x0
  // a jump lands on top of it
  for (let t = 0; t < 0.4; t += DT) game.step(DT, idle, solids)
  game.step(DT, {dir: 0, jumpPressed: true}, solids)
  for (let t = 0; t < 1.5; t += DT) game.step(DT, idle, solids)
  const top = L.blooms.find((b) => b.decor).y + L.blooms.find((b) => b.decor).h / 2
  const stoodOn = {y: s.y, onGround: s.onGround}
  // and it walks along the top
  const xOn = s.x; for (let t = 0; t < 0.6; t += DT) game.step(DT, {dir: -1, jumpPressed: false}, solids)
  const along = {moved: xOn - s.x, y: s.y}
  // the light leaves: it falls back to the slab
  solids = worldFor(null); for (let t = 0; t < 1; t += DT) game.step(DT, idle, solids)
  check('start shelf: spawn on the slab (not caught in it), walks through it, jumps up onto it and stands and walks on top, falls when the light goes',
    spawnedOn.onGround && Math.abs(spawnedOn.y) < 0.01 && walked > 4.5 && stoodOn.onGround && Math.abs(stoodOn.y - top) < 0.01 &&
    along.moved > 2.5 && Math.abs(along.y - top) < 0.01 && s.onGround && Math.abs(s.y) < 0.01,
    `spawn y=${f(spawnedOn.y)}, walked ${f(walked)} in 1 s, on the shelf y=${f(stoodOn.y)} (top ${f(top)}), walked ${f(along.moved)} on top, after light off y=${f(s.y)}`) }

// Coyote time
for (const delay of [0.1, 0.3]) {
  const {game, s, solids} = makeAcorn(null)
  for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  s.x = 8.6; s.onGround = false; s.coyote = 0.12   // as if it had only just left the ground
  let jumped = false
  for (let t = 0; t < 0.5; t += DT) {
    game.step(DT, {dir: 0, jumpPressed: t >= delay - 1 / 120 && t < delay + 1 / 120}, solids)
    if (game.drainEvents().includes('jump')) jumped = true
  }
  check(`acorn coyote time: a jump ${delay} s after leaving the ground ${delay < 0.12 ? 'still works' : 'is refused'}`, delay < 0.12 ? jumped : !jumped)
}

// ---------------------------------------------------------------- the branch
{ const surface = branch()
  check('branch: spans the gap, from the anchor (x=17) to the tip (x=8)', Math.abs(surface.x1 - 17) < 1e-6 && Math.abs(surface.x0 - 8) < 1e-6, `x ${f(surface.x0)}..${f(surface.x1)}`)
  check('branch: the tip lands about on the ground; it arcs up in between; the base is at the anchor',
    surface.heightAt(8) < 0.1 && surface.heightAt(12.5) > 0.5 && Math.abs(surface.heightAt(17) - L.anchor.y) < 0.02,
    `tip ${f(surface.heightAt(8))}, middle ${f(surface.heightAt(12.5))}, base ${f(surface.heightAt(17))}`)
  let steepest = 0; for (let x = 8; x < 16.9; x += 0.1) steepest = Math.max(steepest, Math.abs(surface.heightAt(x + 0.1) - surface.heightAt(x)) / 0.1)
  check('branch: never steeper than ~15 degrees, so it can be walked', steepest < 0.27, `steepest slope ${f(steepest)}`) }

// A walking acorn follows the slope up and back down and never leaves it.
{ const surface = branch(); surface.active = true
  const {game, s} = (() => { const solids = worldFor(null); const g = createPlatformer({spawns: [{x: 7.2, y: 0}], fallY: L.fallY, body: PLAYER}); return {game: g, s: g.state, solids} })()
  const solids = worldFor(null)
  for (let t = 0; t < 0.4; t += DT) game.step(DT, idle, solids, [surface])
  let airborne = 0, maxErr = 0, respawns = 0
  for (let t = 0; t < 3.2; t += DT) {
    game.step(DT, {dir: 1, jumpPressed: false}, solids, [surface])
    if (s.x > 8.2 && s.x < 16.5) { if (!s.onGround) airborne++; maxErr = Math.max(maxErr, Math.abs(s.y - surface.heightAt(s.x))) }
    if (game.drainEvents().includes('respawn')) respawns++
  }
  check('acorn walks up and over the branch, sticking to it the whole way', airborne === 0 && maxErr < 0.02 && respawns === 0 && s.x > 15, `x=${f(s.x)} off-ground frames=${airborne} max height error=${f(maxErr)}`) }

// The same walk with the bridge lit (the Glowcap standing at x=6 makes both blooms solid), there
// and back. The branch arches through the bridge's space: nothing may catch or push the acorn.
{ const surface = branch(); surface.active = true; const solids = worldFor(6)
  const game = createPlatformer({spawns: [{x: 7.2, y: 0}], fallY: L.fallY, body: PLAYER}); const s = game.state
  for (let t = 0; t < 0.4; t += DT) game.step(DT, idle, solids, [surface])
  let biggestJump = 0, respawns = 0, farthest = s.x, lastX = s.x
  const walk = (dir, seconds) => { for (let t = 0; t < seconds; t += DT) {
    game.step(DT, {dir, jumpPressed: false}, solids, [surface])
    biggestJump = Math.max(biggestJump, Math.abs(s.x - lastX)); lastX = s.x; farthest = Math.max(farthest, s.x)
    if (game.drainEvents().includes('respawn')) respawns++
  } }
  walk(1, 3.2); walk(-1, 4)
  check('acorn walks over the branch and back with the bridge lit: nothing catches or shoves it', respawns === 0 && farthest > 15 && s.x < 7.6 && s.onGround && biggestJump < 0.15,
    `farthest x=${f(farthest)}, back at x=${f(s.x)}, biggest step ${f(biggestJump)}, respawns=${respawns}`) }

// A one-way platform: you jump up through it and land on it, and walk through its side. The
// same block, solid, bumps your head and stops you.
{ const run = (oneWay) => {
    const floor = {x: 0, y: -0.5, w: 40, h: 1, solid: true}
    const ceiling = {x: 0, y: 2, w: 4, h: 0.3, solid: true, oneWay}   // bottom 1.85, top 2.15
    const block = {x: 8, y: 0.5, w: 2, h: 1, solid: true, oneWay}    // 7..9 across, 0..1 up
    const solids = [floor, ceiling, block]
    const game = createPlatformer({spawn: {x: 0, y: 0}, fallY: -8, body: PLAYER}); const s = game.state
    for (let t = 0; t < 0.4; t += DT) game.step(DT, idle, solids)
    game.step(DT, {dir: 0, jumpPressed: true}, solids)
    for (let t = 0; t < 1.6; t += DT) game.step(DT, idle, solids)
    const jumpEnds = {y: s.y, onGround: s.onGround}
    s.x = 3; s.y = 0; s.vx = 0; s.vy = 0
    for (let t = 0; t < 0.3; t += DT) game.step(DT, idle, solids)
    for (let t = 0; t < 3; t += DT) game.step(DT, {dir: 1, jumpPressed: false}, solids)
    return {jumpEnds, x: s.x}
  }
  const oneWay = run(true), solid = run(false)
  check('one-way platform: jump up through it and land on top; walk through its side',
    Math.abs(oneWay.jumpEnds.y - 2.15) < 0.01 && oneWay.jumpEnds.onGround && oneWay.x > 10, `lands at y=${f(oneWay.jumpEnds.y)}, walked on to x=${f(oneWay.x)}`)
  check('the same block, solid: bumps your head and stops you at its side',
    solid.jumpEnds.y === 0 && solid.x < 7, `after the jump y=${f(solid.jumpEnds.y)}, stopped at x=${f(solid.x)}`) }

// You can land on the branch from above, and pass up through it from below.
{ const surface = branch(); surface.active = true; const solids = worldFor(null)
  const above = createPlatformer({spawns: [{x: 12.5, y: 4}], fallY: L.fallY, body: PLAYER})
  for (let t = 0; t < 1.5; t += DT) above.step(DT, idle, solids, [surface])
  const landed = above.state.onGround && Math.abs(above.state.y - surface.heightAt(12.5)) < 0.02
  const below = createPlatformer({spawns: [{x: 12.5, y: -1}], fallY: L.fallY, body: PLAYER}); below.state.vy = 12
  let maxY = -1; for (let t = 0; t < 0.6; t += DT) { below.step(DT, idle, solids, [surface]); maxY = Math.max(maxY, below.state.y) }
  check('branch: lands from above, is passable from below', landed && maxY > surface.heightAt(12.5), `landed=${landed} peak from below=${f(maxY)} (branch height ${f(surface.heightAt(12.5))})`) }

// ---------------------------------------------------------------- the Glowcap
{ const {goTo, s, game} = makeGlowcap(); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, worldFor(null))
  const x0 = s.x; goTo(x0 + 100, 2)
  check('Glowcap: walks at ~2.5 units/s', Math.abs((s.x - x0) - 4.85) < 0.5, `moved ${f(s.x - x0)} in 2 s`) }
{ const {game, s, solids} = makeGlowcap(); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  let apex = 0, pressed = true
  for (let t = 0; t < 1; t += DT) { game.step(DT, {dir: 0, jumpPressed: pressed}, solids); pressed = false; apex = Math.max(apex, s.y) }
  check('Glowcap: hops only ~0.3 high (the game\'s jump_height)', Math.abs(apex - 0.3) < 0.05, `apex ${f(apex)}`) }
{ const {goTo, s, game, solids} = makeGlowcap(); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
  const why = goTo(15, 12)
  check('Glowcap: told to go across the gap, it stops at the ledge instead of walking off', why === 'edge' && s.x > 6.5 && s.x < 8 && s.onGround, `stopped (${why}) at x=${f(s.x)}`) }
// No branch, and its own light making the bridge solid around it: it still stops at the ledge
// (there is a gap to the first bloom), so it never gets onto the bridge by itself.
{ const {goTo, s, game} = makeGlowcap([], {lit: true}); for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, worldFor(s.x))
  let highest = 0
  const why = goTo(21, 15, (p) => { highest = Math.max(highest, p.y) })
  check('Glowcap, lit bridge but no branch: stops at the ledge and never gets onto the bridge', why === 'edge' && s.x < 8 && highest < 0.05, `stopped (${why}) at x=${f(s.x)}, highest point ${f(highest)}`) }

// It hops a low step, but a ledge as high as a bloom (0.35) or a wall stops it: it says so
// ('blocked') instead of hopping at it for ever.
{ const step = (h) => [{x: 0, y: -0.5, w: 30, h: 1, solid: true}, {x: 5, y: h / 2, w: 4, h, solid: true}]
  const run = (h) => {
    const solids = step(h); const game = createPlatformer({spawn: {x: -4, y: 0}, fallY: -8, body: GLOWCAP}); const s = game.state
    for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids)
    let why = null
    for (let t = 0; t < 8 && why === null; t += DT) { const w = walkToward(s, 5, solids, [], STEP_RULES); why = w.done; game.step(DT, {dir: w.dir, jumpPressed: w.jump}, solids) }
    return {why, s}
  }
  const low = run(0.2), ledge = run(0.35), wall = run(0.8)
  check('Glowcap: hops onto a 0.2 step; a 0.35 ledge or a 0.8 wall stops it ("blocked")',
    low.s.y === 0.2 && low.why === 'arrived' && ledge.why === 'blocked' && ledge.s.y === 0 && wall.why === 'blocked' && wall.s.y === 0,
    `0.2: y=${f(low.s.y)} ${low.why}; 0.35: y=${f(ledge.s.y)} ${ledge.why}; 0.8: y=${f(wall.s.y)} ${wall.why}`) }

// With the branch grown, the Glowcap walks from where the level starts it, over the gap (the
// bridge lights up around it and it must not get stuck on the blooms), and on to the exit.
{ const surface = branch(); surface.active = true
  const {goTo, s, game} = makeGlowcap([surface], {lit: true})
  let won = false, respawns = 0, highest = 0, x0 = null
  for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, worldFor(s.x), [surface])
  x0 = s.x
  const why = goTo(L.exit.x, 60, (p, g) => {
    highest = Math.max(highest, p.y)
    for (const e of g.drainEvents()) { if (e === 'won') won = true; if (e === 'respawn') respawns++ }
  })
  const peak = surface.heightAt(12.5)
  check('Glowcap, branch grown, bridge lit around it: walks from its start over the gap to the exit (level won), without hopping along the slope',
    won && respawns === 0 && highest < peak + 0.05, `from x=${f(x0)}: won=${won} respawns=${respawns} stopped=${why} at x=${f(s.x)}, highest point ${f(highest)} (branch peak ${f(peak)})`) }

// The branch vanishing under it drops the Glowcap: it comes back at the nearest checkpoint.
{ const surface = branch(); surface.active = true
  const solids = worldFor(null); const game = createPlatformer({spawns: L.respawns.glowcap, fallY: L.fallY, body: GLOWCAP}); const s = game.state
  for (let t = 0; t < 0.6; t += DT) game.step(DT, idle, solids, [surface])
  s.x = 12; s.y = surface.heightAt(12); s.vy = 0
  for (let t = 0; t < 0.3; t += DT) game.step(DT, idle, solids, [surface])
  const onIt = s.onGround && s.groundedOn && s.groundedOn.surface === surface
  surface.active = false
  let respawnedAt = null
  for (let t = 0; t < 3 && respawnedAt === null; t += DT) { game.step(DT, idle, solids, [surface]); if (game.drainEvents().includes('respawn')) respawnedAt = f(s.x) }
  check('branch disappears under the Glowcap: it falls and respawns at its nearest checkpoint (x=-1)', onIt && respawnedAt === L.respawns.glowcap[0].x, `standing on it=${onIt}, respawned at x=${respawnedAt}`) }

// Checkpoints count once reached. Falling into the gap before the far side has been reached
// must NOT put you on the far side (the game's "nearest point" rule would).
for (const [name, body, points, far] of [['acorn', PLAYER, L.respawns.acorn, 24], ['Glowcap', GLOWCAP, L.respawns.glowcap, 26]]) {
  const solids = worldFor(null)
  const fall = (g, x) => { g.state.x = x; g.state.y = L.fallY - 1; g.step(DT, idle, solids); return g.drainEvents().includes('respawn') ? g.state.x : null }
  const g = createPlatformer({spawns: points, fallY: L.fallY, body})
  const beforeReaching = fall(g, 13)   // the far half of the gap: nearest point is the far one
  const g2 = createPlatformer({spawns: points, fallY: L.fallY, body})
  g2.state.x = far; g2.state.y = 0; for (let t = 0; t < 0.5; t += DT) g2.step(DT, idle, solids)   // stands on the far slab
  const afterReaching = fall(g2, 13)
  check(`${name}: falling into the gap before reaching the far side returns to the start; after reaching it, to x=${far}`,
    beforeReaching === points[0].x && afterReaching === far, `before: x=${beforeReaching}, after: x=${afterReaching}`)
}

// groundTopAt: the helper the companion uses to look ahead.
{ const solids = worldFor(6)
  check('groundTopAt: sees the slab, the bloom top, and nothing over the gap',
    groundTopAt(5, solids, [], 0, 0.35, 1.2) === 0 && groundTopAt(10, solids, [], 0.35, 0.35, 1.2) === 0.35 && groundTopAt(8.2, solids, [], 0, 0.35, 1.2) === null) }

console.log(failures === 0 ? '\nALL PHYSICS CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
