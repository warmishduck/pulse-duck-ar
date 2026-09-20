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
  "Light the way". Steer the acorn with the on-screen buttons (or the arrow keys and space bar
  on a computer). Tap the Glowcap to switch its light on: the glowing "bloom" platforms bridging
  the gap only exist, and are only solid, while it shines on them. Reach the green sphere to
  finish. Switch the light off while standing on a platform and it lets you fall.

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
- `src/level.js` — the level diorama: builds the platforms, the acorn and the Glowcap, and scrolls
  a window over the level. `src/level-data.js` holds the level itself (copied from the game's
  `light_the_way.tscn`).
- `src/platformer.js` — the platformer physics, with no three.js in it. It uses the numbers from the
  game's player script (gravity, jump, speed, coyote time) so the acorn feels the same.
  `npm test` checks it against the level's rules.
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
