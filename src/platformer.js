// Side-on platformer physics for the level diorama: pure logic, no three.js, so it can be
// tested on its own. Everything moves in the level's XY plane. Units are the game's
// (metres in the Godot project); the diorama scales them down for display.
//
// The numbers come from the Lumina game's own scripts so the characters feel the same:
//  - the acorn (scenes/player/player.gd): gravity 22, jump velocity 10, walking speed 5, coyote
//    time 0.12 s (you can still jump for a moment after running off a ledge) and jump buffer
//    0.1 s (a jump pressed just before landing still counts). Its capsule is 0.8 x 1.8;
//  - the Glowcap (scenes/companion/glowcap_companion.gd): slow (2.5), and it can only hop 0.3
//    high, "so it doesn't get stuck on low ledges but can't climb up by itself".
// Boxes stand in for the game's capsules.

export const PLAYER = {
  width: 0.8,
  height: 1.8,
  walkSpeed: 5,
  acceleration: 50,    // units/s^2: quick to start and stop, but not instant
  gravity: 22,
  jumpVelocity: 10,
  coyoteTime: 0.12,
  jumpBuffer: 0.1,
  maxFallSpeed: 20,    // also keeps a step from skipping over a 0.3-thick platform
}

export const GLOWCAP = {
  width: 1.6,          // the game's capsule has radius 0.9; a little narrower reads better on a box
  height: 1.7,
  walkSpeed: 2.5,
  acceleration: 30,
  gravity: 22,
  jumpVelocity: Math.sqrt(2 * 22 * 0.3),   // the game derives it from the hop height: v = sqrt(2 g h)
  coyoteTime: 0.06,
  jumpBuffer: 0.1,
  maxFallSpeed: 20,
}

// How the Glowcap walks when sent somewhere (see walkToward). It looks ahead from its centre
// as far as its own body reaches, so it sees a wall or a ledge at the moment it gets there.
export const GLOWCAP_WALK = {edgeAhead: GLOWCAP.width / 2 + 0.05}

const STEP = 1 / 120   // physics runs in fixed slices however long a frame took

const moveToward = (value, target, maxDelta) => {
  if (Math.abs(target - value) <= maxDelta) {
    return target
  }
  return value + Math.sign(target - value) * maxDelta
}

// A platform is {x, y, w, h, solid, oneWay}: x/y is its centre, and `solid` can change at any
// time (the bloom platforms are only solid while they are lit). A `oneWay` platform can be
// stood on but not pushed against: you land on it from above and pass through it from the
// side or from below. The bloom bridge is one, so that the branch, which arches through the
// same space, can be walked without catching on the bridge.
//
// A surface is a walkable slope, like the branch the acorn grows: {active, x0, x1, heightAt(x)}.
// You can walk up and down it and land on it from above, but pass up through it from below.

// The height of the highest ground at `x` that is within reach of `fromY`: at most `maxAbove`
// higher than it and `maxBelow` lower. Returns null when there is none.
export const groundTopAt = (x, solids, surfaces, fromY, maxAbove, maxBelow) => {
  let best = null
  const consider = (top) => {
    if (top <= fromY + maxAbove && top >= fromY - maxBelow && (best === null || top > best)) {
      best = top
    }
  }
  // The floor under a wall is not somewhere to stand: just above it is the wall.
  const buried = (top) => solids.some((o) =>
    o.solid && !o.oneWay && x > o.x - o.w / 2 && x < o.x + o.w / 2 && o.y - o.h / 2 < top + 0.02 && o.y + o.h / 2 > top + 0.02)
  for (const s of solids) {
    if (s.solid && x > s.x - s.w / 2 && x < s.x + s.w / 2 && !buried(s.y + s.h / 2)) {
      consider(s.y + s.h / 2)
    }
  }
  for (const f of surfaces) {
    if (f.active && x >= f.x0 && x <= f.x1) {
      consider(f.heightAt(x))
    }
  }
  return best
}

