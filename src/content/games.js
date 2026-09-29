// The mini-games: one entry per game id, referenced by an exhibit's `game` field
// (content/exhibits.js). This is the one place that ties a game id to what actually plays:
//   type   which kind of game it is. Only 'platformer' exists so far (src/level.js runs it);
//          a different kind of game would get its own type here and a branch in
//          threejs-scene-init.js to start it, alongside this one, not instead of it.
//   data   the level layout the platformer plays (src/level-data.js has the one that exists;
//          a level converted from another Godot scene is just another data file added here).
//
// The point of the indirection: an exhibit says *which* game by id (e.g. 'light_the_way'), not
// which file or which data shape, so different exhibits can already point at different levels of
// the same platformer (once more than one level exists) without any code changing, the same way
// content/creatures.js lets exhibits share or vary creatures.
import {LIGHT_THE_WAY} from '../level-data.js'

export const GAMES = {
  light_the_way: {type: 'platformer', data: LIGHT_THE_WAY},
}
