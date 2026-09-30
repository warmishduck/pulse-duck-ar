// A stand-in puzzle image, drawn with <canvas> instead of loaded from a file, so the puzzle can
// be built and tested before the museum's own 2D art exists. A creature's config.art (see
// content/creatures.js) can be a real image URL instead once one exists — see puzzle.js, which
// only asks this module for something to draw when config.art is missing.
//
// It is deliberately NOT just a flat colour: a sunburst of wedges and rings only lines up when a
// piece is both in its own slot and upright, and the label only reads correctly the same way, so
// the placeholder tests the actual puzzle mechanic (position AND rotation) rather than always
// looking "close enough".
export const makePlaceholderArt = (label, {width = 768, height = 512, hue = 120} = {}) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, `hsl(${hue}, 45%, 32%)`)
  bg.addColorStop(1, `hsl(${(hue + 40) % 360}, 45%, 16%)`)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2
  const maxR = Math.hypot(width, height)
  const wedges = 16
  for (let i = 0; i < wedges; i++) {
    const a0 = (i / wedges) * Math.PI * 2
    const a1 = ((i + 1) / wedges) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, maxR, a0, a1)
    ctx.closePath()
    ctx.fillStyle = i % 2 === 0 ? `hsla(${hue}, 70%, 60%, 0.35)` : `hsla(${hue}, 70%, 60%, 0.12)`
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 3
  for (let r = 60; r < maxR; r += 70) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // A "this side up" arrow near the top: makes a misrotated piece obvious on its own, without
  // needing to compare it against its neighbours.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.moveTo(width / 2, 16)
  ctx.lineTo(width / 2 - 22, 58)
  ctx.lineTo(width / 2 + 22, 58)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.round(height * 0.15)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 8
  ctx.fillText(label, width / 2, height / 2)

  return canvas
}
