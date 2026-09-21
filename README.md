# Forest creatures · AR

A small WebAR demo: three rigged creatures stand on the floor in front of your phone's camera,
and tapping them makes them react.

**Try it:** https://warmishduck.github.io/pulse-duck-ar/ — open it on a phone (on a desktop it
shows a QR code, because the camera tracking needs a phone).

![The three creatures](./public/preview.jpg)

## What's in it

- **Acorn** — plays one of five animations when tapped (the first tap is always the jump), then
  settles back into its idle loop.
- **Pinecone** — hops when tapped.
- **Glowcap** — tap it to make it glow; tap again to switch it off.
- A **photo button** (camera feed plus creatures, ready to share), a **mute button**, and a
  first-tap hint. The sound effects are synthesized in the browser, so there are no audio files.
- A **level mode** (the button at the top left): a small diorama of a level from the game,
  "Light the way", which is a puzzle for the two of them.
  - You steer the **acorn** with the on-screen buttons (or the arrow keys and space bar on a
    computer). The **Glowcap** is slow and cannot jump far; you send it somewhere by tapping the
    ground there, and tapping the Glowcap itself calls it to the acorn. It stops at ledges.
  - The Glowcap always glows, and the "bloom" platforms bridging the gap are solid only while it
    is close enough to light them, so the acorn can cross only if the Glowcap is standing near
    the bridge. Take it away and the bridge lets the acorn fall. The row of glowing platforms
    over the start slab works the same way: jump up onto it, and it drops you when the light
    moves off. You can stand on these platforms, but walk through their sides.
  - The Glowcap cannot follow over the gap. At the far side is a glowing anchor: stand next to it
    and press the button to grow a branch back across the gap, which the Glowcap can walk over.
    The branch holds only while the acorn stays near the anchor.
  - The level is won when the **Glowcap** reaches the green sphere; it then starts over.

## Run it locally

```
npm install
npm run serve
```

Camera access needs HTTPS, so to try it on a phone, expose the dev server through a tunnel
(for example `ngrok http 5173`) and add the tunnel's domain to `server.allowedHosts` in
`vite.config.js`.

## Deploy

Pushing to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). To build by hand: `npm run build` (output in `dist/`).

## How it's put together

- `src/app.js` — starts the 8th Wall camera pipeline.
- `src/threejs-scene-init.js` — the three.js scene: loading the models, lighting, the two modes,
  and how each creature reacts to a tap. The list of creatures and their behaviour is the `items`
  array at the top.
- `src/level.js` — the level diorama: builds the platforms, the acorn, the Glowcap and the branch,
  and scrolls a window over the level. `src/level-data.js` holds the level itself (taken from the
  game's `light_the_way.tscn`).
- `src/platformer.js` — the platformer physics, with no three.js in it. It uses the numbers from the
  game's scripts (gravity, jump, speed, coyote time; the Glowcap's slow walk and 0.3 hop) so the
  characters feel the same. `src/branch.js` is the branch's curve and the slope that is walked on.
  `npm test` checks all of it against the level's rules.
- `src/rig.js`, `src/glow.js` — helpers shared by both modes: placing rigged characters, and the glow.
- `src/ui.js`, `src/index.css` — loading note, hints, mode switch, the level's buttons, mute and photo.
- `src/sound.js` — the synthesized sound effects.
- `src/assets/` — the `.glb` models. Keep them small: they are downloaded by every visitor.

## Notes

- Camera tracking comes from the 8th Wall engine binary, loaded from jsDelivr and pinned to
  `1.0.0` in `index.html`. The hosted 8th Wall platform has been shut down; the engine
  continues at [8thwall.org](https://8thwall.org), including the
  [terms for the distributed binary](https://8thwall.org/docs/migration/faq#distributed-engine-binary-license-and-permitted-use).
- Started from 8th Wall's "three.js: World Effects" example.
- The creature models come from the author's own game project.
