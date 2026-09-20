// The level shown in the diorama: "Light the way" (СВІТЛО ВЕДЕ) from the Lumina game, copied
// from scenes/levels/light_the_way.tscn in the Godot project. Units are the game's, and x/y are
// the centre of each box in the level's XY plane; `d` is its depth (z), used only for looks.
//
// The idea of the level: two slabs of ground with an 8-unit gap between them. Bridging the gap
// are "bloom" platforms that are only solid, and only visible, while the Glowcap is close
// enough to light them. In the game a second player moves the Glowcap; here you tap it to
// switch its light on and off.

export const LIGHT_THE_WAY = {
  name: 'СВІТЛО ВЕДЕ',
  spawn: {x: -3, y: 0.1},   // feet position (the game puts the capsule centre at y = 1)
  fallY: -8,                // below this the player respawns (the game's fall zone is at y = -12)
  bounds: {minX: -8, maxX: 30},

  // Solid ground.
  slabs: [
    {x: 0, y: -0.5, w: 16, h: 1, d: 5},
    {x: 23, y: -0.5, w: 14, h: 1, d: 5},
  ],

  // Platforms that materialise in the Glowcap's light (night_bloom_platform.tscn: 3 x 0.3 x 2).
  // `radius` is how far the light reaches.
  blooms: [
    {x: 10, y: 0.2, w: 3, h: 0.3, d: 2, radius: 8},   // the two that bridge the gap
    {x: 13, y: 0.2, w: 3, h: 0.3, d: 2, radius: 8},
    {x: -6, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},    // "decor" blooms floating above the start
    {x: -4, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},
    {x: -2, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},
    {x: 0, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},
    {x: 2, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},
    {x: 4, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6},
  ],

  // The Glowcap stands still ("Glowcap СТІЙ тут" in the game's own hint) at x = 6, on the ground.
  glowcap: {x: 6, y: 0},

  // Reaching this glowing green sphere finishes the level.
  exit: {x: 28, y: 1.5, r: 1},
  exitTouchRadius: 1.6,
}
