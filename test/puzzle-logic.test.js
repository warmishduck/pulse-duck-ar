// Checks for the jigsaw puzzle's rules (src/minigames/puzzle-logic.js). Run with: npm test

import {
  applySaved, createPuzzle, isPieceCorrect, isSolved, layoutFor, resolveDrop, rotatePiece, solveAll, toSaved,
} from '../src/minigames/puzzle-logic.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }

// A fixed sequence instead of Math.random, so tests are exactly repeatable.
const seeded = (seed) => {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

// ---------------------------------------------------------------- layout and setup
check('layoutFor(6): a 2x3 grid', (() => { const l = layoutFor(6); return l.rows === 2 && l.cols === 3 })())
check('an unknown piece count has no layout', (() => { try { layoutFor(5); return false } catch (e) { return true } })())

{ const {rows, cols, pieces, trayOrder} = createPuzzle(6, seeded(1))
  check('createPuzzle(6): six pieces, each with a distinct home slot',
    pieces.length === 6 && new Set(pieces.map((p) => `${p.homeRow},${p.homeCol}`)).size === 6, `rows=${rows} cols=${cols}`)
  check('createPuzzle: every piece starts unplaced', pieces.every((p) => p.row === null && p.col === null))
  check('createPuzzle: the tray holds every piece exactly once', new Set(trayOrder).size === 6 && trayOrder.length === 6)
  check('createPuzzle: not already solved', !isSolved(pieces)) }

// A puzzle where every piece happens to start upright (rotation 0) is still not solved, because
// nothing is placed yet — isSolved must check position too, not just rotation.
{ const {pieces} = createPuzzle(6, () => 0)
  check('all pieces upright but unplaced: still not solved', pieces.every((p) => p.rotation === 0) && !isSolved(pieces)) }

// ---------------------------------------------------------------- rotating
{ const {pieces} = createPuzzle(6, () => 0)
  rotatePiece(pieces, 0, 1)
  check('rotate right: 0 -> 1', pieces[0].rotation === 1)
  rotatePiece(pieces, 0, 1)
  rotatePiece(pieces, 0, 1)
  rotatePiece(pieces, 0, 1)
  check('rotate right four times: back to 0 (wraps)', pieces[0].rotation === 0)
  rotatePiece(pieces, 0, -1)
  check('rotate left from 0: wraps to 3, not -1', pieces[0].rotation === 3) }

// ---------------------------------------------------------------- dropping / snapping
{ const {pieces} = createPuzzle(6, () => 0)
  // (1/3, 1/2) sits exactly on the boundary between four slots — as far from any slot centre as
  // a point on this board can be.
  const r = resolveDrop(pieces, 2, 1 / 3, 1 / 2, 2, 3, 0.15)
  check('drop far from any slot centre: not snapped, piece stays unplaced', !r.snapped && pieces[2].row === null) }

{ const {pieces} = createPuzzle(6, () => 0)
  // piece 0's home is row 0, col 0: its slot centre is at x=1/6, y=1/4 of the board
  const r = resolveDrop(pieces, 0, 1 / 6 + 0.02, 1 / 4 + 0.02, 2, 3, 0.15)
  check('drop close to its own slot centre: snaps there', r.snapped && r.row === 0 && r.col === 0 && pieces[0].row === 0 && pieces[0].col === 0) }

{ const {pieces} = createPuzzle(6, () => 0)
  resolveDrop(pieces, 0, 1 / 6, 1 / 4, 2, 3, 0.15)          // piece 0 into slot (0,0)
  const r = resolveDrop(pieces, 1, 1 / 6, 1 / 4, 2, 3, 0.15) // piece 1 dropped into the same slot
  check('dropping onto an occupied slot displaces the occupant back to the tray',
    r.snapped && r.displacedId === 0 && pieces[0].row === null && pieces[0].col === null && pieces[1].row === 0 && pieces[1].col === 0) }

{ const {pieces} = createPuzzle(6, () => 0)
  resolveDrop(pieces, 0, 1 / 6, 1 / 4, 2, 3, 0.15)
  resolveDrop(pieces, 0, 0.9, 0.9, 2, 3, 0.15)   // the same piece dragged off into empty space
  check('a placed piece dragged to nowhere goes back to the tray, not stuck', pieces[0].row === null && pieces[0].col === null) }

// ---------------------------------------------------------------- solving
{ const {pieces, rows, cols} = createPuzzle(6, seeded(7))
  pieces.forEach((p) => {
    const cx = (p.homeCol + 0.5) / cols, cy = (p.homeRow + 0.5) / rows
    resolveDrop(pieces, p.id, cx, cy, rows, cols, 0.15)
    p.rotation = 0
  })
  check('every piece in its home slot, upright: solved', isSolved(pieces) && pieces.every(isPieceCorrect)) }

{ const {pieces, rows, cols} = createPuzzle(6, seeded(7))
  pieces.forEach((p) => {
    const cx = (p.homeCol + 0.5) / cols, cy = (p.homeRow + 0.5) / rows
    resolveDrop(pieces, p.id, cx, cy, rows, cols, 0.15)
    p.rotation = 0
  })
  rotatePiece(pieces, 0, 1)
  check('one piece home but turned: not solved (position alone is not enough)', !isSolved(pieces)) }

{ const {pieces} = createPuzzle(6, () => 0)
  solveAll(pieces)
  check('the staff bypass solves it outright', isSolved(pieces)) }

// ---------------------------------------------------------------- save / restore
{ const a = createPuzzle(6, seeded(3))
  resolveDrop(a.pieces, 0, 1 / 6, 1 / 4, 2, 3, 0.15)
  rotatePiece(a.pieces, 2, 1)
  const rotated = a.pieces[2].rotation   // whatever that landed on — createPuzzle's own start is random
  const saved = toSaved(a.pieces)

  const b = createPuzzle(6, seeded(9))   // a fresh puzzle, deliberately shuffled differently
  const ok = applySaved(b.pieces, saved, 2, 3)
  check('applySaved restores position and rotation from a save',
    ok && b.pieces[0].row === 0 && b.pieces[0].col === 0 && b.pieces[2].rotation === rotated) }

{ const {pieces} = createPuzzle(6, seeded(3))
  check('applySaved rejects a save for a different piece count', !applySaved(pieces, [{id: 0, row: 0, col: 0, rotation: 0}], 2, 3)) }
{ const {pieces} = createPuzzle(6, seeded(3))
  const junk = [{id: 0, row: 0, col: 0, rotation: 0}, {id: 1, row: 0, col: 1, rotation: 0}, {id: 99, row: 0, col: 2, rotation: 0},
    {id: 2, row: null, col: null, rotation: 0}, {id: 3, row: null, col: null, rotation: 0}, {id: 4, row: null, col: null, rotation: 0}]
  check('applySaved rejects a save with an id that doesn\'t exist (corrupted/stale)', !applySaved(pieces, junk, 2, 3))
  check('...and leaves the puzzle untouched when it rejects', pieces.every((p) => p.row === null && p.col === null)) }

// A save from before the puzzle's grid changed shape (e.g. content/creatures.js's rows/cols
// edited) must not be applied — a saved column that no longer exists would otherwise crash
// slotEl() with "undefined is not an object" the moment the DOM layer tries to place it there.
{ const landscape = createPuzzle(6, () => 0)   // the old 2-row x 3-col layout
  resolveDrop(landscape.pieces, 2, 5 / 6, 1 / 4, 2, 3, 0.15)   // piece 2 into column 2 (only valid when cols=3)
  const saved = toSaved(landscape.pieces)

  const portrait = createPuzzle(6, () => 0, {rows: 3, cols: 2})   // the new 3-row x 2-col layout
  const ok = applySaved(portrait.pieces, saved, portrait.rows, portrait.cols)
  check('applySaved rejects a save whose column no longer exists in a reshaped grid', !ok)
  check('...and leaves the reshaped puzzle untouched', portrait.pieces.every((p) => p.row === null && p.col === null)) }

console.log(failures === 0 ? '\nALL PUZZLE LOGIC CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
