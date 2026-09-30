// Loads a mini-game's implementation by name, lazily: a museum visitor's phone only ever
// downloads the code for the mini-game the exhibit they scanned actually uses, not every kind
// that exists. Add a new kind by adding one line here and a module next to puzzle.js exporting
// a MiniGame subclass as its default export — nothing else needs to know it exists.
const LOADERS = {
  puzzle: () => import('./puzzle.js'),
}

export const MINIGAME_TYPES = Object.keys(LOADERS)

// Resolves to the MiniGame subclass registered for `type`. Rejects if `type` isn't one of
// MINIGAME_TYPES (content.test.js checks every creature's `puzzle.type` is, so this should only
// fail on a real loading problem — a bad deploy, no network — not a config mistake).
export const loadMiniGame = async (type) => {
  const loader = LOADERS[type]
  if (!loader) {
    throw new Error(`Unknown mini-game type "${type}"`)
  }
  const module = await loader()
  return module.default
}
