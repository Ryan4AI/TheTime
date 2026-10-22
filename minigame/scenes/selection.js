// Selection scene — 选随身之物
// 30抽10 → 可选0~3件带入穿越
// 卡片内含图标+名称+描述三行居中

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, hitTest, roundRect } = ui
const { CharAnim, SlideFadeAnim, FadeAnim } = require('../engine/anim')
const { drawItems } = require('../data/items')

var drawnItems = []
var selected = {}
var selectionCount = 0
var layout = {}
var anims = null

var TITLE = '挑选三件随身之物'
var SUB = '可选 0~3 件, 剩下的看天命'
var CELEB_HINT = ''
var genderPref = null

// 性别选项
var GENDER_OPTIONS = [
  { label: '随机性别', value: null },
  { label: '男性', value: '男' },
  { label: '女性', value: '女' },
]

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  var titleS = Math.min(20, Math.floor(w * 0.052))
  var titleY = Math.floor(h * 0.10)
  var subS = Math.min(11, Math.floor(w * 0.028))

  // Cards
  var gap = Math.max(12, Math.floor(w * 0.030))
  var cardW = Math.floor((w - gap * 3) / 2)
  var vGap = 12

  // Confirm button / gender row (geometry fixed, y computed below)
  var btnW = Math.min(140, Math.floor(w * 0.37))
  var btnH = 36
  // Gender selector — three self-explanatory buttons
  var genderPillW = 64
  var genderPillGap = 12
  var genderRowH = 32
  var genderTotalW = genderPillW * 3 + genderPillGap * 2
  var genderBarX = gap
  var genderGapTop = 16 // 网格 → 性别条
  var genderGapBtn = 24 // 性别条 → 按钮
  // 2026-10-22 P-192: 短屏自适应。旧实现 cardH 固定 68~78 → 320x480 五排卡片撑到 494，
  // 后面的两级 fallback 只能硬塞 → 性别条跑出屏(510)、按钮压进网格(444)。改为自下而上分配可用高。
  var bottomReserve = h >= 560 ? 36 : 22 // 按钮下方：已选计数(+14)、彩蛋提示(+30)
  var cardMinH = 50
  var cardMaxH = 78

  function fitCardH(topY, gapV) {
    var avail = h - bottomReserve - btnH - genderGapBtn - genderRowH - genderGapTop - topY
    return Math.floor((avail - gapV * 4) / 5)
  }

  var gridTop = Math.floor(titleY + titleS + 22 + subS + 12)
  var cardH = fitCardH(gridTop, vGap)
  if (cardH < cardMinH) {
    // 极短屏（h<560）：压缩标题区（22→12、12→8）并收紧卡片行距，把位置让给卡片
    titleY = Math.max(12, Math.floor(h * 0.05))
    gridTop = Math.floor(titleY + titleS + 12 + subS + 8)
    vGap = 8
    cardH = fitCardH(gridTop, vGap)
  }
  cardH = Math.max(cardMinH, Math.min(cardMaxH, cardH))

  var cardBottom = gridTop + (cardH + vGap) * 5 - vGap
  var genderOptY = cardBottom + genderGapTop
  var btnY = genderOptY + genderRowH + genderGapBtn
  if (btnY + btnH + bottomReserve > h) { // 兜底：卡片已到最小高仍溢出（超短屏）
    btnY = h - bottomReserve - btnH
    genderOptY = Math.max(cardBottom + 8, btnY - genderGapBtn - genderRowH)
  }

  layout = {
    w: w, h: h, cx: cx,
    titleS: titleS, titleY: titleY, subS: subS,
    cardW: cardW, cardH: cardH, vGap: vGap,
    gap: gap,
    gridX1: gap, gridX2: gap * 2 + cardW,
    gridTop: gridTop,
    btnW: btnW, btnH: btnH, btnY: btnY,
    genderOptY: genderOptY, genderRowH: genderRowH,
    genderPillW: genderPillW, genderPillGap: genderPillGap,
    showHint: h >= 560,
  }

  layout.cards = []
  for (var i = 0; i < 10; i++) {
    layout.cards.push({
      x: i % 2 === 0 ? gap : gap * 2 + cardW,
      y: gridTop + Math.floor(i / 2) * (cardH + vGap),
    })
  }
}