// What a companion that was told to walk to `targetX` should do this frame. Like the game's
// Glowcap it stops at a ledge instead of walking off it (it looks ahead from its centre),
// hops over ledges it can hop, and gives up in front of ones it cannot.
// Returns {dir, jump, done}: `done` is 'arrived', 'edge' (nothing to stand on ahead, or a
// drop too deep) or 'blocked' (a step too high), or null while it is still walking.
export const walkToward = (p, targetX, solids, surfaces, {edgeAhead = 0.6, maxDrop = 1.2, hop = 0.3, arrival = 0.4} = {}) => {
  const dx = targetX - p.x
  if (Math.abs(dx) < arrival) {
    return {dir: 0, jump: false, done: 'arrived'}
  }
  const dir = Math.sign(dx)
  const probe = p.x + dir * edgeAhead
  // The hop reaches a little less than `hop` (gravity is applied in slices), so a ledge of
  // exactly that height is out of reach rather than something to hop at forever.
  const ahead = groundTopAt(probe, solids, surfaces, p.y, hop - 0.03, maxDrop)
  if (ahead === null) {
    // Nothing reachable: is it a wall too high to hop, or a ledge?
    const wall = groundTopAt(probe, solids, surfaces, p.y, 50, -0.05)
    return {dir: 0, jump: false, done: wall === null ? 'edge' : 'blocked'}
  }
  // Hop at a step, not at a slope: a step is a jump in the ground's height over a short
  // distance, while a slope just rises steadily and can be walked.
  const before = groundTopAt(probe - dir * 0.15, solids, surfaces, p.y, hop - 0.03, maxDrop)
  const step = before !== null && ahead - before > 0.06
  return {dir, jump: p.onGround && step, done: null}
}

