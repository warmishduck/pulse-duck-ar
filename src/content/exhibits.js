// The exhibits: one entry per QR code. The code in the address (`/?c=03`) picks the entry, so
// what stands at an exhibit can be changed here without printing a new code. Plain data, like
// creatures.js.
//
// An entry has:
//   creatures  who stands there: [{id: 'acorn', x, z, yaw, ...}]. `id` is a key of CREATURES;
//              x/z are where it stands on the floor in front of the phone (default 0 / -0.2);
//              any other field overrides that creature's own setting for this exhibit
//   game       the mini-game to offer (or start in), if any. Only 'light_the_way' exists so far
//   startIn    'game' opens straight into the game, with no creature showcase first
// Codes are lower case letters, digits and dashes.
//
// NOTE: 01-03, demo and yard are stand-ins to try the flow with the three creatures that exist
// so far. They get replaced by the museum's real exhibits and creatures.

const at = (id, x = 0, z = -0.2, extra = {}) => ({id, x, z, ...extra})

// The three creatures standing together, as the demo page has always shown them.
const TOGETHER = [
  {id: 'acorn', x: -0.45, z: -0.85},
  {id: 'pinecone', x: 0.45, z: -0.85},
  {id: 'glowcap', x: 0, z: 0.5},
]

export const EXHIBITS = {
  '01': {creatures: [at('acorn')]},
  '02': {creatures: [at('pinecone')]},
  '03': {creatures: [at('glowcap')], game: 'light_the_way'},
  // The whole demo: all the creatures, and the game a button away.
  demo: {creatures: TOGETHER, game: 'light_the_way'},
  // The yard game, open whenever the museum is closed: no creatures, straight into the game.
  yard: {creatures: [], game: 'light_the_way', startIn: 'game'},
}

// What the welcome page shows (the page you get without a code): a preview of the creatures
// waiting inside, all standing together.
export const PREVIEW = TOGETHER

export const GAMES = ['light_the_way']
