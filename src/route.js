// Decides what the page shows from its address. Pure (no DOM), so it can be tested in Node.
//   /?c=03      -> the exhibit with that code
//   /?scan      -> the camera, looking for an exhibit object (image targets)
//   /           -> the welcome page
//   /?c=nope    -> the welcome page, saying the code was not recognised

import {EXHIBITS} from './content/exhibits.js'

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * @typedef {import('./content/exhibits.js').Exhibit} Exhibit
 * @typedef {{kind: 'exhibit', code: string, exhibit: Exhibit}
 *   | {kind: 'scan'}
 *   | {kind: 'welcome', unknownCode: boolean}} Route
 */

/**
 * Picks the page to show from the address. An exhibit code wins over `scan`.
 *
 * @param {string} search - The address's query string (`location.search`).
 * @param {Object<string, Exhibit>} [exhibits] - Override the registry (tests).
 * @returns {Route}
 */
export const resolveRoute = (search, exhibits = EXHIBITS) => {
  const params = new URLSearchParams(search)
  const raw = params.get('c')
  if (raw === null || raw.trim() === '') {
    return params.has('scan') ? {kind: 'scan'} : {kind: 'welcome', unknownCode: false}
  }
  const code = raw.trim().toLowerCase()
  // hasOwn: a code like "constructor" must not find something on the object's prototype.
  if (CODE_PATTERN.test(code) && Object.hasOwn(exhibits, code)) {
    return {kind: 'exhibit', code, exhibit: exhibits[code]}
  }
  return {kind: 'welcome', unknownCode: true}
}

/**
 * Finds the exhibit whose `imageTarget` matches a detected target.
 *
 * @param {string} targetName - `detail.name` from the `reality.imagefound` event.
 * @param {Object<string, Exhibit>} [exhibits] - Override the registry (tests).
 * @returns {{code: string, exhibit: Exhibit} | null}
 */
export const routeFromImageTarget = (targetName, exhibits = EXHIBITS) => {
  if (!targetName) {
    return null
  }
  const entry = Object.entries(exhibits).find(([, ex]) => ex.imageTarget === targetName)
  if (!entry) {
    return null
  }
  const [code, exhibit] = entry
  return {code, exhibit}
}
