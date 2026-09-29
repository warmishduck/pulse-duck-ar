// The creature showcase: a set of creatures standing in a scene, each loaded from its model,
// kept animated (idle bob, heartbeat pulse, turntable spin, skeletal clips), and reacting when
// tapped in whatever way its entry in content/creatures.js describes (the pinecone hops, the
// acorn plays one of its animations, the glowcap lights up). Used by the AR view and by the
// welcome page, so neither needs its own copy of any of this.
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

import {CREATURES} from './content/creatures.js'
import {createGlow, updateGlow} from './glow'
import {modelUrl} from './models'
import {measureModel, pinRootHorizontally} from './rig'
import {playSound} from './sound'

const BPM = 70                 // "heartbeat" rate for the idle pulse animation
const JUMP_DURATION = 0.45     // seconds a tap-triggered hop takes, start to finish
const JUMP_HEIGHT = 0.35       // how high a tapped character hops
const HIT_BOX_EXTRA_HEIGHT = 0.4  // headroom above an animated character that still counts as a hit

// Returns a copy of `array` in random order (Fisher-Yates).
const shuffled = (array) => {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

// `placements` is a list like [{id: 'acorn', x, z, ...overrides}] (see content/exhibits.js).
// `glowLight` is the shared point light the glowcap's glow drives. `onProgress(done, total)` is
// called as each model finishes loading (or fails to).
export const createShowcase = ({placements, glowLight, onProgress = () => {}}) => {
  // Each item is a creature's own settings with this placement's overrides on top.
  const items = placements.map((placement) => ({...CREATURES[placement.id], ...placement}))

  // Each item's animated container, populated by load(). Parallel to `items`.
  const groups = []
  // Elapsed timestamp when an item was last tapped, or null if not hopping.
  const jumpStart = items.map(() => null)
  // Skeletal-animation mixers for models that ship with built-in clips (glowcap, acorn).
  const mixers = []
  // Tap-reaction state for items with `reactions` and glow state for items with `glow`
  // (both parallel to `items`, filled in once the model has loaded).
  const reactionStates = items.map(() => null)
  const glows = items.map(() => null)

  let finished = 0    // how many models have loaded (or failed to)
  let now = 0         // the time of the latest update(), which taps are stamped with
  let active = true   // false while something else (the level) has the stage

  // Sets up tap reactions for an animated model: one action per reaction clip, and the way
  // back to the idle loop once a reaction has finished.
  const setupReactions = (index, mixer, idleAction, clips, reactions) => {
    const list = []
    const sounds = []  // parallel to `list`: the sound that goes with each reaction
    reactions.forEach(({clip, repeat, sound}) => {
      const found = THREE.AnimationClip.findByName(clips, clip)
      if (!found) {
        console.warn(`Reaction clip "${clip}" not found in the model`)
        return
      }
      const action = mixer.clipAction(found)
      action.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat || 1)
      action.clampWhenFinished = true  // hold the last pose while easing back to idle
      list.push(action)
      sounds.push(sound)
    })
    if (list.length === 0) {
      return
    }

    // The first tap always plays the first listed reaction (the jump); the rest of that
    // round follows in random order.
    const rest = shuffled(list.map((action, i) => i).slice(1))
    const state = {idle: idleAction, list, sounds, current: null, queue: [0, ...rest], last: -1}
    reactionStates[index] = state
    mixer.addEventListener('finished', (event) => {
      // Ignore clips that were interrupted by a newer tap; only the current one returns to idle.
      if (event.action === state.current) {
        idleAction.reset().play().crossFadeFrom(event.action, 0.4, false)
        state.current = null
      }
    })
  }

  // Picks which reaction plays next. They come out of a shuffled "bag": every reaction
  // plays once before any repeats, so a few taps show all of them (pure random would
  // sometimes take a dozen taps to show one), and never the same one twice in a row.
  const nextReactionIndex = (state) => {
    if (state.queue.length === 0) {
      state.queue = shuffled(state.list.map((action, i) => i))
      if (state.queue.length > 1 && state.queue[0] === state.last) {
        state.queue.push(state.queue.shift())  // don't open a round with the one that just played
      }
    }
    return state.queue.shift()
  }

  // Plays the next reaction. A tap during a reaction interrupts it and blends straight
  // into the next one.
  const playReaction = (index) => {
    const state = reactionStates[index]
    if (!state) {
      return
    }
    const pick = nextReactionIndex(state)
    state.last = pick

    const next = state.list[pick]
    const from = state.current || state.idle
    next.reset().play().crossFadeFrom(from, state.current ? 0.2 : 0.25, false)
    state.current = next
    playSound(state.sounds[pick])
  }

  const modelFinished = () => {
    finished++
    onProgress(finished, items.length)
  }

  // Loads one model into its own group, normalizing scale/footing so it stands on the
  // floor at (x, 0, z) regardless of the source model's original size/pivot.
  const loadItem = (index, scene) => {
    const {file, targetHeight, x, z, yaw = 0, reactions, glow} = items[index]
    const url = modelUrl(file)
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = yaw
    group.visible = active
    scene.add(group)
    groups[index] = group

    if (reactions) {
      // An invisible box to tap on. A moving skinned mesh is a poor hit target (its cached
      // bounds are computed once, in one pose, so a jump can leave them). Raycasting ignores
      // `visible`, so this box still catches taps without being drawn.
      const height = targetHeight + HIT_BOX_EXTRA_HEIGHT
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), new THREE.MeshBasicMaterial())
      hitBox.position.y = height / 2
      hitBox.visible = false
      group.add(hitBox)
    }

    new GLTFLoader().load(
      url,
      (gltf) => {
        const model = gltf.scene
        const clips = gltf.animations
        const idleClip = THREE.AnimationClip.findByName(clips, 'Idle') || clips[0]
        if (reactions) {
          pinRootHorizontally(model, clips, idleClip)
        }

        const {box, mixer} = measureModel(model, idleClip)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        const scale = targetHeight / size.y
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
          }
          if (node.isSkinnedMesh) {
            // three caches the bounding sphere once, from a single pose; once the bones
            // animate, the mesh can drift outside it and get wrongly culled.
            node.frustumCulled = false
          }
        })

        group.add(model)

        // Animated models come back with a mixer that is already playing their idle clip.
        if (mixer) {
          mixers.push(mixer)
          if (reactions) {
            setupReactions(index, mixer, mixer.clipAction(idleClip), clips, reactions)
          }
        }
        if (glow) {
          glows[index] = createGlow(group, model, glowLight)
          if (active) {
            glows[index].attachLight()
          }
        }
        modelFinished()
      },
      undefined,
      (err) => {
        console.error(`Failed to load model ${url}:`, err)  // shows up in the phone's console
        modelFinished()  // count it anyway, or the loading note would never go away
      }
    )
  }

  return {
    count: items.length,

    // Adds the creatures to `scene` and starts loading their models.
    load(scene) {
      if (items.length === 0) {
        onProgress(0, 0)
      }
      items.forEach((item, i) => loadItem(i, scene))
    },

    // Shows the creatures or hides them (the level takes the stage). Either way the glows start
    // from off, and coming back moves the shared light to the glowcap again.
    setActive(on) {
      active = on
      groups.forEach((group) => {
        group.visible = on
      })
      glows.forEach((glow) => {
        if (!glow) {
          return
        }
        glow.target = 0
        glow.level = 0
        if (on) {
          glow.attachLight()
        }
      })
      glowLight.intensity = 0
    },

    // Returns the index of whichever creature the aimed raycaster's ray hits, or -1 if it
    // missed them all.
    hitTest(raycaster) {
      const hits = raycaster.intersectObjects(groups, true)  // true: check nested meshes too
      if (hits.length === 0) {
        return -1
      }

      // Walk up from the hit mesh to whichever top-level group it belongs to.
      let node = hits[0].object
      while (node && !groups.includes(node)) {
        node = node.parent
      }
      return groups.indexOf(node)
    },

    // Makes creature `index` react in whatever way its entry describes.
    tap(index) {
      if (items[index].hop !== false) {
        jumpStart[index] = now
        playSound(items[index].hopSound)
      }
      playReaction(index)  // does nothing for models without reactions
      if (glows[index]) {
        glows[index].target = glows[index].target ? 0 : 1
        playSound(glows[index].target ? 'glowOn' : 'glowOff')
      }
    },

    // Advances the skeletal animations, then spins, bobs and pulses each creature, adding a hop
    // on top for whichever one was just tapped. `t` is the total time in seconds.
    update(dt, t) {
      now = t
      mixers.forEach((mixer) => mixer.update(dt))
      glows.forEach((glow) => glow && updateGlow(glow, dt, t))

      groups.forEach((group, i) => {
        const {spinSpeed = 0, phase = 0, hover = 0.08, bob = 0.05} = items[i]

        group.rotation.y += dt * spinSpeed

        // Tap-triggered hop: a half sine arc over JUMP_DURATION seconds, then done.
        let hopOffset = 0
        if (jumpStart[i] !== null) {
          const elapsed = t - jumpStart[i]
          if (elapsed < JUMP_DURATION) {
            hopOffset = Math.sin((elapsed / JUMP_DURATION) * Math.PI) * JUMP_HEIGHT
          } else {
            jumpStart[i] = null
          }
        }

        group.position.y = hover + Math.sin(t * 1.5 + phase) * bob + hopOffset

        // Subtle "heartbeat" scale pulse at BPM, offset per item so they don't beat in unison.
        const beat = t * (BPM / 60) * Math.PI * 2 + phase
        group.scale.setScalar(1 + Math.sin(beat) * 0.05)  // ±5% breathing
      })
    },
  }
}
