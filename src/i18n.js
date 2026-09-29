// The demo's languages and the language switch's state, shared by every screen (the AR view's
// on-screen extras in ui.js, the welcome page in welcome.js). All user-facing text lives in
// STRINGS, one object per language, so it is easy to change or add to.

export const STRINGS = {
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
    welcomeTitle: 'Лісові істоти',
    welcomeBody: 'Відскануй QR-код біля експоната, щоб зустріти його істоту',
    welcomeUnknown: 'Цей код не розпізнано. Спробуй відсканувати його ще раз.',
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
    welcomeTitle: 'Forest Creatures',
    welcomeBody: 'Scan the QR code next to an exhibit to meet its creature',
    welcomeUnknown: 'This code was not recognised. Try scanning it again.',
  },
}

// The order the switch goes through, and what its button says when the next one is that language.
export const LANGS = ['uk', 'en']
export const LANG_LABELS = {uk: 'UA', en: 'EN'}

const LANG_KEY = 'lumina-ar-lang'

// Starts from whatever was picked last time; otherwise from the browser's own language (so the
// user's own phone opens in Ukrainian and, say, a boss's English phone opens in English without
// either of them having to choose). Falls back to English, the more widely understood default.
const detectLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (LANGS.includes(saved)) {
      return saved
    }
  } catch (e) {
    // Storage blocked (private mode, restricted embed): fall through to the browser's language.
  }
  const browser = typeof navigator !== 'undefined' ? (navigator.language || '') : ''
  return browser.toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

const saveLang = (lang) => {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch (e) {
    // Not persisted this time; the switch still works for the rest of the visit.
  }
}

// The strings for whatever language is current. Its identity never changes (callers keep a
// reference, e.g. `ui.text.won`), only its contents do, so a language switch updates every
// string in place without the caller having to re-fetch anything.
export const TEXT = {}

let lang = detectLang()
Object.assign(TEXT, STRINGS[lang])
const listeners = []

// The page's own language and title follow the switch (browsers use them for hyphenation,
// screen readers, the tab's name).
const updateDocument = () => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.title = TEXT.title
  }
}
updateDocument()

export const getLang = () => lang

export const setLang = (next) => {
  if (!LANGS.includes(next)) {
    return
  }
  lang = next
  saveLang(next)
  Object.assign(TEXT, STRINGS[next])
  updateDocument()
  listeners.forEach((listener) => listener(next))
}

// The language the switch would go to next.
export const nextLang = () => LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]

// `listener(lang)` is called after every switch.
export const onLangChange = (listener) => {
  listeners.push(listener)
}
