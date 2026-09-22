// The demo's on-screen extras, drawn as plain DOM on top of the AR canvas: a loading note, a
// hint, a mode switch, the level's move/jump buttons, a mute button, a language switch, and a
// photo button with a preview sheet. Styles are in index.css (the `.ui-*` rules). All
// user-facing text lives in STRINGS (one object per language) so it is easy to change or add to.

const STRINGS = {
  uk: {
    loading: (done, total) => `Завантажую істот… ${done}/${total}`,
    loadingLevel: 'Завантажую рівень…',
    hintCreatures: 'Торкнись істоти — вона зреагує',
    hintLevel: 'Торкнись землі — Glowcap піде туди. Його світло будує міст',
    modeToLevel: '🎮 Рівень',
    modeToCreatures: '🌰 Істоти',
    actionGrow: '🌿 Виростити гілку',
    actionRemove: '🍂 Прибрати гілку',
    won: 'Glowcap дійшов до виходу! ✨',
    branchLost: 'Гілка зникла: жолудь відійшов надто далеко',
    left: 'Вліво',
    right: 'Вправо',
    jump: 'Стрибок',
    mute: 'Вимкнути звук',
    unmute: 'Увімкнути звук',
    photo: 'Зробити фото',
    share: 'Поділитися',
    close: 'Закрити',
    saveHelp: 'Затисни фото, щоб зберегти його',
    photoFailed: 'Не вдалося зробити фото',
    language: 'Мова',
    title: 'Лісові істоти · AR',
  },
  en: {
    loading: (done, total) => `Loading creatures… ${done}/${total}`,
    loadingLevel: 'Loading the level…',
    hintCreatures: 'Tap a creature — it reacts',
    hintLevel: 'Tap the ground — the Glowcap walks there. Its light builds the bridge',
    modeToLevel: '🎮 Level',
    modeToCreatures: '🌰 Creatures',
    actionGrow: '🌿 Grow a branch',
    actionRemove: '🍂 Remove the branch',
    won: 'The Glowcap reached the exit! ✨',
    branchLost: 'The branch is gone: the acorn wandered too far',
    left: 'Left',
    right: 'Right',
    jump: 'Jump',
    mute: 'Mute sound',
    unmute: 'Unmute sound',
    photo: 'Take a photo',
    share: 'Share',
    close: 'Close',
    saveHelp: 'Press and hold the photo to save it',
    photoFailed: 'Could not take a photo',
    language: 'Language',
    title: 'Forest Creatures · AR',
  },
}

const LANG_KEY = 'lumina-ar-lang'

// Starts from whatever was picked last time; otherwise from the browser's own language (so the
// user's own phone opens in Ukrainian and, say, a boss's English phone opens in English without
// either of them having to choose). Falls back to English, the more widely understood default.
const detectLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'uk' || saved === 'en') {
      return saved
    }
  } catch (e) {
    // Storage blocked (private mode, restricted embed): fall through to the browser's language.
  }
  return (navigator.language || '').toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

const saveLang = (lang) => {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch (e) {
    // Not persisted this time; the toggle still works for the rest of the visit.
  }
}

// The strings for whatever language is current. Its identity never changes (callers keep a
// reference, e.g. `ui.text.won`), only its contents do, so a language switch updates every
// string in place without the caller having to re-fetch anything.
const TEXT = {}

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

