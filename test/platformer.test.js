// Checks for the level's platformer physics (src/platformer.js) against the rules of the Lumina
// game's own player and platforms. Run with: npm test

import {createPlatformer, PLAYER} from '../src/platformer.js'
import {LIGHT_THE_WAY as L} from '../src/level-data.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const f = (n) => +n.toFixed(2)

// As in the game: a bloom is solid only while the Glowcap's light (radius) reaches it.
const G = {x: L.glowcap.x, y: L.glowcap.y + 0.6}
const world = (lit) => [
  ...L.slabs.map((s) => ({...s, solid: true})),
  ...L.blooms.map((b) => ({...b, solid: lit && Math.hypot(b.x - G.x, b.y - G.y) <= b.radius})),
]
const make = (lit) => {
  const solids = world(lit)
  const game = createPlatformer({spawn: L.spawn, fallY: L.fallY, exit: {...L.exit, r: L.exitTouchRadius}})
  const run = (seconds, input, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) game.step(dt, input, solids) }
  return {game, solids, run, s: game.state}
}
const idle = {dir: 0, jumpPressed: false}

{ const {run, s} = make(true); run(1, idle)
  check('spawn lands on the start slab and stands still', s.onGround && Math.abs(s.y) < 0.01 && Math.abs(s.x - L.spawn.x) < 0.01, `y=${f(s.y)} x=${f(s.x)}`) }
{ const {run, s} = make(false); run(1, idle); const x0 = s.x; run(1, {dir: 1, jumpPressed: false})
  check('walks at ~5 units/s', Math.abs((s.x - x0) - 4.9) < 0.3, `moved ${f(s.x - x0)} in 1 s`) }
{ const {run, s, game, solids} = make(true); run(1, idle)
  let apex = 0, air = 0, pressed = true
  for (let t = 0; t < 2; t += 1 / 60) { game.step(1 / 60, {dir: 0, jumpPressed: pressed}, solids); pressed = false; if (!s.onGround) air += 1 / 60; apex = Math.max(apex, s.y) }
  check('jump apex ~2.27 units (10^2 / (2*22))', Math.abs(apex - 2.27) < 0.1, `apex ${f(apex)}`)
  check('jump air time ~0.91 s (2*10/22)', Math.abs(air - 0.91) < 0.06, `air ${f(air)} s`) }

// unlit: the gap (8 units) is longer than a running jump (5 units/s * 0.91 s = 4.5), so it must be impossible
{ const {s, game, solids} = make(false); for (let t = 0; t < 0.6; t += 1 / 60) game.step(1 / 60, idle, solids)
  let respawned = false, crossed = false
  for (let t = 0; t < 8; t += 1 / 60) {
    game.step(1 / 60, {dir: 1, jumpPressed: s.x > 7.2 && s.onGround}, solids)
    if (game.drainEvents().includes('respawn')) respawned = true
    if (s.x > 16) crossed = true
  }
  check('unlit: cannot cross the gap (falls and respawns)', respawned && !crossed) }

// lit: a simple bot runs right, jumping at ledges and steps; it must reach the exit without ever falling
{ const {s, game, solids} = make(true); for (let t = 0; t < 0.6; t += 1 / 60) game.step(1 / 60, idle, solids)
  let won = false, respawns = 0, maxX = 0; const jumps = []
  for (let t = 0; t < 30 && !won; t += 1 / 60) {
    const ahead = s.x + 1.0
    const groundAhead = solids.some((p) => p.solid && ahead > p.x - p.w / 2 && ahead < p.x + p.w / 2 && Math.abs(s.y - (p.y + p.h / 2)) < 0.6)
    const wallAhead = solids.some((p) => p.solid && ahead > p.x - p.w / 2 && ahead < p.x + p.w / 2 && p.y + p.h / 2 > s.y + 0.05 && p.y - p.h / 2 < s.y + PLAYER.height)
    const jump = s.onGround && (!groundAhead || wallAhead)
    if (jump) jumps.push(f(s.x))
    game.step(1 / 60, {dir: 1, jumpPressed: jump}, solids)
    for (const e of game.drainEvents()) { if (e === 'won') won = true; if (e === 'respawn') respawns++ }
    maxX = Math.max(maxX, s.x)
  }
  check('lit: a running bot crosses the gap and reaches the exit without falling', won && respawns === 0, `won=${won} respawns=${respawns} reached x=${f(maxX)}, jumps at x=[${jumps.join(', ')}]`) }

// the light going off while standing on a bloom drops the player
{ const {run, s, solids} = make(true); run(0.6, idle)
  s.x = 10; s.y = 0.35 + 0.001; s.vy = 0; run(0.3, idle)
  const stood = s.onGround && s.groundedOn && s.groundedOn.x === 10
  solids.forEach((p) => { if (p.radius) p.solid = false })
  run(0.6, idle)
  check('standing on a bloom, then the light goes off: falls through', stood && s.y < 0.2, `stood=${stood} y after=${f(s.y)}`) }

// a floating decor bloom (x=4, y=0.7) can be reached from the ground beside it and stood on
{ const {run, game, s, solids} = make(true); run(0.6, idle)
  const onBloom4 = solids.find((p) => p.x === 4 && p.y === 0.7)
  s.x = 6.9; s.y = 0; s.vx = 0; run(0.2, idle)
  let pressed = true
  for (let t = 0; t < 1.2; t += 1 / 60) { game.step(1 / 60, {dir: t < 0.5 ? -1 : 0, jumpPressed: pressed}, solids); pressed = false }
  check('the floating bloom at x=4 is solid (lit) and can be landed on', onBloom4.solid && s.onGround && s.groundedOn === onBloom4, `solid=${onBloom4.solid} y=${f(s.y)} x=${f(s.x)}`) }

// coyote time
for (const delay of [0.1, 0.3]) {
  const {game, s, solids} = make(false)
  for (let t = 0; t < 0.6; t += 1 / 60) game.step(1 / 60, idle, solids)
  s.x = 8.6; s.onGround = false; s.coyote = 0.12   // as if it had only just left the ground
  let jumped = false
  for (let t = 0; t < 0.5; t += 1 / 60) {
    game.step(1 / 60, {dir: 0, jumpPressed: t >= delay - 1 / 120 && t < delay + 1 / 120}, solids)
    if (game.drainEvents().includes('jump')) jumped = true
  }
  check(`coyote time: a jump ${delay} s after leaving the ground ${delay < 0.12 ? 'still works' : 'is refused'}`, delay < 0.12 ? jumped : !jumped)
}

console.log(failures === 0 ? '\nALL PHYSICS CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
