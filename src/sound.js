// Tiny procedural sound effects made with the Web Audio API, so the demo needs no audio
// files (nothing to download, nothing to license). Every sound is a few oscillators or a
// short burst of filtered noise with a quick volume envelope.

let ctx = null      // created on first use
let master = null   // everything plays through this, so one value sets the overall level
let muted = false

const ensureContext = () => {
  if (ctx) {
    return ctx
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    return null
  }
  ctx = new AudioContextClass()
  master = ctx.createGain()
  master.gain.value = 0.7
  master.connect(ctx.destination)
  // Safari 16.4+: mark this as media playback. Otherwise the iPhone's silent switch mutes
  // Web Audio, and the demo would seem to have no sound at all.
  if (navigator.audioSession) {
    navigator.audioSession.type = 'playback'
  }
  return ctx
}

// Browsers only let audio START after a user gesture, and on iOS only touchend / click
// count (touchstart does not). Sounds can be scheduled earlier: a suspended context freezes
// its clock, so they simply begin the moment this resumes it.
export const resumeAudio = () => {
  const audio = ensureContext()
  if (audio && audio.state !== 'running') {
    const pending = audio.resume()
    if (pending && pending.catch) {
      pending.catch(() => {})
    }
  }
}

export const isMuted = () => muted
export const setMuted = (value) => {
  muted = value
}

// A pitched blip that glides from `from` Hz to `to` Hz while fading in and out.
const tone = (type, from, to, duration, volume, when) => {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, when)
  osc.frequency.exponentialRampToValueAtTime(to, when + duration)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + duration + 0.05)
}

// A whoosh: white noise pushed through a band-pass filter that sweeps from `fromHz` to `toHz`.
const noiseBurst = (duration, fromHz, toHz, volume, when) => {
  const length = Math.ceil(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(fromHz, when)
  filter.frequency.exponentialRampToValueAtTime(toHz, when + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(volume, when + duration * 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(when)
}

const SOUNDS = {
  pop: (t) => tone('sine', 520, 170, 0.14, 0.35, t),
  boing: (t) => {
    tone('sine', 170, 560, 0.3, 0.35, t)
    tone('triangle', 560, 250, 0.25, 0.2, t + 0.28)
  },
  squeak: (t) => {
    tone('sawtooth', 950, 420, 0.16, 0.12, t)
    tone('square', 760, 330, 0.14, 0.08, t + 0.14)
  },
  plink: (t) => {
    tone('sine', 660, 660, 0.12, 0.3, t)
    tone('sine', 990, 990, 0.16, 0.3, t + 0.1)
  },
  whoosh: (t) => noiseBurst(0.42, 350, 2200, 0.35, t),
  patter: (t) => {
    for (let i = 0; i < 6; i++) {
      tone('triangle', 240, 110, 0.07, 0.25, t + i * 0.16)
    }
  },
  glowOn: (t) => {
    ;[523, 659, 784, 1047].forEach((hz, i) => tone('sine', hz, hz, 0.6, 0.18, t + i * 0.09))
  },
  glowOff: (t) => tone('sine', 784, 392, 0.45, 0.2, t),
  shutter: (t) => {
    noiseBurst(0.06, 3000, 1500, 0.4, t)
    noiseBurst(0.06, 2500, 1200, 0.3, t + 0.09)
  },
}

export const playSound = (name) => {
  const make = SOUNDS[name]
  if (muted || !make) {
    return
  }
  const audio = ensureContext()
  if (audio) {
    make(audio.currentTime)
  }
}
