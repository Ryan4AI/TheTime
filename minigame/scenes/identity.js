// Identity scene — 你的身份
// 穿越后展示人物身份卡片，古风宣纸样式
// → 自动从 intro 切入，点击后进入 game

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, roundRect } = ui
const { FadeAnim } = require('../engine/anim')

var state = null
var layout = {}
var anims = {}

// 身份数据
var IDENTITY = null

// 命格计算
function calcDestiny(id) {
  var DESTINIES = [
    { title: '文曲临凡', a1: '文采', w1: 1.0, a2: '学识', w2: 0.5, guide: '文采出众 · 宜走科举仕途' },
    { title: '将星入命', a1: '战功', w1: 1.0, a2: '声望', w2: 0.3, guide: '战功卓著 · 乱世从军可封侯' },
    { title: '陶朱在世', a1: '财富', w1: 1.0, a2: null, w2: 0,   guide: '财富丰厚 · 经商可积财万贯' },
    { title: '悬壶济世', a1: '医术', w1: 1.0, a2: '学识', w2: 0.3, guide: '医术在身 · 行医兼得名与利' },
    { title: '倾国倾城', a1: '颜值', w1: 1.0, a2: null, w2: 0,   guide: '容貌出众 · 可借姻缘改命途' },
    { title: '经世之才', a1: '政绩', w1: 1.0, a2: '声望', w2: 0.3, guide: '政绩突出 · 入仕理政展抱负' },
    { title: '侠义无双', a1: '义行', w1: 1.0, a2: '战功', w2: 0.3, guide: '侠骨丹心 · 路见不平积声望' },
    { title: '博闻强识', a1: '学识', w1: 1.0, a2: '文采', w2: 0.3, guide: '学识渊博 · 著书立说传天下' },
    { title: '名动四方', a1: '声望', w1: 1.0, a2: '义行', w2: 0.3, guide: '声望在外 · 广结善缘开前路' },
  ]
  var best = null, bestScore = -1
  for (var di = 0; di < DESTINIES.length; di++) {
    var d = DESTINIES[di]
    var score = (id[d.a1] || 0) * d.w1
    if (d.a2) score += (id[d.a2] || 0) * d.w2
    if (score > bestScore) { bestScore = score; best = d }
  }
  if (bestScore <= 0) return { title: '凡夫俗子', guide: '且行且看，此生命数尚不可知。' }
  return { title: best.title, guide: best.guide }
}

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // 卡片尺寸
  var cardW = Math.floor(w * 0.84)
  var cardH = Math.floor(h * 0.46)
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.20)

  // ── 内容排版 ──
  var titleS = Math.min(11, Math.floor(w * 0.028))     //"— 你的身份 —"
  var nameS = Math.min(26, Math.floor(w * 0.067))      // 姓名
  var infoS = Math.min(10, Math.floor(w * 0.026))       // 基本信息行
  var lineS = Math.min(9, Math.floor(w * 0.024))        // 分隔线标签
  var attrS = Math.min(11, Math.floor(w * 0.028))       // 属性值
  var eraS = Math.min(9, Math.floor(w * 0.024))         // 纪年
  var destinyS = Math.min(10, Math.floor(w * 0.026))    // 命格

  var topPad = Math.floor(cardH * 0.06)
  var titleY = cardY + topPad + Math.floor(titleS * 0.5)
  var nameY = titleY + Math.floor(cardH * 0.05) + Math.floor(nameS * 0.5)
  var infoY = nameY + Math.floor(nameS * 0.50) + Math.floor(cardH * 0.02)
  var sep1Y = infoY + infoS + Math.floor(cardH * 0.025)

  // 命格行
  var destinyY = sep1Y + Math.floor(cardH * 0.04) + Math.floor(destinyS * 0.5)
  var sep2Y = destinyY + destinyS + Math.floor(cardH * 0.02)

  // 属性网格（3×3 等宽）
  var attrGridPadX = 24
  var attrGap = 8
  var attrCellW = Math.floor((cardW - attrGridPadX * 2 - attrGap * 2) / 3)
  var attrGridTop = sep2Y + Math.floor(cardH * 0.025)
  var attrRowH = Math.floor(cardH * 0.055)

  // 底部纪年
  var eraY = cardY + cardH - Math.floor(cardH * 0.065)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH, cardX: cardX, cardY: cardY,
    titleS: titleS, titleY: titleY,
    nameS: nameS, nameY: nameY,
    infoS: infoS, infoY: infoY,
    sep1Y: sep1Y, sep2Y: sep2Y,
    lineS: lineS,
    destinyS: destinyS, destinyY: destinyY,
    attrS: attrS, attrGridTop: attrGridTop, attrCellW: attrCellW,
    attrGap: attrGap, attrRowH: attrRowH, attrGridPadX: attrGridPadX,
    eraS: eraS, eraY: eraY,
  }
}

