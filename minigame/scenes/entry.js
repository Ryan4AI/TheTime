// Entry scene — 穿越日记 · 古风入口
// 中国水墨画风格：留白、写意、含蓄
// 月亮高悬冷光、墨山层叠、题诗式标题

const ui = require('../engine/ui')
const {
  COLORS, getSystemInfo, drawBackground,
  drawText, drawButton, drawPrimaryButton, hitTest
} = ui
const { CharAnim, SlideFadeAnim, FadeAnim } = require('../engine/anim')

const TITLE = '穿越日记'
const SUBTITLE = '留名青史，或无名而亡'
const BTN_START = '踏入长河'
const BTN_LEADERBOARD = '青史榜'
const FOOTER = 'AI演绎 · 历史真实数据'

let layout = {}
let anims = null

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // Moon: high up, cold blue-white
  var moonR = Math.floor(Math.min(w * 0.22, h * 0.15))
  var moonY = Math.floor(h * 0.12 + moonR)

  // Mountains: subtle ink wash at bottom
  var mtY = Math.floor(h * 0.72)
  var mtH = Math.floor(h * 0.28)

  // Title: poem inscription style, small and elegant
  var titleS = Math.min(42, Math.floor(w * 0.10))
  var titleY = Math.floor(h * 0.32)
  var titleAreaW = Math.floor(Math.min(w * 0.65, titleS * 5.5))
  var charSpacing = Math.floor(titleAreaW / TITLE.length)
  var titleStartX = Math.floor(cx - (TITLE.length - 1) * charSpacing / 2)

  // Subtitle
  var subS = Math.min(14, Math.floor(w * 0.037))
  var subY = Math.floor(titleY + titleS * 0.55 + 18)

  // Decorative line
  var divW = Math.min(60, Math.floor(w * 0.16))
  var divY = Math.floor(subY + 18)

  // Buttons
  var btnW = Math.min(200, Math.floor(w * 0.52))
  var btnH = Math.min(64, Math.floor(w * 0.17))
  var btnS = Math.min(18, Math.floor(w * 0.048))
  var btnX = Math.floor(cx - btnW / 2)
  var btnY1 = Math.floor(h * 0.64)
  var btnY2 = Math.floor(btnY1 + btnH + 10)

  // Footer
  var footerS = Math.min(10, Math.floor(w * 0.028))
  var footerY = Math.floor(h - 36)

  layout = {
    w: w, h: h, cx: cx,
    moonR: moonR, moonY: moonY,
    mtY: mtY, mtH: mtH,
    titleS: titleS, titleY: titleY,
    charSpacing: charSpacing, titleStartX: titleStartX,
    subS: subS, subY: subY,
    divW: divW, divY: divY,
    btnW: btnW, btnH: btnH, btnS: btnS,
    btnX: btnX, btnY1: btnY1, btnY2: btnY2,
    footerS: footerS, footerY: footerY,
  }
}

function init() {
  calcLayout()
  var now = Date.now()

  anims = {
    moon: new FadeAnim(200, 1500),
    mountains: new FadeAnim(400, 1200),
    title: new CharAnim(TITLE, 100, 500),
    subtitle: new SlideFadeAnim(6, 300, 600),
    divider: new SlideFadeAnim(1, 400, 900),
    btnStart: new SlideFadeAnim(8, 400, 1000),
    btnLeaderboard: new SlideFadeAnim(8, 300, 1200),
    footer: new SlideFadeAnim(3, 200, 1400),
  }

  for (var key in anims) anims[key].start(now)
}

