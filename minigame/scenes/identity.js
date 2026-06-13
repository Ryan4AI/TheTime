// Identity scene — 你的身份
// 穿越后展示人物身份卡片，古风宣纸样式
// → 自动从 intro 切入，点击后进入 game

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, roundRect } = ui
const { FadeAnim } = require('../engine/anim')

var state = null
var layout = {}
var anims = {}

// 身份数据（由入世引擎生成）
var IDENTITY = null

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // 卡片尺寸
  var cardW = Math.floor(w * 0.82)
  var cardH = Math.floor(h * 0.58)  // 稍高，给名人彩蛋留空间
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.20)

  // 标题
  var titleS = Math.min(18, Math.floor(w * 0.048))
  var titleY = cardY + Math.floor(cardH * 0.13)

  // 姓名（大字）
  var nameS = Math.min(36, Math.floor(w * 0.095))
  var nameY = titleY + Math.floor(cardH * 0.18)

  // 分隔线
  var divY = nameY + Math.floor(nameS * 0.6) + 6

  // 信息区
  var infoS = Math.min(15, Math.floor(w * 0.04))
  var infoY1 = divY + 20
  var infoSep = Math.floor(infoS * 1.6)

  // 纪年
  var yearS = Math.min(12, Math.floor(w * 0.032))
  var yearY = cardY + cardH - Math.floor(cardH * 0.13)

  // 弹窗指示
  var tapS = Math.min(12, Math.floor(w * 0.032))
  var tapY = h - Math.floor(h * 0.12)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    titleS: titleS, titleY: titleY,
    nameS: nameS, nameY: nameY,
    divY: divY,
    infoS: infoS, infoY1: infoY1, infoSep: infoSep,
    yearS: yearS, yearY: yearY,
    tapS: tapS, tapY: tapY,
  }
}

function init(items, identity) {
  // v2 新增：根据出身阶层初始化属性
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    // 声望：贵族500 / 平民100 / 贱籍50
    if (sc.includes('贵') || sc.includes('皇') || sc.includes('官')) identity['声望'] = 500
    else if (sc.includes('贱') || sc.includes('奴')) identity['声望'] = 50
    else identity['声望'] = 100
    // 财富：贵族3000 / 平民500 / 贱籍50
    if (sc.includes('贵') || sc.includes('皇') || sc.includes('官')) identity['财富'] = 3000
    else if (sc.includes('贱') || sc.includes('奴')) identity['财富'] = 50
    else identity['财富'] = 500
    // 学识：识字300 / 不识字50
    identity['学识'] = identity.canRead ? 300 : 50
    // 颜值：随机 3000-7000
    identity['颜值'] = 3000 + Math.floor(Math.random() * 4000)
    // 专属属性初始0
    identity['医术'] = 0
    identity['战功'] = 0
    identity['文采'] = 0
    identity['政绩'] = 0
    identity['义行'] = 0
    identity['历史庇护'] = 0
  }

  // 统一云函数(e.g. generate_identity)和本地引擎的身份数据格式
  if (identity && identity.city) {
    // 云函数格式 → 身份卡格式
    IDENTITY = {
      name: identity.name || '???',
      age: identity.age != null ? identity.age : '?',
      gender: identity.gender || '?',
      occupation: identity.occupation || '',
      socialClass: identity.socialClass || '',
      residence: identity.city || '',
      city: identity.city || '',         // v0.1.70 保留原字段（game.js 读 id.city）
      year: identity.year,               // v0.1.70 加 year 字段（game.js 读 id.year）
      eraDisplay: identity.eraDisplay || '',
      eraLabel: identity.eraLabel || '',
      dynasty: identity.dynasty || '',
      marital: '',
      literacy: identity.canRead ? '识字' : '不识字',
      isCelebrity: !!identity.isCelebrity,
      figure: identity.figure || null,
      source: identity.source || '',
    }
  } else {
    // 本地引擎格式（直接用）
    IDENTITY = identity || {
      name: '???',
      age: '?',
      gender: '?',
      origin: '',
      socialClass: '',
      occupation: '',
      occupationDesc: '',
      residence: '汴京',
      year: '崇宁元年秋',
      dynasty: '北宋',
      marital: '',
      literacy: '',
    }
  }

  calcLayout()
  var now = Date.now()

  state = {
    items: items || [],
    ready: false,        // 点击可用
    hasTapped: false,    // 已点击，等待淡出
    fadeOutStart: 0,
  }

  anims = {
    card: new FadeAnim(200, 600),         // 卡片整体淡入
    title: new FadeAnim(400, 500),
    name: new FadeAnim(600, 500),
    info: new FadeAnim(800, 600),
    year: new FadeAnim(1100, 400),
    seal: new FadeAnim(1200, 300),
  }
  for (var k in anims) anims[k].start(now)
}