export const createPlatformer = ({spawns, spawn, fallY = -8, exit = null, body = PLAYER}) => {
  const respawnPoints = spawns || [spawn]
  const half = body.width / 2
  const overlaps = (px, py, s) =>
    px + half > s.x - s.w / 2 && px - half < s.x + s.w / 2 &&
    py + body.height > s.y - s.h / 2 && py < s.y + s.h / 2

  // If a platform turned solid around the body, shove it out along the shortest way.
  const unstick = (p, solids) => {
    for (const s of solids) {
      if (!s.solid || s.oneWay || !overlaps(p.x, p.y, s)) {
        continue
      }
      const pushes = [
        {axis: 'x', to: s.x - s.w / 2 - half, dist: Math.abs(p.x - (s.x - s.w / 2 - half))},
        {axis: 'x', to: s.x + s.w / 2 + half, dist: Math.abs(p.x - (s.x + s.w / 2 + half))},
        {axis: 'y', to: s.y + s.h / 2, dist: Math.abs(p.y - (s.y + s.h / 2))},
        {axis: 'y', to: s.y - s.h / 2 - body.height, dist: Math.abs(p.y - (s.y - s.h / 2 - body.height))},
      ]
      pushes.sort((a, b) => a.dist - b.dist)
      p[pushes[0].axis] = pushes[0].to
    }
  }

  // x is the body's centre, y is its FEET.
  const p = {
    x: respawnPoints[0].x, y: respawnPoints[0].y, vx: 0, vy: 0,
    facing: 1,
    onGround: false, groundedOn: null,
    coyote: 0, buffer: 0,
    won: false,
    events: [],   // 'jump', 'respawn', 'won' and {type: 'land', speed}; drained by drainEvents()
  }
  let leftover = 0
  let lastSurface = null   // the slope it was standing on a moment ago, so it can stick to it going down
  let reachedX = respawnPoints[0].x   // the furthest it has got: a checkpoint counts once reached

  // Puts the body back at the respawn point nearest to where it fell (the game's checkpoints).
  // The game picks the nearest one whatever the body has done, which lets you skip the
  // gap by falling into its far half and coming back on the far side. Here a checkpoint only
  // counts once the body has got as far as it, so a fall costs you progress, not the puzzle.
  const respawn = () => {
    let best = respawnPoints[0]
    for (const point of respawnPoints) {
      if (point.x <= reachedX + 0.5 && Math.abs(point.x - p.x) < Math.abs(best.x - p.x)) {
        best = point
      }
    }
    p.x = best.x
    p.y = best.y
    p.vx = 0
    p.vy = 0
    p.won = false
    lastSurface = null
    p.events.push('respawn')
  }

  const substep = (dt, dir, jumpPressed, solids, surfaces) => {
    p.vx = moveToward(p.vx, dir * body.walkSpeed, body.acceleration * dt)
    if (dir !== 0) {
      p.facing = dir
    }

    p.coyote = p.onGround ? body.coyoteTime : Math.max(0, p.coyote - dt)
    p.buffer = jumpPressed ? body.jumpBuffer : Math.max(0, p.buffer - dt)
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = body.jumpVelocity
      p.buffer = 0
      p.coyote = 0
      p.onGround = false
      p.events.push('jump')
    }

    p.vy = Math.max(p.vy - body.gravity * dt, -body.maxFallSpeed)

    // Horizontal move first, then vertical, so a wall and a floor never fight each other.
    p.x += p.vx * dt
    for (const s of solids) {
      if (s.solid && !s.oneWay && overlaps(p.x, p.y, s)) {
        p.x = p.vx > 0 ? s.x - s.w / 2 - half : s.x + s.w / 2 + half
        p.vx = 0
      }
    }

    const wasOnGround = p.onGround
    const fallSpeed = -p.vy
    const feetBefore = p.y
    p.y += p.vy * dt
    p.onGround = false
    p.groundedOn = null
    for (const s of solids) {
      if (s.solid && overlaps(p.x, p.y, s)) {
        const top = s.y + s.h / 2
        if (s.oneWay) {
          // Only lands on it: falling (or standing) with the feet having been above its top.
          if (p.vy <= 0 && feetBefore >= top - 0.02) {
            p.y = top
            p.vy = 0
            p.onGround = true
            p.groundedOn = s
          }
        } else if (p.vy <= 0) {
          p.y = top   // landed on top
          p.vy = 0
          p.onGround = true
          p.groundedOn = s
        } else {
          p.y = s.y - s.h / 2 - body.height   // bumped its head on the underside
          p.vy = 0
        }
      }
    }

    // Slopes. Land on one from above, step up onto a low rise while walking, and stay stuck
    // to it walking down (otherwise a slope would launch you into the air every step).
    let onSurface = null
    for (const f of surfaces) {
      if (!f.active || p.x < f.x0 || p.x > f.x1) {
        continue
      }
      const h = f.heightAt(p.x)
      const gap = p.y - h   // > 0: the feet are above the slope
      const fellOnto = p.vy <= 0 && !wasOnGround && gap <= 0 && gap >= -0.5
      const steppedUp = wasOnGround && gap < 0 && gap >= -0.35
      const stuckDown = wasOnGround && gap > 0 && gap <= 0.3 && lastSurface === f
      if (fellOnto || steppedUp || stuckDown) {
        p.y = h
        p.vy = 0
        p.onGround = true
        p.groundedOn = {x: p.x, y: h, w: 0, h: 0, surface: f}
        onSurface = f
      }
    }
    lastSurface = onSurface

    if (p.onGround && !wasOnGround && fallSpeed > 3) {
      p.events.push({type: 'land', speed: fallSpeed})
    }
  }

  return {
    state: p,
    respawn,
    // Starts over from the first respawn point, as if the level had just begun.
    reset() {
      reachedX = respawnPoints[0].x
      p.x = respawnPoints[0].x
      p.y = respawnPoints[0].y
      p.vx = 0
      p.vy = 0
      p.won = false
      p.onGround = false
      p.groundedOn = null
      lastSurface = null
      p.events.length = 0
    },
    // Advances the simulation by `dt` seconds. `input` is {dir: -1|0|1, jumpPressed: bool}
    // where jumpPressed is true only on the frame the button went down.
    step(dt, input, solids, surfaces = []) {
      // A negative or wild dt (a paused tab, a clock hiccup) must not leave the simulation
      // owing time it then spends standing still.
      leftover += Math.min(Math.max(dt, 0), 0.1)
      unstick(p, solids)
      let pressed = input.jumpPressed
      while (leftover >= STEP) {
        substep(STEP, input.dir, pressed, solids, surfaces)
        pressed = false
        leftover -= STEP
      }
      if (p.y < fallY) {
        respawn()
      } else if (p.onGround) {
        reachedX = Math.max(reachedX, p.x)   // only counts while standing on something
      }
      if (exit && !p.won) {
        const dx = p.x - exit.x
        const dy = p.y + body.height / 2 - exit.y
        if (Math.hypot(dx, dy) < exit.r + half) {
          p.won = true
          p.events.push('won')
        }
      }
    },
    drainEvents() {
      return p.events.splice(0)
    },
  }
}