function init(items, identity) {
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    const occ = identity.occupation || ''
    const canRead = !!identity.canRead
    const age = identity.age || 25

    let base = { '声望': 100, '财富': 500, '学识': 80 }
    if (sc.includes('贵') || sc.includes('皇') || sc.includes('公') || sc.includes('侯') || sc.includes('伯') || sc.includes('大夫') || sc.includes('宗')) {
      base = { '声望': 800, '财富': 5000, '学识': 200 }
    } else if (sc.includes('官') || sc.includes('士') || sc.includes('举') || sc.includes('进士')) {
      base = { '声望': 500, '财富': 2000, '学识': 300 }
    } else if (sc.includes('商') || sc.includes('贾')) {
      base = { '声望': 200, '财富': 4000, '学识': 150 }
    } else if (sc.includes('贱') || sc.includes('奴') || sc.includes('婢') || sc.includes('仆')) {
      base = { '声望': 30, '财富': 30, '学识': 10 }
    }
    if (canRead) base['学识'] += 200

    let specialized = { '医术': 0, '战功': 0, '文采': 0, '政绩': 0, '义行': 0 }
    if (occ.includes('医') || occ.includes('药') || occ.includes('针灸') || occ.includes('郎中')) specialized['医术'] = 800
    if (occ.includes('将') || occ.includes('兵') || occ.includes('军') || occ.includes('武') || occ.includes('侠') || occ.includes('卒')) specialized['战功'] = 600
    if (occ.includes('书') || occ.includes('诗') || occ.includes('文') || occ.includes('画') || occ.includes('儒') || occ.includes('墨') || occ.includes('秀才')) specialized['文采'] = 800
    if (occ.includes('官') || occ.includes('府') || occ.includes('县') || occ.includes('尹') || occ.includes('令') || occ.includes('相') || occ.includes('卿') || occ.includes('大夫')) specialized['政绩'] = 600
    if (occ.includes('僧') || occ.includes('道') || occ.includes('侠') || occ.includes('义') || occ.includes('丐') || occ.includes('善')) specialized['义行'] = 500

    let ageBonus = 1.0
    if (age < 18) ageBonus = 0.7
    else if (age > 60) ageBonus = 1.3
    else if (age >= 30 && age <= 50) ageBonus = 1.2

    let face = 3000 + Math.floor(Math.random() * 4000)

    const set = (key, val) => { identity[key] = Math.max(0, Math.min(10000, Math.floor(val))) }
    set('声望', base['声望'] * ageBonus)
    set('财富', base['财富'] * ageBonus)
    set('学识', base['学识'] * ageBonus)
    set('颜值', face)
    set('医术', specialized['医术'])
    set('战功', specialized['战功'])
    set('文采', specialized['文采'])
    set('政绩', specialized['政绩'])
    set('义行', specialized['义行'])
  }

  IDENTITY = identity
  state = { hasTapped: false, items: items, fadeOutStart: 0 }
  calcLayout()
  var now = Date.now()
  anims = {
    card: new FadeAnim(300, 500),
    name: new FadeAnim(600, 600),
    seal: new FadeAnim(1000, 500),
  }
  for (var k in anims) anims[k].start(now)
}

function onTouch(x, y, type) {
  if (!state || state.hasTapped) return
  state.hasTapped = true
  state.fadeOutStart = Date.now()
}