function onTouch(x, y, type) {
  if (type !== 'end') return null
  if (!state) return null

  // 首次点击：内容已完全显示 → 淡出
  if (state.ready && !state.hasTapped) {
    state.hasTapped = true
    state.fadeOutStart = Date.now()
    return null
  }
  return null
}

// 绘制装饰花纹（四角）
function drawCornerDeco(ctx, x, y, w, h, scale) {
  ctx.save()
  ctx.globalAlpha *= 0.25
  ctx.strokeStyle = COLORS.goldDark
  ctx.lineWidth = 0.5 * scale

  var len = 10 * scale
  var gap = 3 * scale

  // 左上
  ctx.beginPath()
  ctx.moveTo(x + gap + len, y + gap)
  ctx.lineTo(x + gap, y + gap)
  ctx.lineTo(x + gap, y + gap + len)
  ctx.stroke()

  // 右上
  ctx.beginPath()
  ctx.moveTo(x + w - gap - len, y + gap)
  ctx.lineTo(x + w - gap, y + gap)
  ctx.lineTo(x + w - gap, y + gap + len)
  ctx.stroke()

  // 左下
  ctx.beginPath()
  ctx.moveTo(x + gap + len, y + h - gap)
  ctx.lineTo(x + gap, y + h - gap)
  ctx.lineTo(x + gap, y + h - gap - len)
  ctx.stroke()

  // 右下
  ctx.beginPath()
  ctx.moveTo(x + w - gap - len, y + h - gap)
  ctx.lineTo(x + w - gap, y + h - gap)
  ctx.lineTo(x + w - gap, y + h - gap - len)
  ctx.stroke()

  ctx.restore()
}

