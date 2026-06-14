// Identity scene — 你的身份
// 穿越后展示身份卡片
// UI 设计参考自专业 UI 模型的输出方案
// → 自动从 intro 切入，点击卡片或按钮进入 game

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, roundRect } = ui
const { FadeAnim } = require('../engine/anim')

var state = null
var layout = {}
var anims = {}
var IDENTITY = null

// ── 主题色（UI 模型方案） ──
// 注意：这些是硬编码字符串，不能引用 C.xxx 因为 C 尚未赋值
var C = {
  textMain: '#f4e4bf',
  textSub: '#c8a978',
  textDim: '#8d7658',
  accent: '#d6a24c',
  cardTop: '#2b2119',
  cardBottom: '#120e0a',
  cardStroke: '#9a6a32',
  btnTop: '#b87832',
  btnBottom: '#7a3f1c',
  btnText: '#fff0cf',
  lineGold: 'rgba(214, 162, 76, 0.55)',
}

// ── 命格计算 ──
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

// ── 布局计算 ──
function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var sc = w / 390
  var cx = Math.floor(w / 2)

  var cardW = Math.min(w - 40 * sc, 350 * sc)
  var cardH = Math.min(408 * sc, h * 0.50)
  var cardX = Math.floor(cx - cardW / 2)
  var padX = 22 * sc
  var padY = 20 * sc
  var innerX = cardX + padX
  var innerW = cardW - padX * 2
  var cardY = Math.round(h * 0.16)

  var dynastyFs = Math.floor(15 * sc)
  var nameFs = Math.floor(34 * sc)
  var basicFs = Math.floor(14 * sc)
  var fateFs = Math.floor(18 * sc)
  var fateDescFs = Math.floor(13 * sc)
  var attrFs = Math.floor(12 * sc)
  var attrValFs = Math.floor(13 * sc)
  var chronicleFs = Math.floor(12 * sc)
  var ctaFs = Math.floor(18 * sc)

  var yDynasty = Math.floor(cardY + padY + 8 * sc)
  var yName = Math.floor(cardY + padY + 52 * sc)
  var yBasic = Math.floor(cardY + padY + 84 * sc)
  var yDiv1 = Math.floor(cardY + padY + 108 * sc)
  var yFate = Math.floor(cardY + padY + 136 * sc)
  var yFateDesc = Math.floor(cardY + padY + 158 * sc)
  var yAttrLabel = Math.floor(cardY + padY + 194 * sc)
  var yAttrRow1 = Math.floor(cardY + padY + 218 * sc)
  var yDiv2 = Math.floor(cardY + cardH - 92 * sc)
  var yChronicle = Math.floor(cardY + cardH - 66 * sc)

  var attrGapY = Math.floor(24 * sc)
  var attrColW = innerW / 3

  var btnW = Math.floor(156 * sc)
  var btnH = Math.floor(44 * sc)
  var btnX = Math.floor(cx - btnW / 2)
  var btnY = Math.floor(cardY + cardH + 24 * sc)

  layout = {
    w: w, h: h, cx: cx, sc: sc,
    cardX: cardX, cardY: cardY, cardW: cardW, cardH: cardH,
    padX: padX, padY: padY, innerX: innerX, innerW: innerW,
    dynastyFs: dynastyFs, yDynasty: yDynasty,
    nameFs: nameFs, yName: yName,
    basicFs: basicFs, yBasic: yBasic,
    yDiv1: yDiv1, yDiv2: yDiv2,
    fateFs: fateFs, yFate: yFate,
    fateDescFs: fateDescFs, yFateDesc: yFateDesc,
    yAttrLabel: yAttrLabel, yAttrRow1: yAttrRow1,
    attrGapY: attrGapY, attrColW: attrColW,
    chronicleFs: chronicleFs, yChronicle: yChronicle,
    ctaFs: ctaFs, btnX: btnX, btnY: btnY, btnW: btnW, btnH: btnH,
  }
}

