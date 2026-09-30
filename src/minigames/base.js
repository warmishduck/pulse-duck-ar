// The contract every mini-game type follows, so whatever runs one (see registry.js and
// showcase.js's puzzle-gated creatures) doesn't need to know which kind it is. Only the jigsaw
// puzzle exists yet; a scratch-off, a feeding game, a hold-still game would each be their own
// subclass registered in registry.js, without anything here or in showcase.js changing.
export class MiniGame {
  // `root` is an empty DOM element already in the page, sized to fill it, that this game draws
  // its own UI into. `config` is whatever content/creatures.js's `puzzle` field holds for the
  // creature being unlocked (piece count, snap tolerance, hint delay, the art and sound to use,
  // ...) — each subclass defines what it reads from it. `onWin()` must be called exactly once,
  // the moment the game is won; the caller takes it from there (it does not call destroy() for
  // you — the game may want its solved state on screen for a moment first).
  constructor(root, config, onWin) {
    this.root = root
    this.config = config
    this.onWin = onWin
  }

  // Builds this game's DOM and wires its input. Called once, right after construction.
  start() {}

  // Reverses start(): removes every node this game added under `root`, every listener, every
  // timer. Called once when the game is left, whether won or abandoned; nothing else is called
  // on this instance afterwards.
  destroy() {}
}
