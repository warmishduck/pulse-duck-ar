// Side-on platformer physics for the level diorama: pure logic, no three.js, so it can be
// tested on its own. Everything moves in the level's XY plane. Units are the game's
// (metres in the Godot project); the diorama scales them down for display.
//
// The numbers come from the Lumina game's player script (scenes/player/player.gd) so the
// character feels the same: gravity 22, jump velocity 10, walking speed 5, coyote time 0.12 s
// (you can still jump for a moment after running off a ledge) and jump buffer 0.1 s (a jump
// pressed just before landing still counts). The game's capsule is 0.8 wide and 1.8 tall; a
// box of that size is close enough for a diorama.

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

const STEP = 1 / 120   // physics runs in fixed slices however long a frame took
const HALF = PLAYER.width / 2

const moveToward = (value, target, maxDelta) => {
  if (Math.abs(target - value) <= maxDelta) {
    return target
  }
  return value + Math.sign(target - value) * maxDelta
}

// A platform is {x, y, w, h, solid}: x/y is its centre, and `solid` can change at any time
// (the bloom platforms are only solid while they are lit).
const overlaps = (px, py, s) =>
  px + HALF > s.x - s.w / 2 && px - HALF < s.x + s.w / 2 &&
  py + PLAYER.height > s.y - s.h / 2 && py < s.y + s.h / 2

// If a platform turned solid around the player, shove the player out along the shortest way.
const unstick = (p, solids) => {
  for (const s of solids) {
    if (!s.solid || !overlaps(p.x, p.y, s)) {
      continue
    }
    const pushes = [
      {axis: 'x', to: s.x - s.w / 2 - HALF, dist: Math.abs(p.x - (s.x - s.w / 2 - HALF))},
      {axis: 'x', to: s.x + s.w / 2 + HALF, dist: Math.abs(p.x - (s.x + s.w / 2 + HALF))},
      {axis: 'y', to: s.y + s.h / 2, dist: Math.abs(p.y - (s.y + s.h / 2))},
      {axis: 'y', to: s.y - s.h / 2 - PLAYER.height, dist: Math.abs(p.y - (s.y - s.h / 2 - PLAYER.height))},
    ]
    pushes.sort((a, b) => a.dist - b.dist)
    p[pushes[0].axis] = pushes[0].to
  }
}

export const createPlatformer = ({spawn, fallY = -8, exit = null}) => {
  // x is the player's centre, y is the player's FEET.
  const p = {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    facing: 1,
    onGround: false, groundedOn: null,
    coyote: 0, buffer: 0,
    won: false,
    events: [],   // 'jump', 'respawn', 'won' and {type: 'land', speed}; drained by drainEvents()
  }
  let leftover = 0

  const respawn = () => {
    p.x = spawn.x
    p.y = spawn.y
    p.vx = 0
    p.vy = 0
    p.won = false
    p.events.push('respawn')
  }

  const substep = (dt, dir, jumpPressed, solids) => {
    p.vx = moveToward(p.vx, dir * PLAYER.walkSpeed, PLAYER.acceleration * dt)
    if (dir !== 0) {
      p.facing = dir
    }

    p.coyote = p.onGround ? PLAYER.coyoteTime : Math.max(0, p.coyote - dt)
    p.buffer = jumpPressed ? PLAYER.jumpBuffer : Math.max(0, p.buffer - dt)
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = PLAYER.jumpVelocity
      p.buffer = 0
      p.coyote = 0
      p.onGround = false
      p.events.push('jump')
    }

    p.vy = Math.max(p.vy - PLAYER.gravity * dt, -PLAYER.maxFallSpeed)

    // Horizontal move first, then vertical, so a wall and a floor never fight each other.
    p.x += p.vx * dt
    for (const s of solids) {
      if (s.solid && overlaps(p.x, p.y, s)) {
        p.x = p.vx > 0 ? s.x - s.w / 2 - HALF : s.x + s.w / 2 + HALF
        p.vx = 0
      }
    }

    const wasOnGround = p.onGround
    p.y += p.vy * dt
    p.onGround = false
    p.groundedOn = null
    for (const s of solids) {
      if (s.solid && overlaps(p.x, p.y, s)) {
        if (p.vy <= 0) {
          p.y = s.y + s.h / 2   // landed on top
          if (!wasOnGround && p.vy < -3) {
            p.events.push({type: 'land', speed: -p.vy})
          }
          p.vy = 0
          p.onGround = true
          p.groundedOn = s
        } else {
          p.y = s.y - s.h / 2 - PLAYER.height   // bumped its head on the underside
          p.vy = 0
        }
      }
    }
  }

  return {
    state: p,
    respawn,
    // Advances the simulation by `dt` seconds. `input` is {dir: -1|0|1, jumpPressed: bool}
    // where jumpPressed is true only on the frame the button went down.
    step(dt, input, solids) {
      // A negative or wild dt (a paused tab, a clock hiccup) must not leave the simulation
      // owing time it then spends standing still.
      leftover += Math.min(Math.max(dt, 0), 0.1)
      unstick(p, solids)
      let pressed = input.jumpPressed
      while (leftover >= STEP) {
        substep(STEP, input.dir, pressed, solids)
        pressed = false
        leftover -= STEP
      }
      if (p.y < fallY) {
        respawn()
      }
      if (exit && !p.won) {
        const dx = p.x - exit.x
        const dy = p.y + PLAYER.height / 2 - exit.y
        if (Math.hypot(dx, dy) < exit.r + HALF) {
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