// ── 初始属性生成 ──
function init(items, identity) {
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    const occ = identity.occupation || ''
    const canRead = !!identity.canRead
    const age = identity.age || 25

    let base = { '声望': 100, '财富': 500, '学识': 80 }
    if (sc.indexOf('贵') >= 0 || sc.indexOf('皇') >= 0 || sc.indexOf('公') >= 0 || sc.indexOf('侯') >= 0 || sc.indexOf('伯') >= 0 || sc.indexOf('大夫') >= 0 || sc.indexOf('宗') >= 0) {
      base = { '声望': 800, '财富': 5000, '学识': 200 }
    } else if (sc.indexOf('官') >= 0 || sc.indexOf('士') >= 0 || sc.indexOf('举') >= 0 || sc.indexOf('进士') >= 0) {
      base = { '声望': 500, '财富': 2000, '学识': 300 }
    } else if (sc.indexOf('商') >= 0 || sc.indexOf('贾') >= 0) {
      base = { '声望': 200, '财富': 4000, '学识': 150 }
    } else if (sc.indexOf('贱') >= 0 || sc.indexOf('奴') >= 0 || sc.indexOf('婢') >= 0 || sc.indexOf('仆') >= 0) {
      base = { '声望': 30, '财富': 30, '学识': 10 }
    }
    if (canRead) base['学识'] += 200

    let specialized = { '医术': 0, '战功': 0, '文采': 0, '政绩': 0, '义行': 0 }
    if (occ.indexOf('医') >= 0 || occ.indexOf('药') >= 0 || occ.indexOf('针灸') >= 0 || occ.indexOf('郎中') >= 0) specialized['医术'] = 800
    if (occ.indexOf('将') >= 0 || occ.indexOf('兵') >= 0 || occ.indexOf('军') >= 0 || occ.indexOf('武') >= 0 || occ.indexOf('侠') >= 0 || occ.indexOf('卒') >= 0) specialized['战功'] = 600
    if (occ.indexOf('书') >= 0 || occ.indexOf('诗') >= 0 || occ.indexOf('文') >= 0 || occ.indexOf('画') >= 0 || occ.indexOf('儒') >= 0 || occ.indexOf('墨') >= 0 || occ.indexOf('秀才') >= 0) specialized['文采'] = 800
    if (occ.indexOf('官') >= 0 || occ.indexOf('府') >= 0 || occ.indexOf('县') >= 0 || occ.indexOf('尹') >= 0 || occ.indexOf('令') >= 0 || occ.indexOf('相') >= 0 || occ.indexOf('卿') >= 0 || occ.indexOf('大夫') >= 0) specialized['政绩'] = 600
    if (occ.indexOf('僧') >= 0 || occ.indexOf('道') >= 0 || occ.indexOf('侠') >= 0 || occ.indexOf('义') >= 0 || occ.indexOf('丐') >= 0 || occ.indexOf('善') >= 0) specialized['义行'] = 500

    let ageBonus = 1.0
    if (age < 18) ageBonus = 0.7
    else if (age > 60) ageBonus = 1.3
    else if (age >= 30 && age <= 50) ageBonus = 1.2

    let face = 3000 + Math.floor(Math.random() * 4000)

    const set = function(key, val) { identity[key] = Math.max(0, Math.min(10000, Math.floor(val))) }
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
    content: new FadeAnim(500, 600),
    button: new FadeAnim(900, 500),
  }
  for (var k in anims) anims[k].start(now)

  // 纪年旁白（固定计算一次）
  if (IDENTITY && IDENTITY.dynasty) {
    state.narrative_era = IDENTITY.dynasty + ' · 天命初定'
  }
}

function onTouch(x, y, type) {
  if (!state || state.hasTapped) return
  state.hasTapped = true
  state.fadeOutStart = Date.now()
}