function init() {
  drawnItems = drawItems(10)
  selected = {}
  selectionCount = 0
  genderPref = null
  calcLayout()
  var now = Date.now()

  anims = {
    title: new CharAnim(TITLE, 60, 400),
    subtitle: new SlideFadeAnim(4, 150, 500),
    cards: [],
    confirmBtn: new FadeAnim(200, 400),
  }
  anims.title.start(now)
  anims.subtitle.start(now)
  anims.confirmBtn.start(now)

  for (var i = 0; i < 10; i++) {
    var a = new SlideFadeAnim(8, 180 + i * 35, 400)
    a.start(now)
    anims.cards.push(a)
  }
}

function onTouch(x, y, type) {
  if (type !== 'end') return null

  for (var i = 0; i < layout.cards.length; i++) {
    var c = layout.cards[i]
    if (hitTest(x, y, c.x, c.y, layout.cardW, layout.cardH)) {
      var item = drawnItems[i]
      if (selected[item.id]) {
        delete selected[item.id]
        selectionCount--
      } else if (selectionCount < 3) {
        selected[item.id] = true
        selectionCount++
      }
      return null
    }
  }

  var l = layout
  var btnX = Math.floor(l.cx - l.btnW / 2)

  // Gender selection taps — three evenly-spaced pills
  var genderPillTotal = l.genderPillW * 3 + l.genderPillGap * 2
  var genderPillStartX = Math.floor(l.cx - genderPillTotal / 2)
  for (var gi = 0; gi < GENDER_OPTIONS.length; gi++) {
    var gx = genderPillStartX + gi * (l.genderPillW + l.genderPillGap)
    if (hitTest(x, y, gx, l.genderOptY, l.genderPillW, l.genderRowH)) {
      genderPref = GENDER_OPTIONS[gi].value
      return null
    }
  }

  if (hitTest(x, y, btnX, l.btnY, l.btnW, l.btnH)) {
    var chosenItems = drawnItems.filter(function(it) { return selected[it.id] })
    // 直接进穿越特效，云函数在intro里异步调用
    return { scene: 'intro', items: chosenItems, gender: genderPref }
  }

  return null
}