// `onToggleMute()` flips the sound and returns whether it is now muted. `onPhoto` takes a
// photo; pass null when the engine cannot (then no photo button is shown). `onToggleMode()`
// switches between the creature showcase and the level. `onAction()` is the level's context
// button (grow / remove the branch). `onGesture()` is called on button presses so the caller
// can unlock audio (iOS only allows that from a real touch/click).
export const createUi = ({onToggleMute, onPhoto, onToggleMode, onAction = () => {}, onGesture = () => {}}) => {
  let lang = detectLang()
  Object.assign(TEXT, STRINGS[lang])

  const root = make('div', 'ui')
  const loading = make('div', 'ui-toast ui-loading')
  const notice = make('div', 'ui-toast ui-notice')
  const hint = make('div', 'ui-toast ui-hint', {textContent: TEXT.hintCreatures})
  const mute = make('button', 'ui-button ui-mute', {type: 'button', textContent: '🔊'})
  mute.setAttribute('aria-label', TEXT.mute)
  const langButton = make('button', 'ui-button ui-lang', {type: 'button'})
  const mode = make('button', 'ui-mode', {type: 'button', textContent: TEXT.modeToLevel})
  const flash = make('div', 'ui-flash')
  // A button that only shows when there is something to do right here (in the level: at the anchor).
  const action = make('button', 'ui-action', {type: 'button'})
  root.append(loading, notice, hint, mute, langButton, mode, action, flash)

  const shutter = onPhoto ? make('button', 'ui-shutter', {type: 'button'}) : null
  if (shutter) {
    shutter.setAttribute('aria-label', TEXT.photo)
    shutter.addEventListener('click', onPhoto)
    root.append(shutter)
  }

  // The level's controls: left / right on one side, jump on the other. Held buttons are read
  // every frame through getInput(); a jump press is remembered until it is read.
  const held = {left: false, right: false}
  let jumpQueued = false
  const controls = make('div', 'ui-controls')
  const dpad = make('div', 'ui-dpad')
  const leftButton = make('button', 'ui-control', {type: 'button', textContent: '◀'})
  const rightButton = make('button', 'ui-control', {type: 'button', textContent: '▶'})
  const jumpButton = make('button', 'ui-control ui-control-jump', {type: 'button', textContent: '⤒'})
  leftButton.setAttribute('aria-label', TEXT.left)
  rightButton.setAttribute('aria-label', TEXT.right)
  jumpButton.setAttribute('aria-label', TEXT.jump)
  dpad.append(leftButton, rightButton)
  controls.append(dpad, jumpButton)
  root.append(controls)

  // Pointer events cover touch and mouse alike. Capturing the pointer means letting go
  // outside the button, or sliding a thumb off it, still counts as a release.
  const bindButton = (button, onDown, onUp) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      if (button.setPointerCapture) {
        try {
          button.setPointerCapture(event.pointerId)
        } catch (e) {
          // The pointer is already gone (a very quick tap); the release below still fires.
        }
      }
      button.classList.add('is-down')
      onDown()
    })
    const release = () => {
      button.classList.remove('is-down')
      onUp()
    }
    button.addEventListener('pointerup', () => {
      release()
      onGesture()
    })
    button.addEventListener('pointercancel', release)
    button.addEventListener('lostpointercapture', release)
    button.addEventListener('contextmenu', (event) => event.preventDefault())
  }
  bindButton(leftButton, () => { held.left = true }, () => { held.left = false })
  bindButton(rightButton, () => { held.right = true }, () => { held.right = false })
  bindButton(jumpButton, () => { jumpQueued = true }, () => {})

  // The preview sheet shown after a photo is taken.
  const sheet = make('div', 'ui-sheet')
  const image = make('img', 'ui-sheet-image', {alt: ''})
  const note = make('div', 'ui-sheet-note')
  const actions = make('div', 'ui-sheet-actions')
  const share = make('button', 'ui-pill', {type: 'button', textContent: TEXT.share})
  const close = make('button', 'ui-pill ui-pill-quiet', {type: 'button', textContent: TEXT.close})
  actions.append(share, close)
  sheet.append(image, note, actions)
  root.append(sheet)

  document.body.appendChild(root)

  const setVisible = (node, visible) => node.classList.toggle('is-visible', visible)

  // Tracked so a language switch can redraw whatever is currently on screen without disturbing
  // it otherwise (state that came from outside, like the loading count or the mute icon, isn't
  // ui.js's own to recompute).
  let muted = false
  let currentMode = 'creatures'
  let currentActionKind = null
  let lastLoading = null

  // Redraws every piece of static text in the current language. Called once at start and again
  // whenever the language toggle is pressed; `ui.text.*` itself is the same object throughout
  // (see TEXT above), so a notice already on screen or about to be shown picks up the switch too.
  const refreshTexts = () => {
    document.documentElement.lang = lang
    document.title = TEXT.title
    langButton.textContent = lang === 'uk' ? 'EN' : 'UA'
    langButton.setAttribute('aria-label', TEXT.language)
    mute.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute)
    if (shutter) {
      shutter.setAttribute('aria-label', TEXT.photo)
    }
    leftButton.setAttribute('aria-label', TEXT.left)
    rightButton.setAttribute('aria-label', TEXT.right)
    jumpButton.setAttribute('aria-label', TEXT.jump)
    share.textContent = TEXT.share
    close.textContent = TEXT.close
    mode.textContent = currentMode === 'level' ? TEXT.modeToCreatures : TEXT.modeToLevel
    hint.textContent = currentMode === 'level' ? TEXT.hintLevel : TEXT.hintCreatures
    if (currentActionKind !== null) {
      action.textContent = currentActionKind === 'remove' ? TEXT.actionRemove : TEXT.actionGrow
    }
    if (lastLoading) {
      loading.textContent = TEXT.loading(lastLoading.done, lastLoading.total)
    }
  }

  mute.addEventListener('click', () => {
    muted = onToggleMute()
    mute.textContent = muted ? '🔇' : '🔊'
    mute.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute)
  })

  langButton.addEventListener('click', () => {
    onGesture()
    lang = lang === 'uk' ? 'en' : 'uk'
    saveLang(lang)
    Object.assign(TEXT, STRINGS[lang])
    refreshTexts()
  })

  mode.addEventListener('click', () => {
    onGesture()
    onToggleMode()
  })

  action.addEventListener('click', () => {
    onGesture()
    onAction()
  })

  close.addEventListener('click', () => setVisible(sheet, false))

  // Opens the phone's share sheet (which has "Save Image"). Where that is not available,
  // fall back to telling the person to press and hold the photo, which saves it on iOS.
  share.addEventListener('click', async () => {
    const blob = await (await fetch(image.src)).blob()
    const file = new File([blob], 'lumina-creatures.jpg', {type: 'image/jpeg'})
    if (navigator.canShare && navigator.canShare({files: [file]})) {
      try {
        await navigator.share({files: [file]})
      } catch (e) {
        // The person closed the share sheet without choosing anything; that's fine.
      }
    } else {
      note.textContent = TEXT.saveHelp
    }
  })

  refreshTexts()   // the language may have been detected/restored, so draw it before anything shows

  let noticeTimer = null
  return {
    setLoading(done, total) {
      lastLoading = {done, total}
      loading.textContent = TEXT.loading(done, total)
      setVisible(loading, done < total)
    },
    showHint: () => setVisible(hint, true),
    hideHint: () => setVisible(hint, false),
    // A brief message near the top, e.g. when a photo fails.
    notice(message, ms = 2500) {
      notice.textContent = message
      setVisible(notice, true)
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => setVisible(notice, false), ms)
    },
    hideNotice() {
      clearTimeout(noticeTimer)
      setVisible(notice, false)
    },
    // Shows the context button ('grow' or 'remove') or hides it (null).
    setAction(kind) {
      currentActionKind = kind
      if (kind === null) {
        setVisible(action, false)
        return
      }
      action.textContent = kind === 'remove' ? TEXT.actionRemove : TEXT.actionGrow
      setVisible(action, true)
    },
    // Shows the controls that belong to a mode ('creatures' or 'level') and points the mode
    // button at the other one.
    setMode(name) {
      currentMode = name
      const inLevel = name === 'level'
      setVisible(controls, inLevel)
      mode.textContent = inLevel ? TEXT.modeToCreatures : TEXT.modeToLevel
      hint.textContent = inLevel ? TEXT.hintLevel : TEXT.hintCreatures
      held.left = false
      held.right = false
      jumpQueued = false
    },
    // What the level's buttons say right now. The jump press is consumed by reading it.
    getInput() {
      const jumpPressed = jumpQueued
      jumpQueued = false
      return {dir: (held.right ? 1 : 0) - (held.left ? 1 : 0), jumpPressed}
    },
    flash() {
      flash.classList.remove('is-flashing')
      void flash.offsetWidth  // restart the CSS animation if it is already running
      flash.classList.add('is-flashing')
    },
    showPhoto(base64Jpeg) {
      image.src = `data:image/jpeg;base64,${base64Jpeg}`
      note.textContent = ''
      setVisible(sheet, true)
    },
    text: TEXT,
  }
}