// ── 柔和分隔线 ──
function drawSoftLine(ctx, x, y, w, op) {
  ctx.save()
  ctx.globalAlpha = op || 1
  var grad = ctx.createLinearGradient(x, y, x + w, y)
  grad.addColorStop(0, 'rgba(154, 106, 50, 0)')
  grad.addColorStop(0.5, 'rgba(214, 162, 76, ' + (0.55 * (op || 1)) + ')')
  grad.addColorStop(1, 'rgba(154, 106, 50, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, 1)
  ctx.restore()
}

// ── 渲染 ──
function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 1. 背景
  drawBackground(ctx, w, h)

  // 2. 暗角背景
  var vignette = ctx.createRadialGradient(cx, h * 0.34, w * 0.15, cx, h * 0.34, w * 0.75)
  vignette.addColorStop(0, 'rgba(255, 244, 210, 0.06)')
  vignette.addColorStop(1, 'rgba(42, 24, 10, 0.32)')
  ctx.save()
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 3. 淡出
  if (state && state.hasTapped) {
    var fadeElapsed = now - state.fadeOutStart
    var fadeP = Math.min(1, fadeElapsed / 400)
    ctx.fillStyle = 'rgba(0,0,0,' + fadeP + ')'
    ctx.fillRect(0, 0, w, h)
    if (fadeP >= 1) {
      module.exports.autoNext = { scene: 'game', items: state.items, identity: IDENTITY }
    }
    return
  }

  var cardOp = anims && anims.card ? anims.card.update(now) : 0
  if (cardOp <= 0) return

  // ═══════════════════════
  //  主卡片
  // ═══════════════════════

  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(18, 10, 4, 0.42)'
  ctx.shadowBlur = 24 * l.sc
  ctx.shadowOffsetY = 12 * l.sc
  var cardGrad = ctx.createLinearGradient(0, l.cardY, 0, l.cardY + l.cardH)
  cardGrad.addColorStop(0, C.cardTop)
  cardGrad.addColorStop(1, C.cardBottom)
  ctx.fillStyle = cardGrad
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 3)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = cardOp * 0.50
  ctx.strokeStyle = C.cardStroke
  ctx.lineWidth = 1
  roundRect(ctx, l.cardX + 0.5, l.cardY + 0.5, l.cardW - 1, l.cardH - 1, 2)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = cardOp * 0.16
  ctx.strokeStyle = 'rgba(244, 218, 156, 0.5)'
  ctx.lineWidth = 0.8
  roundRect(ctx, l.cardX + 6 * l.sc, l.cardY + 6 * l.sc, l.cardW - 12 * l.sc, l.cardH - 12 * l.sc, 1)
  ctx.stroke()
  ctx.restore()

  // ═══════════════════════
  //  内容
  // ═══════════════════════

  var cOp = anims.content ? anims.content.update(now) : 0
  if (cOp <= 0) return

  // 朝代纪年
  var era = ''
  if (IDENTITY && IDENTITY.dynasty) {
    var e = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    if (e && e.indexOf(IDENTITY.dynasty) === 0) {
      e = e.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    era = e ? IDENTITY.dynasty + ' · ' + e : IDENTITY.dynasty
  }
  if (era) {
    drawText(ctx, era, cx, l.yDynasty, {
      fontSize: l.dynastyFs, color: C.textSub, align: 'center', baseline: 'middle',
      opacity: cOp * 0.55,
    })
  }

  // 姓名
  if (IDENTITY) {
    drawText(ctx, IDENTITY.name, cx, l.yName, {
      fontSize: l.nameFs, color: C.textMain, align: 'center', baseline: 'middle',
      opacity: cOp * 0.82, bold: true,
    })
  }

  // 基本信息行
  if (IDENTITY) {
    var parts = []
    if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender === '男') parts.push('儿郎')
    else if (IDENTITY.gender === '女') parts.push('女子')
    if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
    if (IDENTITY.residence) parts.push(IDENTITY.residence)
    drawText(ctx, parts.join(' · '), cx, l.yBasic, {
      fontSize: l.basicFs, color: C.textSub, align: 'center', baseline: 'middle',
      opacity: cOp * 0.45,
    })
  }

  // 分隔线 1
  drawSoftLine(ctx, l.innerX, l.yDiv1, l.innerW, cOp * 0.55)

  // 命格
  if (IDENTITY) {
    var destiny = calcDestiny(IDENTITY)
    drawText(ctx, destiny.title, cx, l.yFate, {
      fontSize: l.fateFs, color: C.accent, align: 'center', baseline: 'middle',
      opacity: cOp * 0.60,
    })
    drawText(ctx, destiny.guide, cx, l.yFateDesc, {
      fontSize: l.fateDescFs, color: C.textSub, align: 'center', baseline: 'middle',
      opacity: cOp * 0.35,
    })
  }

  // 初始九数
  drawText(ctx, '初始九数', l.innerX, l.yAttrLabel, {
    fontSize: l.attrFs, color: C.textDim, align: 'left', baseline: 'middle',
    opacity: cOp * 0.30,
  })

  // 9属性
  var allAttrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
  for (var i = 0; i < 9; i++) {
    var name = allAttrOrder[i]
    var val = (IDENTITY && IDENTITY[name]) || 0
    var col = i % 3
    var row = Math.floor(i / 3)
    var ax = l.innerX + col * l.attrColW
    var ay = l.yAttrRow1 + row * l.attrGapY
    var aCellW = l.attrColW - 4 * l.sc

    drawText(ctx, name, ax, ay, {
      fontSize: l.attrFs, color: C.textDim, align: 'left', baseline: 'middle',
      opacity: cOp * 0.35,
    })
    drawText(ctx, val > 0 ? val : '—', ax + aCellW, ay, {
      fontSize: l.attrValFs, color: val > 0 ? C.textMain : C.textDim,
      align: 'right', baseline: 'middle',
      opacity: cOp * (val > 0 ? 0.60 : 0.20),
      bold: val > 0,
    })
  }

  // 分隔线2
  drawSoftLine(ctx, l.innerX, l.yDiv2, l.innerW, cOp * 0.40)

  // 纪年旁白
  if (state && state.narrative_era) {
    drawText(ctx, state.narrative_era, cx, l.yChronicle, {
      fontSize: l.chronicleFs, color: C.textDim, align: 'center', baseline: 'middle',
      opacity: cOp * 0.25,
    })
  }

  // ═══════════════════════
  //  CTA 按钮
  // ═══════════════════════

  var bOp = anims.button ? anims.button.update(now) : 0
  if (bOp > 0) {
    ctx.save()
    ctx.globalAlpha = bOp * 0.55
    ctx.shadowColor = 'rgba(35, 16, 4, 0.35)'
    ctx.shadowBlur = 14 * l.sc
    ctx.shadowOffsetY = 6 * l.sc
    var btnGrad = ctx.createLinearGradient(0, l.btnY, 0, l.btnY + l.btnH)
    btnGrad.addColorStop(0, C.btnTop)
    btnGrad.addColorStop(1, C.btnBottom)
    ctx.fillStyle = btnGrad
    roundRect(ctx, l.btnX, l.btnY, l.btnW, l.btnH, 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = bOp * 0.42
    ctx.strokeStyle = 'rgba(255, 231, 180, 0.5)'
    ctx.lineWidth = 1
    roundRect(ctx, l.btnX + 0.5, l.btnY + 0.5, l.btnW - 1, l.btnH - 1, 1)
    ctx.stroke()
    ctx.restore()

    drawText(ctx, '落笔开局', cx, l.btnY + Math.floor(l.btnH / 2) + 1, {
      fontSize: l.ctaFs, color: C.btnText, align: 'center', baseline: 'middle',
      opacity: bOp * 0.75,
    })
  }
}
module.exports = { init, render, onTouch, autoNext: null }
