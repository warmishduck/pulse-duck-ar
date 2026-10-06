// An on-screen readout for testing on a phone without a desktop inspector: add `debug` to the
// address (e.g. /?scan&debug). Shows named live values and any uncaught errors. Off otherwise.

const REFRESH_MS = 200

/**
 * @returns {{set: (key: string, value: *) => void} | null} null unless the address has `debug`.
 */
export const createDebugPanel = () => {
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return null
  }
  const panel = document.createElement('pre')
  panel.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;right:0;z-index:100;margin:0;' +
    'padding:6px 8px;background:rgba(0,0,0,0.7);color:#9f9;font:11px/1.35 ui-monospace,Menlo,monospace;' +
    'white-space:pre-wrap;pointer-events:none'
  document.body.appendChild(panel)

  const values = new Map()
  const errors = []
  const onError = (message) => {
    errors.push(String(message).slice(0, 300))
    errors.splice(0, errors.length - 3)
  }
  window.addEventListener('error', (e) => onError(e.message))
  window.addEventListener('unhandledrejection', (e) => onError(e.reason?.stack || e.reason))

  const format = (value) => {
    if (value && typeof value.x === 'number') {
      return [value.x, value.y, value.z].map((n) => n?.toFixed(2)).join(', ')
    }
    return typeof value === 'number' ? value.toFixed(2) : String(value)
  }
  setInterval(() => {
    const lines = [...values].map(([key, value]) => `${key}: ${format(value)}`)
    panel.textContent = [...lines, ...errors.map((e) => `ERROR ${e}`)].join('\n')
  }, REFRESH_MS)

  return {set: (key, value) => values.set(key, value)}
}
