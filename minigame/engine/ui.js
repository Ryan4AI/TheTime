// UI Renderer - Canvas drawing utilities for TheTime mini game
// Aesthetic: 古风 (classical Chinese), warm ink-on-paper palette

// ─── 古风 Color Palette ───
// Inspired by classical Chinese painting and calligraphy
const COLORS = {
  // Backgrounds
  bg: '#0f0c08',           // 深墨色底
  bgGradient1: '#0f0c08',  // 上部
  bgGradient2: '#1a1410',  // 下部（烛光感）

  // Core palette
  ink: '#1a1410',          // 浓墨
  inkLight: '#2c241c',     // 淡墨
  paper: '#e8ddd0',        // 宣纸色（主文字）
  paperWarm: '#d4c8b8',    // 旧纸色（副文字）
  paperDim: '#a09080',     // 褪色文字
  paperDarker: '#706050',  // 更淡

  // Accents
  gold: '#c8a87c',         // 旧金
  goldLight: '#e0c8a0',    // 亮金（标题用）
  goldDark: '#a08050',     // 暗金
  vermillion: '#c83a2e',   // 朱砂红
  cinnabar: '#d4453a',     // 银朱（亮朱砂）
  jade: '#5a8a70',         // 玉色
  indigo: '#3a4a6a',       // 黛青

  // UI Elements
  border: 'rgba(200,168,124,0.25)',
  borderLight: 'rgba(200,168,124,0.12)',
  shadow: 'rgba(200,168,124,0.1)',
  glow: '#c8a87c',
  btnBg: 'rgba(200,168,124,0.06)',
  btnBgActive: 'rgba(200,168,124,0.12)',
}

// Font: Use system default Chinese font (guaranteed on all WeChat devices)
// PingFang SC (iOS) / Noto Sans SC (Android)
const FONT_FAMILY = '"PingFang SC", "Noto Sans SC", "STSong", "SimSun", "Noto Serif SC", sans-serif, serif'
// Custom font loaded via wx.loadFont() - set by game.js
var CUSTOM_FONT = null

// Set custom font family (called from game.js after wx.loadFont())
function setCustomFont(fontFamily) {
  CUSTOM_FONT = fontFamily
}

function getFontStack() {
  var stack = []
  if (CUSTOM_FONT) {
    stack.push(CUSTOM_FONT.indexOf(' ') >= 0 ? ('"' + CUSTOM_FONT + '"') : CUSTOM_FONT)
  }
  stack.push(FONT_FAMILY)
  // Emoji fallback — always last
  // This ensures emoji render through system font when Noto Serif SC doesn't have the glyph
  stack.push('sans-serif')
  return stack.join(', ')
}

function getSystemInfo() {
  const sys = wx.getSystemInfoSync()
  return {
    width: sys.windowWidth,
    height: sys.windowHeight,
    windowWidth: sys.windowWidth,
    windowHeight: sys.windowHeight,
    pixelRatio: sys.pixelRatio,
    safeArea: sys.safeArea || { top: 0, bottom: sys.windowHeight }
  }
}

// ─── Drawing Utilities ───

// Draw a rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Draw a classical circle (like a full moon) with subtle glow
function drawMoon(ctx, cx, cy, radius, color, opacity) {
  ctx.save()
  ctx.globalAlpha = opacity || 1

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 2.5)
  glow.addColorStop(0, `rgba(200,168,124,${(opacity || 1) * 0.12})`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 2.5, 0, Math.PI * 2)
  ctx.fill()

  // Main circle
  ctx.fillStyle = `rgba(232,221,208,${(opacity || 1) * 0.08})`
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Subtle ring
  ctx.strokeStyle = `rgba(200,168,124,${(opacity || 1) * 0.15})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

// Draw classical seal stamp (朱砂印章)
function drawSealStamp(ctx, x, y, size, text) {
  ctx.save()

  // Seal border (rectangle, slightly rounded in Chinese style)
  const w = size * 2.2
  const h = size * 1.6
  const bx = x - w / 2
  const by = y - h / 2

  // Seal body
  ctx.fillStyle = COLORS.vermillion
  ctx.globalAlpha = 0.85
  roundRect(ctx, bx, by, w, h, 3)
  ctx.fill()

  // Seal text
  if (text) {
    ctx.fillStyle = COLORS.paper
    ctx.globalAlpha = 0.9
    ctx.font = `normal ${Math.floor(size * 0.55)}px ${getFontStack()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  ctx.restore()
}