function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 1. 背景
  drawBackground(ctx, w, h)

  // 2. 如果已经点击淡出
  if (state.hasTapped) {
    var fadeElapsed = now - state.fadeOutStart
    var fadeP = Math.min(1, fadeElapsed / 400)
    ctx.fillStyle = 'rgba(0,0,0,' + fadeP + ')'
    ctx.fillRect(0, 0, w, h)
    if (fadeP >= 1) {
      module.exports.autoNext = { scene: 'game', items: state.items, identity: IDENTITY }
    }
    return
  }

  // 3. 宣纸卡片
  var cardOp = anims.card.update(now)
  if (cardOp <= 0) { return }

  // 卡片外层阴影
  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetY = 4

  // 卡片底——暖色宣纸
  ctx.fillStyle = 'rgba(40,35,30,0.85)'
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 4)
  ctx.fill()
  ctx.restore()

  // 卡片边框
  ctx.save()
  ctx.globalAlpha = cardOp * 0.15
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.8
  roundRect(ctx, l.cardX + 2, l.cardY + 2, l.cardW - 4, l.cardH - 4, 3)
  ctx.stroke()
  ctx.restore()

  // 内层宣纸（稍亮）
  ctx.save()
  ctx.globalAlpha = cardOp * 0.2
  ctx.fillStyle = 'rgba(80,68,55,0.3)'
  roundRect(ctx, l.cardX + 5, l.cardY + 5, l.cardW - 10, l.cardH - 10, 2)
  ctx.fill()
  ctx.restore()

  // 四角装饰
  drawCornerDeco(ctx, l.cardX + 3, l.cardY + 3, l.cardW - 6, l.cardH - 6, 1)

  // 4. 标题「你的身份」
  var tOp = anims.title.update(now)
  if (tOp > 0) {
    drawText(ctx, '— 你的身份 —', cx, l.titleY, {
      fontSize: l.titleS,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: tOp * 0.8,
    })
  }

  // 5. 姓名（大字）
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    ctx.save()
    ctx.shadowColor = 'rgba(200,168,124,' + (nOp * 0.08) + ')'
    ctx.shadowBlur = 6
    drawText(ctx, IDENTITY.name, cx, l.nameY, {
      fontSize: l.nameS,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: nOp,
      bold: true,
    })
    ctx.restore()
  }

  // 6. 分隔线
  if (nOp > 0.5) {
    ctx.save()
    ctx.globalAlpha = (nOp - 0.5) * 0.12
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(cx - 30, l.divY)
    ctx.lineTo(cx + 30, l.divY)
    ctx.stroke()
    ctx.restore()
  }

  // 7. 信息条目（入世引擎生成数据）
  var iOp = anims.info.update(now)
  if (iOp > 0) {
    var infoLines = [
      { label: '年龄', value: (typeof IDENTITY.age === 'number' ? IDENTITY.age : '?') + '岁' },
      { label: '性别', value: IDENTITY.gender + (IDENTITY.marital ? '·' + IDENTITY.marital : '') },
      { label: '身份', value: IDENTITY.age < 12 ? '孩童' : (IDENTITY.occupation || '—') },
      { label: '阶层', value: IDENTITY.socialClass || '—' },
      { label: '居所', value: IDENTITY.residence },
    ]

    for (var ii = 0; ii < infoLines.length; ii++) {
      var iy = l.infoY1 + ii * l.infoSep
      // 标签（左对齐）
      drawText(ctx, infoLines[ii].label, l.cardX + 40, iy, {
        fontSize: l.infoS,
        color: COLORS.paperDarker,
        align: 'left', baseline: 'middle',
        opacity: iOp * 0.6,
      })
      // 值（标签右侧）
      drawText(ctx, infoLines[ii].value, l.cardX + 90, iy, {
        fontSize: l.infoS,
        color: COLORS.paperWarm,
        align: 'left', baseline: 'middle',
        opacity: iOp,
      })
    }

    // 名人彩蛋
    if (IDENTITY.isCelebrity && IDENTITY.figure) {
      var celebY = l.infoY1 + infoLines.length * l.infoSep + 6
      drawText(ctx, '✦ 穿越成了 · ' + IDENTITY.figure, l.cardX + 40, celebY, {
        fontSize: l.infoS - 1,
        color: COLORS.gold,
        align: 'left', baseline: 'middle',
        opacity: iOp,
      })
    }

    // v2: 属性展示区
    var attrOp = anims.info.update(now)  // 复用info动画
    if (attrOp > 0) {
      var attrs = [
        { name: '声望', val: IDENTITY['声望'] || 0 },
        { name: '财富', val: IDENTITY['财富'] || 0 },
        { name: '学识', val: IDENTITY['学识'] || 0 },
        { name: '颜值', val: IDENTITY['颜值'] || 0 },
      ]

      // 属性标题分隔线
      var attrLineY = l.attrY - 8
      ctx.save()
      ctx.globalAlpha = attrOp * 0.2
      ctx.strokeStyle = COLORS.gold
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(l.cardX + 20, attrLineY)
      ctx.lineTo(l.cardX + l.cardW - 20, attrLineY)
      ctx.stroke()
      ctx.restore()

      // 属性标题
      drawText(ctx, '初始属性', l.cardX + l.cardW / 2, l.attrY - 2, {
        fontSize: l.attrS - 1,
        color: COLORS.gold,
        align: 'center', baseline: 'middle',
        opacity: attrOp * 0.6,
      })

      // 属性4列布局
      var attrStartY = l.attrY + l.attrRowH
      for (var ai = 0; ai < attrs.length; ai++) {
        var col = ai % 4
        var row = Math.floor(ai / 4)
        var ax = l.cardX + 30 + col * l.attrColW
        var ay = attrStartY + row * l.attrRowH

        // 属性名
        drawText(ctx, attrs[ai].name, ax, ay, {
          fontSize: l.attrS,
          color: COLORS.paperDarker,
          align: 'left', baseline: 'middle',
          opacity: attrOp * 0.6,
        })
        // 属性值
        drawText(ctx, String(attrs[ai].val), ax + 36, ay, {
          fontSize: l.attrS,
          color: COLORS.paperWarm,
          align: 'left', baseline: 'middle',
          opacity: attrOp,
        })
      }
    }
  }

  // 8. 纪年脚注（卡片底部，朝代 + 纪年；eraLabel 自带朝代前缀时去重）
  var yOp = anims.year.update(now)
  if (yOp > 0 && IDENTITY.dynasty) {
    var era = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    // 去重：era 自带 dynasty 前缀则剥掉
    if (era && era.indexOf(IDENTITY.dynasty) === 0) {
      era = era.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    var footnote = era ? IDENTITY.dynasty + ' · ' + era : IDENTITY.dynasty
    drawText(ctx, footnote, l.cardX + 40, l.yearY, {
      fontSize: l.yearS,
      color: COLORS.paperDarker,
      align: 'left', baseline: 'middle',
      opacity: yOp * 0.7,
    })
  }

  // 9. 底部装饰（替代朱砂印章）
  var sOp = anims.seal.update(now)
  if (sOp > 0) {
    ctx.save()
    // v0.1.72 持续闪烁（一次性淡入 sOp 完成后改为 sin 呼吸）
    var breathe = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 600))
    ctx.globalAlpha = sOp * breathe * 0.18

    // 金色菱形装饰点
    var dotX = l.cardX + l.cardW - 42
    var dotY = l.yearY
    ctx.fillStyle = COLORS.gold
    ctx.beginPath()
    ctx.moveTo(dotX, dotY - 4)
    ctx.lineTo(dotX + 4, dotY)
    ctx.lineTo(dotX, dotY + 4)
    ctx.lineTo(dotX - 4, dotY)
    ctx.closePath()
    ctx.fill()

    // 小竖线
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(l.cardX + l.cardW - 50, l.yearY - 8)
    ctx.lineTo(l.cardX + l.cardW - 50, l.yearY + 8)
    ctx.stroke()

    // v0.1.72 多加 2 个外圈光点（左上/右下）持续闪烁
    var breathe2 = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now / 700 + 1.2))
    ctx.globalAlpha = sOp * breathe2 * 0.22
    ;[{ x: l.cardX + 18, y: l.yearY - 8 }, { x: l.cardX + l.cardW - 18, y: l.yearY + 6 }].forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
      ctx.fill()
    })

    ctx.restore()
  }

  // 10. 点击继续（所有内容显示完毕 + 0.5s延迟后出现）
  var allShown = tOp > 0 && nOp > 0 && iOp > 0 && yOp > 0 && sOp > 0
  if (allShown) {
    if (!state.ready) {
      state.ready = true
    }
    var readyElapsed = now - anims.seal.startTime - 1500
    if (readyElapsed > 500) {
      drawText(ctx, '▸ 轻触继续', cx, l.tapY, {
        fontSize: l.tapS,
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
        opacity: 0.4,
      })
    }
  }
}

module.exports = { init, render, onTouch, autoNext: null }