function renderCard(ctx, item, card, index) {
  var l = layout
  var isSel = selected[item.id]
  var a = anims.cards[index] ? anims.cards[index].update(Date.now()) : { opacity: 1, y: 0 }
  if (a.opacity <= 0) return

  ctx.save()
  ctx.globalAlpha = a.opacity

  var cx = card.x + a.y
  var cy = card.y
  var cardCX = cx + l.cardW / 2
  var cardCY = cy + l.cardH / 2

  // Card bg
  roundRect(ctx, cx, cy, l.cardW, l.cardH, 4)
  if (isSel) {
    ctx.fillStyle = 'rgba(200,168,124,0.08)'
    ctx.fill()
    ctx.fillStyle = COLORS.gold
    ctx.fillRect(cx, cy, l.cardW, 1)
  } else {
    ctx.fillStyle = 'rgba(30,25,20,0.15)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,0.06)'
    ctx.lineWidth = 0.5
    roundRect(ctx, cx, cy, l.cardW, l.cardH, 4)
    ctx.stroke()
  }

  // Icon（系统字体渲染emoji）+ Name 并排
  var iconS = l.cardH * 0.28
  ctx.save()
  ctx.font = Math.floor(iconS) + 'px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = isSel ? COLORS.goldLight : COLORS.paper
  ctx.fillText(item.icon, cardCX - 18, cy + Math.floor(l.cardH * 0.38))
  ctx.restore()

  drawText(ctx, item.name, cardCX + 16, cy + Math.floor(l.cardH * 0.38), {
    fontSize: Math.floor(l.cardH * 0.17),
    align: 'center', baseline: 'middle',
    color: isSel ? COLORS.goldLight : COLORS.paper,
  })

  // Description
  drawText(ctx, item.desc, cardCX, cy + Math.floor(l.cardH * 0.66), {
    fontSize: Math.floor(l.cardH * 0.14),
    align: 'center', baseline: 'middle',
    color: isSel ? 'rgba(200,168,124,0.55)' : 'rgba(200,168,124,0.35)',
  })

  // Selection dot
  if (isSel) {
    ctx.fillStyle = COLORS.vermillion
    ctx.beginPath()
    ctx.arc(cx + l.cardW - 9, cy + 9, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function render(ctx) {
  var l = layout
  var now = Date.now()

  drawBackground(ctx, l.w, l.h)

  // Title
  for (var i = 0; i < TITLE.length; i++) {
    var op = anims.title.getCharOpacity(now, i)
    if (op <= 0) continue
    drawText(ctx, TITLE[i], l.cx - ((TITLE.length - 1) * 36) / 2 + i * 36, l.titleY, {
      fontSize: l.titleS, color: COLORS.goldLight, opacity: op, bold: true,
    })
  }

  // Subtitle
  var sub = anims.subtitle.update(now)
  if (sub.opacity > 0) {
    drawText(ctx, SUB, l.cx, l.titleY + l.titleS + 12 + sub.y, {
      fontSize: l.subS, color: COLORS.paperDarker, opacity: sub.opacity * 0.45,
    })
  }

  // Cards
  for (var i = 0; i < drawnItems.length; i++) {
    renderCard(ctx, drawnItems[i], l.cards[i], i)
  }

  // Gender selector — 三个自描述按钮
  var genderTotalW = l.genderPillW * 3 + l.genderPillGap * 2
  var genderPillStartX = Math.floor(l.cx - genderTotalW / 2)
  var genderOptY = l.genderOptY

  for (var gi = 0; gi < GENDER_OPTIONS.length; gi++) {
    var opt = GENDER_OPTIONS[gi]
    var isActive = genderPref === opt.value
    var gx = genderPillStartX + gi * (l.genderPillW + l.genderPillGap)

    ctx.save()
    roundRect(ctx, gx, genderOptY, l.genderPillW, l.genderRowH, 8)
    if (isActive) {
      ctx.fillStyle = 'rgba(200,168,124,0.10)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(200,168,124,0.3)'
      ctx.lineWidth = 0.5
      roundRect(ctx, gx, genderOptY, l.genderPillW, l.genderRowH, 8)
      ctx.stroke()
    } else {
      ctx.strokeStyle = 'rgba(200,168,124,0.08)'
      ctx.lineWidth = 0.5
      roundRect(ctx, gx, genderOptY, l.genderPillW, l.genderRowH, 8)
      ctx.stroke()
    }
    ctx.restore()

    drawText(ctx, opt.label, gx + l.genderPillW / 2, genderOptY + l.genderRowH / 2, {
      fontSize: Math.min(13, l.w * 0.034),
      color: isActive ? COLORS.goldLight : 'rgba(200,168,124,0.3)',
      align: 'center', baseline: 'middle',
      bold: isActive,
    })
  }

  // Confirm button
  var btnOp = anims.confirmBtn.update(now)
  if (btnOp > 0) {
    ctx.save()
    ctx.globalAlpha = btnOp

    var btnX = Math.floor(l.cx - l.btnW / 2)
    var descText = selectionCount > 0
      ? '已选 ' + selectionCount + ' / 3 件'
      : '空手上路'

    roundRect(ctx, btnX, l.btnY, l.btnW, l.btnH, 18)
    ctx.fillStyle = 'rgba(200,168,124,0.06)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,0.15)'
    ctx.lineWidth = 0.5
    roundRect(ctx, btnX, l.btnY, l.btnW, l.btnH, 18)
    ctx.stroke()

    drawText(ctx, '确认启程', l.cx, l.btnY + l.btnH / 2, {
      fontSize: Math.min(14, l.w * 0.036),
      color: selectionCount > 0 ? COLORS.goldLight : 'rgba(200,168,124,0.4)',
      align: 'center', baseline: 'middle',
    })

    drawText(ctx, descText, l.cx, l.btnY + l.btnH + 14, {
      fontSize: Math.min(10, l.w * 0.026),
      color: 'rgba(200,168,124,0.2)',
      align: 'center', baseline: 'middle',
    })

    // 名人彩蛋提示（短屏 h<560 不画：底部只留 22px，画了会出屏）
    if (l.showHint) {
      drawText(ctx, CELEB_HINT, l.cx, l.btnY + l.btnH + 30, {
        fontSize: Math.min(9, l.w * 0.023),
        color: 'rgba(200,168,124,0.35)',
        align: 'center', baseline: 'middle',
      })
    }

    ctx.restore()
  }
}

module.exports = { init, render, onTouch, _calcLayout: calcLayout, _getLayout: function () { return layout } }