// Draw classical decorative horizontal line (like a divider)
function drawClassicalDivider(ctx, x, y, width, opacity) {
  ctx.save()
  ctx.globalAlpha = opacity || 0.3

  // Main line
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + width, y)
  ctx.stroke()

  // Decorative ends
  const dotSize = 2
  ctx.fillStyle = COLORS.gold
  ctx.beginPath()
  ctx.arc(x, y, dotSize, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + width, y, dotSize, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// Draw gradient background with warm ancient feel
function drawBackground(ctx, w, h) {
  // Main warm-dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, COLORS.bgGradient1)
  grad.addColorStop(0.6, COLORS.bgGradient2)
  grad.addColorStop(1, '#120c08')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

// Draw text - simplified for WeChat Mini Game compatibility
function drawText(ctx, text, x, y, opts) {
  if (!opts) opts = {}
  ctx.save()
  ctx.globalAlpha = opts.opacity != null ? opts.opacity : 1
  // Support bold via opts.bold = true
  var bold = opts.bold ? 'bold ' : ''
  ctx.font = bold + (opts.fontSize || 28) + 'px ' + getFontStack()
  ctx.textAlign = opts.align || 'center'
  ctx.textBaseline = opts.baseline || 'middle'
  ctx.fillStyle = opts.color || COLORS.paper
  
  var ls = opts.letterSpacing || 0
  if (ls > 0 && text.length > 1) {
    // Manual character spacing
    var totalW = 0
    var cw = []
    for (var i = 0; i < text.length; i++) {
      var w2 = ctx.measureText(text[i]).width
      cw.push(w2)
      totalW += w2 + ls
    }
    totalW -= ls
    var sx = ctx.textAlign === 'center' ? x - totalW / 2
           : ctx.textAlign === 'right' ? x - totalW
           : x
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text[i], sx + cw[i] / 2 + i * (cw[i] + ls), y)
    }
  } else {
    ctx.fillText(text, x, y)
  }
  ctx.restore()
}

// Draw a classical-style button
function drawButton(ctx, x, y, w, h, text, {
  fontSize = 28,
  opacity = 1,
  isActive = false,
} = {}) {
  ctx.save()
  ctx.globalAlpha = opacity

  // Background - very subtle dark wash
  const bg = isActive ? 'rgba(200,168,124,0.1)' : 'rgba(30,25,20,0.3)'
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, h, 2)
  ctx.fill()

  // Left accent bar (like seal stamp mark on scroll)
  const barColor = isActive ? COLORS.vermillion : 'rgba(200,168,124,0.3)'
  ctx.fillStyle = barColor
  ctx.fillRect(x, y, 2, h)

  // Right accent bar (matching)
  ctx.fillStyle = barColor
  ctx.fillRect(x + w - 2, y, 1, h)

  // Text
  drawText(ctx, text, x + w / 2, y + h / 2, {
    fontSize,
    color: isActive ? COLORS.goldLight : 'rgba(200,168,124,0.5)',
    align: 'center',
    baseline: 'middle',
  })
  ctx.restore()
}

function drawPrimaryButton(ctx, x, y, w, h, text, {
  fontSize = 28,
  opacity = 1,
  isActive = false,
} = {}) {
  ctx.save()
  ctx.globalAlpha = opacity

  // Background - slightly stronger than secondary
  const bg = isActive ? 'rgba(200,80,60,0.12)' : 'rgba(40,35,30,0.5)'
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, h, 2)
  ctx.fill()

  // Left accent bar - wider, gold (like seal stamp mark)
  const barColor = isActive ? COLORS.vermillion : COLORS.gold
  ctx.fillStyle = barColor
  ctx.fillRect(x, y, 3, h)

  // Right accent bar (matching)
  ctx.fillStyle = isActive ? 'rgba(200,80,60,0.2)' : 'rgba(200,168,124,0.15)'
  ctx.fillRect(x + w - 2, y, 2, h)

  // Text
  drawText(ctx, text, x + w / 2 + 2, y + h / 2, {
    fontSize,
    color: isActive ? COLORS.vermillion : COLORS.goldLight,
    align: 'center',
    baseline: 'middle',
  })

  // Subtle decorative dot below text
  ctx.fillStyle = isActive ? COLORS.vermillion : 'rgba(200,168,124,0.3)'
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h - 6, 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// Check if a point is inside a rectangle
function hitTest(tx, ty, x, y, w, h) {
  return tx >= x && tx <= x + w && ty >= y && ty <= y + h
}

