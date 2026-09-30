// The staff bypass's password. This is a static site with no server, so anyone can read this
// constant straight out of the shipped source — it is not real security. Its only job is to stop
// a visitor who is idly fiddling with `?staff=1` in the address bar from skipping a puzzle by
// accident; a museum staff member is told the password separately (not written here for anyone
// browsing the source to find — change it to something you've agreed with them, and tell them
// only in person or by a channel this repo doesn't show).
//
// To change it: edit the line below, commit, deploy. Nothing else needs to know.
export const STAFF_PASSWORD = 'sarka-staff'

const SESSION_KEY = 'lumina-staff-ok'

// True once this browser tab has entered the password correctly this visit, so staff doing a
// round of the museum aren't asked again at every exhibit.
export const staffUnlocked = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch (e) {
    return false
  }
}

export const rememberStaffUnlocked = () => {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch (e) {
    // Not remembered this time; they'll just be asked again next puzzle.
  }
}
