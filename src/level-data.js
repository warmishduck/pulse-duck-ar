// The level shown in the diorama: "Light the way" (СВІТЛО ВЕДЕ) from the Lumina game, copied
// from scenes/levels/light_the_way.tscn in the Godot project. Units are the game's, and x/y are
// the centre of each box in the level's XY plane; `d` is its depth (z), used only for looks.
//
// How the level is meant to be solved (the game's own hints for it): two slabs of ground with
// an 8-unit gap between them.
//  1. Send the Glowcap ("Glowcap СТІЙ тут") to stand near x = 6. "Bloom" platforms are only
//     there, and only solid, while it is within their light radius, so its light builds a
//     bridge of two platforms across the gap.
//  2. The acorn runs over the bridge to the far slab and, standing at the anchor, grows a
//     branch back over the gap ("Acorn: гілку назад"). The branch only holds while the acorn
//     stays within its light range of the anchor.
//  3. The Glowcap can neither jump the gap nor hop on the bridge platforms (it hops 0.3
//     high), so it walks across the branch and on to the exit. The Glowcap reaching the
//     exit finishes the level (exit_zone.gd only reacts to the Glowcap).

export const LIGHT_THE_WAY = {
  name: 'СВІТЛО ВЕДЕ',
  fallY: -8,                // below this a character respawns (the game's fall zone is at y = -12)
  bounds: {minX: -8, maxX: 30},

  // Where each character starts and where it comes back after falling: the nearest point to
  // where it fell (the game's RespawnPoint markers RA0/RA1 and RG0/RG1). y is the FEET; the
  // game puts the capsule centre at y = 1.
  respawns: {
    acorn: [{x: -3, y: 0.1}, {x: 24, y: 0.1}],
    glowcap: [{x: -1, y: 0.1}, {x: 26, y: 0.1}],
  },

  // Solid ground.
  slabs: [
    {x: 0, y: -0.5, w: 16, h: 1, d: 5},
    {x: 23, y: -0.5, w: 14, h: 1, d: 5},
  ],

  // Platforms that materialise in the Glowcap's light (night_bloom_platform.tscn: 3 x 0.3 x 2).
  // `radius` is how far the light reaches. The six "decor" blooms floating over the start slab
  // are the game's DecorBloomA-F: platforms like the others (solid while the Glowcap's light is on
  // them, so the acorn can jump up onto them), just not part of the puzzle. They are one-way (see
  // platformer.js), so the knee-high shelf they form never blocks anyone walking along the slab.
  // `decor` only marks them so that they cast no shadow on the characters.
  blooms: [
    {x: 10, y: 0.2, w: 3, h: 0.3, d: 2, radius: 8},   // the two that bridge the gap
    {x: 13, y: 0.2, w: 3, h: 0.3, d: 2, radius: 8},
    {x: -6, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
    {x: -4, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
    {x: -2, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
    {x: 0, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
    {x: 2, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
    {x: 4, y: 0.7, w: 3, h: 0.3, d: 2, radius: 6, decor: true},
  ],

  // Where the acorn grows its branch (grow_anchor.tscn: a Branch anchor at x = 17 growing to the
  // left, 9 long). `lightRange`: the branch disappears when the acorn is farther than this from
  // the anchor. `interactRange`: how close the acorn must stand to grow or remove it.
  anchor: {x: 17, y: 0.3, dir: -1, length: 9, lightRange: 9, interactRange: 2.5},

  // The green sphere the Glowcap has to reach.
  exit: {x: 28, y: 1.5, r: 1},
  exitTouchRadius: 1.6,
}