// ─── Ink wash mountain range ───
function drawMountains(ctx) {
  var w = layout.w
  var h = layout.h
  var baseY = layout.mtY
  var mtH = layout.mtH
  var op = anims.mountains.update(Date.now())
  if (op <= 0) return

  ctx.save()
  ctx.globalAlpha = op

  // Ink wash gradient
  var grad = ctx.createLinearGradient(0, baseY, 0, h)
  grad.addColorStop(0, 'rgba(200,168,124,0)')
  grad.addColorStop(0.15, 'rgba(200,168,124,0.02)')
  grad.addColorStop(0.5, 'rgba(200,168,124,0.04)')
  grad.addColorStop(1, 'rgba(200,168,124,0.06)')
  ctx.fillStyle = grad
  ctx.fillRect(0, baseY, w, mtH)

  // Back mountains — lighter, softer
  ctx.fillStyle = 'rgba(200,168,124,0.02)'
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.quadraticCurveTo(w * 0.12, baseY - mtH * 0.55, w * 0.25, baseY - mtH * 0.35)
  ctx.quadraticCurveTo(w * 0.38, baseY - mtH * 0.7, w * 0.5, baseY - mtH * 0.25)
  ctx.quadraticCurveTo(w * 0.62, baseY - mtH * 0.5, w * 0.75, baseY - mtH * 0.3)
  ctx.quadraticCurveTo(w * 0.88, baseY - mtH * 0.45, w, baseY - mtH * 0.28)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  // Front mountains — more defined
  ctx.fillStyle = 'rgba(200,168,124,0.035)'
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.quadraticCurveTo(w * 0.1, baseY - mtH * 0.2, w * 0.2, baseY + mtH * 0.05)
  ctx.quadraticCurveTo(w * 0.3, baseY - mtH * 0.35, w * 0.4, baseY - mtH * 0.12)
  ctx.quadraticCurveTo(w * 0.48, baseY - mtH * 0.45, w * 0.55, baseY - mtH * 0.08)
  ctx.quadraticCurveTo(w * 0.6, baseY - mtH * 0.3, w * 0.68, baseY)
  ctx.quadraticCurveTo(w * 0.75, baseY - mtH * 0.2, w * 0.82, baseY - mtH * 0.05)
  ctx.quadraticCurveTo(w * 0.9, baseY - mtH * 0.25, w, baseY - mtH * 0.1)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ─── Moon glow — cold/blue-tinted, dim ───
function drawMoon(ctx) {
  var l = layout
  var cx = l.cx
  var op = anims.moon.update(Date.now())
  if (op <= 0) return

  ctx.save()
  ctx.globalAlpha = op

  // Outer glow
  var grad = ctx.createRadialGradient(cx, l.moonY, 0, cx, l.moonY, l.moonR * 1.5)
  grad.addColorStop(0, 'rgba(180,195,210,' + (0.10 * op) + ')')
  grad.addColorStop(0.5, 'rgba(180,195,210,' + (0.04 * op) + ')')
  grad.addColorStop(1, 'rgba(180,195,210,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, l.moonY, l.moonR * 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Moon disc
  ctx.fillStyle = 'rgba(210,220,230,' + (0.35 * op) + ')'
  ctx.beginPath()
  ctx.arc(cx, l.moonY, l.moonR, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ─── Subtle cloud wisps ───
function drawClouds(ctx) {
  var w = layout.w
  var now = Date.now()
  ctx.save()

  var cloudY = Math.floor(layout.moonY + layout.moonR * 0.3)
  var baseOp = 0.04

  var offsets = [{ x: 0.1, s: 0.15 }, { x: 0.45, s: 0.12 }, { x: 0.75, s: 0.1 }]
  for (var i = 0; i < offsets.length; i++) {
    var drift = (now * 0.00003 + i * 2000) % 80 - 40
    var x = w * offsets[i].x + drift
    var size = w * offsets[i].s

    ctx.fillStyle = 'rgba(180,195,210,' + baseOp + ')'
    ctx.beginPath()
    ctx.ellipse(x, cloudY + i * 15, size, size * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

// ─── Decorative traditional corner ───
function drawCornerDecoration(ctx) {
  var w = layout.w
  var h = layout.h
  var op = anims.subtitle.update(Date.now()).opacity
  ctx.save()
  ctx.globalAlpha = op * 0.15

  var m = 12
  var len = 18
  var gap = 4

  ctx.strokeStyle = COLORS.goldLight
  ctx.lineWidth = 1
  ;[[m + gap, m], [w - m - gap, m], [w - m - gap, h - m], [m + gap, h - m]].forEach(function(p, idx) {
    ctx.beginPath()
    if (idx < 2) {
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(p[0], p[1] + gap)
      ctx.lineTo(p[0] + (idx === 0 ? -gap : gap), p[1] + gap)
    } else {
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(p[0], p[1] - gap)
      ctx.lineTo(p[0] + (idx === 3 ? -gap : gap), p[1] - gap)
    }
    ctx.stroke()
  })

  ctx.restore()
}

// ─── Render ───
function render(ctx) {
  var w = layout.w
  var h = layout.h
  var cx = layout.cx
  var now = Date.now()
  var l = layout

  // 1. Background
  drawBackground(ctx, w, h)

  // 2. Moon
  drawMoon(ctx)

  // 3. Clouds
  drawClouds(ctx)

  // 4. Mountains
  drawMountains(ctx)

  // 5. Corner decorations
  drawCornerDecoration(ctx)

  // 6. Title
  for (var i = 0; i < TITLE.length; i++) {
    var op = anims.title.getCharOpacity(now, i)
    if (op <= 0) continue
    var chx = l.titleStartX + i * l.charSpacing

    ctx.save()
    if (op > 0.3) {
      ctx.shadowColor = 'rgba(220,180,130,' + ((op - 0.3) * 0.15) + ')'
      ctx.shadowBlur = 10
    }
    drawText(ctx, TITLE[i], chx, l.titleY, {
      fontSize: l.titleS,
      color: COLORS.goldLight,
      opacity: Math.min(1, op * 1.1),
      bold: true,
    })
    ctx.restore()
  }

  // 7. Subtitle
  var s2 = anims.subtitle.update(now)
  if (s2.opacity > 0) {
    drawText(ctx, SUBTITLE, cx, l.subY + s2.y, {
      fontSize: l.subS,
      color: COLORS.paperDim,
      opacity: s2.opacity * 0.75,
    })
  }

  // 8. Decorative line
  var d = anims.divider.update(now)
  if (d.opacity > 0) {
    ctx.save()
    ctx.globalAlpha = 0.2 * d.opacity
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(cx - l.divW / 2, l.divY + d.y)
    ctx.lineTo(cx + l.divW / 2, l.divY + d.y)
    ctx.stroke()
    ctx.restore()
  }

  // 9. Buttons
  var b1 = anims.btnStart.update(now)
  var b2 = anims.btnLeaderboard.update(now)
  if (b1.opacity > 0) {
    drawPrimaryButton(ctx, l.btnX, l.btnY1 + b1.y, l.btnW, l.btnH, BTN_START,
      { fontSize: l.btnS, opacity: b1.opacity })
  }
  if (b2.opacity > 0) {
    drawButton(ctx, l.btnX, l.btnY2 + b2.y, l.btnW, l.btnH, BTN_LEADERBOARD,
      { fontSize: l.btnS, opacity: b2.opacity })
  }

  // 10. Footer
  var f = anims.footer.update(now)
  if (f.opacity > 0) {
    drawText(ctx, FOOTER, cx, l.footerY + f.y, {
      fontSize: l.footerS,
      color: COLORS.paperDarker,
      opacity: f.opacity * 0.4,
    })
  }
}

// ─── Touch ───
function onTouch(x, y, type) {
  if (type === 'end') {
    if (hitTest(x, y, layout.btnX, layout.btnY1, layout.btnW, layout.btnH)) {
      return { scene: 'selection' }
    }
    if (hitTest(x, y, layout.btnX, layout.btnY2, layout.btnW, layout.btnH)) {
      return { scene: 'leaderboard' }
    }
  }
  return null
}

module.exports = { init: init, render: render, onTouch: onTouch }