// Draw text centered at (x, y) — 居中绘制
function drawCenteredText(ctx, text, x, y, fontSize, color) {
  if (!text) return
  ctx.save()
  ctx.font = (fontSize || 14) + 'px ' + getFontStack()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color || COLORS.paper
  ctx.fillText(String(text), x, y)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// Draw text inside a rectangle with auto-wrap on \n and word-wrap
// x, y 是左上角；maxW 文字宽度限制；lineHeight 行高；fontSize 字号
// 不真正实现按字拆词的复杂换行，遇到换行符 \n 才换行（保持单段长度可控）
function drawTextInRect(ctx, text, x, y, maxW, lineHeight, fontSize) {
  if (text == null) return
  ctx.save()
  ctx.font = (fontSize || 14) + 'px ' + getFontStack()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = COLORS.text || COLORS.paper
  // 按 \n 拆段
  const paragraphs = String(text).split('\n')
  let cy = y
  for (let p = 0; p < paragraphs.length; p++) {
    const line = paragraphs[p]
    if (line === '') {
      cy += lineHeight
      continue
    }
    // 简单按字符折行（中文按字符，英文按空格）
    let buf = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      const test = buf + ch
      const w = ctx.measureText(test).width
      if (w > maxW && buf.length > 0) {
        ctx.fillText(buf, x, cy)
        cy += lineHeight
        buf = ch
      } else {
        buf = test
      }
    }
    if (buf.length > 0) {
      ctx.fillText(buf, x, cy)
      cy += lineHeight
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
  return cy
}


// v0.6.65: 九边形雷达图（从game.js提取，供identity.js复用）
function drawRadarEdges(ctx, cx, cy, r, values) {
  var n = 9;
  var step = (Math.PI * 2) / n;
  var startAngle = -Math.PI / 2;
  var maxV = 10000;
  var innerR = r - 3;

  ctx.save();

  // 淡色背景九边形
  ctx.beginPath();
  for (var i = 0; i <= n; i++) {
    var a = startAngle + (i % n) * step;
    var x = cx + r * Math.cos(a);
    var y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,12,8,0.6)';
  ctx.fill();

  // 同心参考环（5等分）
  for (var lvl = 1; lvl <= 5; lvl++) {
    var lr = innerR * lvl / 5;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = startAngle + (i % n) * step;
      var x = cx + lr * Math.cos(a);
      var y = cy + lr * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = lvl === 5 ? 'rgba(200,168,124,0.3)' : 'rgba(200,168,124,0.08)';
    ctx.lineWidth = lvl === 5 ? 0.8 : 0.3;
    ctx.stroke();
  }

  // 三角形填充（每条边对应属性值）
  for (var i = 0; i < n; i++) {
    var v = values[i] || 0;
    var rv = (v / maxV) * innerR;
    if (rv < 0.5) continue;

    var a0 = startAngle + i * step;
    var a1 = startAngle + ((i + 1) % n) * step;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rv * Math.cos(a0), cy + rv * Math.sin(a0));
    ctx.lineTo(cx + rv * Math.cos(a1), cy + rv * Math.sin(a1));
    ctx.closePath();

    var intensity = 0.2 + (v / maxV) * 0.45;
    ctx.fillStyle = 'rgba(220,182,100,' + intensity + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,182,100,' + Math.min(intensity + 0.2, 0.6) + ')';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // 外缘九边形边框
  ctx.beginPath();
  for (var i = 0; i <= n; i++) {
    var a = startAngle + (i % n) * step;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(200,168,124,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 中心点
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(200,168,124,0.3)';
  ctx.fill();

  ctx.restore();
}

module.exports = {
  drawRadarEdges,
  COLORS,
  FONT_FAMILY, setCustomFont, getFontStack,
  getSystemInfo,
  roundRect,
  drawMoon,
  drawSealStamp,
  drawClassicalDivider,
  drawBackground,
  drawText,
  drawCenteredText,
  drawTextInRect,
  drawButton,
  drawPrimaryButton,
  hitTest,
}
