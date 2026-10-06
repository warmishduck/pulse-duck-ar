// Decides what the page shows from its address. Pure (no DOM), so it can be tested in Node.
//   /?c=03      -> the exhibit with that code
//   /           -> the welcome page
//   /?c=nope    -> the welcome page, saying the code was not recognised

import {EXHIBITS} from './content/exhibits.js'

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/

// `search` is the address's query string (`location.search`). Returns
//   {kind: 'exhibit', code, exhibit}   or   {kind: 'welcome', unknownCode: boolean}
export const resolveRoute = (search, exhibits = EXHIBITS) => {
  const raw = new URLSearchParams(search).get('c')
  if (raw === null || raw.trim() === '') {
    return {kind: 'welcome', unknownCode: false}
  }
  const code = raw.trim().toLowerCase()
  // hasOwn: a code like "constructor" must not find something on the object's prototype.
  if (CODE_PATTERN.test(code) && Object.hasOwn(exhibits, code)) {
    return {kind: 'exhibit', code, exhibit: exhibits[code]}
  }
  return {kind: 'welcome', unknownCode: true}
}

// Maps an image-target name (from reality.imagefound) to the matching exhibit.
// Returns {code, exhibit} or null if not found.
export const routeFromImageTarget = (targetName, exhibits = EXHIBITS) => {
  const entry = Object.entries(exhibits).find(([, ex]) => ex.imageTarget === targetName)
  if (!entry) {
    return null
  }
  const [code, exhibit] = entry
  return {code, exhibit}
}
