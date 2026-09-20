// The demo's on-screen extras, drawn as plain DOM on top of the AR canvas: a loading note, a
// first-tap hint, a mute button, and a photo button with a preview sheet. Styles are in
// index.css (the `.ui-*` rules). All user-facing text lives in TEXT so it is easy to change.

const TEXT = {
  loading: (done, total) => `Завантажую істот… ${done}/${total}`,
  hint: 'Торкнись істоти — вона зреагує',
  mute: 'Вимкнути звук',
  unmute: 'Увімкнути звук',
  photo: 'Зробити фото',
  share: 'Поділитися',
  close: 'Закрити',
  saveHelp: 'Затисни фото, щоб зберегти його',
  photoFailed: 'Не вдалося зробити фото',
}

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

// `onToggleMute()` flips the sound and returns whether it is now muted. `onPhoto` takes a
// photo; pass null when the engine cannot (then no photo button is shown).
export const createUi = ({onToggleMute, onPhoto}) => {
  const root = make('div', 'ui')
  const loading = make('div', 'ui-toast ui-loading')
  const notice = make('div', 'ui-toast ui-notice')
  const hint = make('div', 'ui-toast ui-hint', {textContent: TEXT.hint})
  const mute = make('button', 'ui-button ui-mute', {type: 'button', textContent: '🔊'})
  mute.setAttribute('aria-label', TEXT.mute)
  const flash = make('div', 'ui-flash')
  root.append(loading, notice, hint, mute, flash)

  if (onPhoto) {
    const shutter = make('button', 'ui-shutter', {type: 'button'})
    shutter.setAttribute('aria-label', TEXT.photo)
    shutter.addEventListener('click', onPhoto)
    root.append(shutter)
  }

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

  mute.addEventListener('click', () => {
    const muted = onToggleMute()
    mute.textContent = muted ? '🔇' : '🔊'
    mute.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute)
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

  let noticeTimer = null
  return {
    setLoading(done, total) {
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
