// Death scene — 此生已终
// 展示本世总结 + 墓志铭 + 下一世按钮

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, drawButton, hitTest, roundRect } = ui
const { FadeAnim, SlideFadeAnim } = require('../engine/anim')

var layout = {}
var anims = {}
var deathState = null
var ready = false

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  var cardW = Math.floor(w * 0.85)
  var cardH = Math.floor(h * 0.75)
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.12)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    titleY: cardY + 40,
    nameY: cardY + 90,
    statsY: cardY + 140,
    epitaphY: cardY + cardH * 0.55,
    btnY: cardY + cardH - 80,
    btnW: Math.min(180, Math.floor(w * 0.45)),
    btnH: 44,
  }
}

function init(items, identity, gender) {
  calcLayout()
  deathState = identity || {}
  ready = false

  var now = Date.now()
  anims = {
    card: new FadeAnim(200, 600),
    title: new FadeAnim(400, 500),
    name: new FadeAnim(600, 500),
    stats: new FadeAnim(800, 600),
    epitaph: new FadeAnim(1100, 600),
    btn: new SlideFadeAnim(8, 400, 1400),
  }
  for (var k in anims) anims[k].start(now)

  setTimeout(function() { ready = true }, 1800)
}

function onTouch(x, y, type) {
  if (type !== 'end') return null
  if (!ready) return null

  var l = layout
  var btnX = Math.floor(l.cx - l.btnW / 2)
  if (hitTest(x, y, btnX, l.btnY, l.btnW, l.btnH)) {
    // 存储轮回数据（下一世继承）
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync('rebirth', {
        life_number: (deathState.life_number || 1) + 1,
        historical_shelter: (deathState.historical_shelter || 0) + 1,
        legacy: deathState.epitaph || '',
      })
    }
    // 返回入口页，开始新一世
    return { scene: 'entry' }
  }
  return null
}

function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 背景
  drawBackground(ctx, w, h)

  // 卡片
  var cardOp = anims.card.update(now)
  if (cardOp <= 0) return

  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 6

  ctx.fillStyle = 'rgba(30,25,20,0.92)'
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 8)
  ctx.fill()
  ctx.restore()

  // 卡片边框
  ctx.save()
  ctx.globalAlpha = cardOp * 0.3
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 1
  roundRect(ctx, l.cardX + 2, l.cardY + 2, l.cardW - 4, l.cardH - 4, 6)
  ctx.stroke()
  ctx.restore()

  // 标题
  var tOp = anims.title.update(now)
  if (tOp > 0) {
    drawText(ctx, '— 此生已终 —', cx, l.titleY, {
      fontSize: 20,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: tOp * 0.9,
    })
  }

  // 姓名 + 第几世
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    var name = deathState.name || '无名'
    var age = deathState.age != null ? deathState.age : '?'
    var lifeNum = deathState.life_number || 1
    drawText(ctx, name + ' · ' + age + '岁 · 第' + lifeNum + '世', cx, l.nameY, {
      fontSize: 16,
      color: COLORS.paper,
      align: 'center', baseline: 'middle',
      opacity: nOp * 0.85,
    })
  }

  // 统计
  var sOp = anims.stats.update(now)
  if (sOp > 0) {
    var attrs = [
      { name: '声望', val: deathState['声望'] || 0 },
      { name: '财富', val: deathState['财富'] || 0 },
      { name: '学识', val: deathState['学识'] || 0 },
      { name: '颜值', val: deathState['颜值'] || 0 },
      { name: '医术', val: deathState['医术'] || 0 },
      { name: '战功', val: deathState['战功'] || 0 },
      { name: '文采', val: deathState['文采'] || 0 },
      { name: '政绩', val: deathState['政绩'] || 0 },
      { name: '义行', val: deathState['义行'] || 0 },
    ]

    // 计算综合属性
    var total = 0
    for (var i = 0; i < attrs.length; i++) total += attrs[i].val
    var avg = Math.floor(total / attrs.length)

    // 属性展示（3列布局）
    var colW = Math.floor((l.cardW - 60) / 3)
    var rowH = 24
    for (var ai = 0; ai < attrs.length; ai++) {
      var col = ai % 3
      var row = Math.floor(ai / 3)
      var ax = l.cardX + 30 + col * colW
      var ay = l.statsY + row * rowH

      drawText(ctx, attrs[ai].name + ': ' + attrs[ai].val, ax, ay, {
        fontSize: 12,
        color: COLORS.paperWarm,
        align: 'left', baseline: 'middle',
        opacity: sOp * 0.75,
      })
    }

    // 综合属性
    var summaryY = l.statsY + 3 * rowH + 12
    drawText(ctx, '综合属性: ' + avg, l.cardX + 30, summaryY, {
      fontSize: 13,
      color: COLORS.gold,
      align: 'left', baseline: 'middle',
      opacity: sOp * 0.9,
    })

    // 历史庇护
    var shelter = deathState['历史庇护'] || 0
    drawText(ctx, '历史庇护: ' + shelter + '层', l.cardX + 30, summaryY + 26, {
      fontSize: 13,
      color: COLORS.gold,
      align: 'left', baseline: 'middle',
      opacity: sOp * 0.9,
    })
    if (deathState.deathReason) {
      drawText(ctx, '死因: 「' + deathState.deathReason + '」归零', l.cardX + 30 + Math.floor(colW * 3 / 2), summaryY + 26, {
        fontSize: 12,
        color: '#c04040',
        align: 'center', baseline: 'middle',
        opacity: sOp * 0.8,
      })
    }
  }

  // 墓志铭
  var eOp = anims.epitaph.update(now)
  if (eOp > 0) {
    var epitaph = deathState.epitaph || '你的一生，如风中残烛，悄然熄灭。'
    drawText(ctx, epitaph, cx, l.epitaphY, {
      fontSize: 13,
      color: COLORS.paper,
      align: 'center', baseline: 'middle',
      opacity: eOp * 0.7,
      maxWidth: l.cardW - 60,
    })
  }

  // 按钮
  var bOp = anims.btn.update(now)
  if (bOp > 0) {
    var btnX = Math.floor(cx - l.btnW / 2)
    ctx.save()
    ctx.globalAlpha = bOp
    drawButton(ctx, btnX, l.btnY, l.btnW, l.btnH, '再入轮回', {
      fontSize: 15,
      opacity: bOp,
    })
    ctx.restore()
  }
}

module.exports = { init: init, render: render, onTouch: onTouch, autoNext: null }