function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 1. 背景
  drawBackground(ctx, w, h)

  // 2. 淡出
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

  var cardOp = anims.card.update(now)
  if (cardOp <= 0) return

  // ── 卡片（简洁深底方卡，参考图风格） ──
  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(0,0,0,0.30)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 2
  ctx.fillStyle = 'rgba(35,30,26,0.90)'
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 3)
  ctx.fill()
  ctx.restore()

  // 卡片边框（极细）
  ctx.save()
  ctx.globalAlpha = cardOp * 0.15
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.5
  roundRect(ctx, l.cardX + 1, l.cardY + 1, l.cardW - 2, l.cardH - 2, 2)
  ctx.stroke()
  ctx.restore()

  // ── 内容 ──
  var nOp = anims.name.update(now)
  if (nOp <= 0) return

  // — 你的身份 —
  drawText(ctx, '— 你的身份 —', cx, l.titleY, {
    fontSize: l.titleS, color: COLORS.gold, align: 'center', baseline: 'middle',
    opacity: nOp * 0.35,
  })

  // 姓名（大字）
  drawText(ctx, IDENTITY.name, cx, l.nameY, {
    fontSize: l.nameS, color: COLORS.goldLight, align: 'center', baseline: 'middle',
    opacity: nOp * 0.80, bold: true,
  })

  // 基本信息行
  var parts = []
  if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
  if (IDENTITY.gender === '男') parts.push('儿郎')
  else if (IDENTITY.gender === '女') parts.push('女子')
  if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
  if (IDENTITY.residence) parts.push(IDENTITY.residence)
  drawText(ctx, parts.join(' · '), cx, l.infoY, {
    fontSize: l.infoS, color: COLORS.paperDarker, align: 'center', baseline: 'middle',
    opacity: nOp * 0.45,
  })

  // ── 分隔线 1 ──
  ctx.save()
  ctx.globalAlpha = nOp * 0.04
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.3
  var sepLen = Math.floor(l.cardW * 0.25)
  ctx.beginPath()
  ctx.moveTo(cx - sepLen, l.sep1Y)
  ctx.lineTo(cx + sepLen, l.sep1Y)
  ctx.stroke()
  ctx.restore()

  // ── 命格（纯文本，无高亮无主次） ──
  var destiny = calcDestiny(IDENTITY)
  drawText(ctx, '命格：' + destiny.title + ' · ' + destiny.guide, cx, l.destinyY, {
    fontSize: l.destinyS, color: COLORS.paperDarker, align: 'center', baseline: 'middle',
    opacity: nOp * 0.30,
  })

  // ── 分隔线 2 ──
  ctx.save()
  ctx.globalAlpha = nOp * 0.04
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.3
  ctx.beginPath()
  ctx.moveTo(cx - sepLen, l.sep2Y)
  ctx.lineTo(cx + sepLen, l.sep2Y)
  ctx.stroke()
  ctx.restore()

  // ── 属性（3×3 纯文字排列） ──
  var allAttrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
  for (var ri = 0; ri < 3; ri++) {
    for (var ci = 0; ci < 3; ci++) {
      var idx = ri * 3 + ci
      var name = allAttrOrder[idx]
      var val = IDENTITY[name] || 0
      var x = l.attrGridPadX + l.cardX + ci * (l.attrCellW + l.attrGap) + Math.floor(l.attrCellW / 2)
      var y = l.attrGridTop + ri * l.attrRowH + Math.floor(l.attrRowH / 2)

      // 属性名
      drawText(ctx, name, x, y - Math.floor(l.attrRowH * 0.15), {
        fontSize: Math.floor(l.attrS * 0.85), color: COLORS.gold, align: 'center', baseline: 'middle',
        opacity: nOp * 0.25,
      })
      // 属性值
      drawText(ctx, val > 0 ? val : '—', x, y + Math.floor(l.attrRowH * 0.15), {
        fontSize: l.attrS, color: COLORS.paperDarker, align: 'center', baseline: 'middle',
        opacity: nOp * (val > 0 ? 0.45 : 0.10), bold: val > 0,
      })
    }
  }

  // ── 底部纪年（翠冷色，仿参考图风格） ──
  var era = ''
  if (IDENTITY.dynasty) {
    var e = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    if (e && e.indexOf(IDENTITY.dynasty) === 0) {
      e = e.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    era = e ? IDENTITY.dynasty + ' · ' + e : IDENTITY.dynasty
  }
  drawText(ctx, era, cx, l.eraY, {
    fontSize: l.eraS, color: COLORS.jade, align: 'center', baseline: 'middle',
    opacity: nOp * 0.25,
  })

  // ── 开局印章（置于属性网格与纪年之间） ──
  var yOp = anims.seal.update(now)
  if (yOp > 0) {
    var stampW = 48, stampH = 32
    var stampY = l.eraY - stampH - Math.floor(cardH * 0.02)
    var stampX = cx - Math.floor(stampW / 2)

    ctx.save()
    ctx.globalAlpha = yOp * 0.50
    ctx.strokeStyle = COLORS.vermillion
    ctx.lineWidth = 0.8
    roundRect(ctx, stampX + 1, stampY + 1, stampW - 2, stampH - 2, 2)
    ctx.stroke()
    ctx.restore()

    drawText(ctx, '开局', stampX + stampW / 2, stampY + stampH / 2, {
      fontSize: Math.min(11, Math.floor(l.cardH * 0.05)),
      color: COLORS.vermillion, align: 'center', baseline: 'middle',
      opacity: yOp * 0.45,
    })
  }
}
module.exports = { init, render, onTouch, autoNext: null }
