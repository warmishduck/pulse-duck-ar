// The creatures: one entry per kind of creature, reused by every exhibit that shows it. This is
// plain data (no imports), so it can be checked in Node (`npm test`). An exhibit says where a
// creature stands (see exhibits.js); this says what it is and how it behaves.
//
// Every entry needs:
//   file          the model, a .glb in src/assets/ (found by name, see models.js)
//   targetHeight  how tall it is scaled to be, in the scene's units
// Optional:
//   phase      offset for its idle bob and heartbeat pulse, so creatures don't move in lockstep
//   yaw        starting rotation about the vertical axis, in radians
//   spinSpeed  turntable spin in rad/s (default 0: it just faces the viewer)
//   hover/bob  how high it floats above the floor and how much it bobs (defaults 0.08/0.05)
//   hop        set false to skip the tap-triggered hop
//   hopSound   sound to play with the hop (names are in sound.js)
//   reactions  built-in clips to play on tap, each with the sound that goes with it. They come
//              out in a shuffled order, then it eases back to its 'Idle' clip. `repeat` loops
//              a short clip.
//   glow       tapping toggles a glow instead
// A placement in an exhibit can override any of these for that one exhibit.

export const CREATURES = {
  acorn: {
    file: 'Acorn.glb', targetHeight: 0.85, phase: 0, yaw: 0.3, hover: 0, bob: 0, hop: false,
    reactions: [
      {clip: 'Jump', sound: 'boing'},
      {clip: 'Ouch', sound: 'squeak'},
      {clip: 'PickUp', sound: 'plink'},
      {clip: 'PickThrow', sound: 'whoosh'},
      {clip: 'Run', repeat: 3, sound: 'patter'},
    ],
  },
  pinecone: {
    file: 'Pinecone.glb', targetHeight: 0.8, phase: Math.PI / 2, spinSpeed: -0.6, hopSound: 'pop',
  },
  glowcap: {
    file: 'Glowcap.glb', targetHeight: 0.55, phase: Math.PI, spinSpeed: -0.5, hop: false, glow: true,
  },
}
