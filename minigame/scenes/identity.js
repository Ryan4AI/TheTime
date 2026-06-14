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

// ── 主题色（UI 模型方案，独立于全局 COLORS） ──
var C = {
  textMain: C.textMain,     // 主文字：暖金白
  textSub: C.textSub,      // 次级文字：褪金
  textDim: C.textDim,      // 弱信息
  accent: C.accent,       // 命格/装饰赭金
  cardTop: C.cardTop,      // 卡片顶深墨褐
  cardBottom: C.cardBottom,   // 卡片底近黑
  cardStroke: C.cardStroke,   // 暗金边框
  btnTop: C.btnTop,       // 按钮暖褐
  btnBottom: C.btnBottom,    // 按钮深褐
  btnText: C.btnText,      // 按钮文字奶油白
  lineGold: 'rgba(214, 162, 76, 0.55)',  // 分隔线金色
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

// ── 布局计算（UI 模型方案移植） ──
function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var sc = w / 390
  var cx = Math.floor(w / 2)

  // 卡片尺寸：控制在半屏以内
  var cardW = Math.min(w - 40 * sc, 350 * sc)
  var cardH = Math.min(408 * sc, h * 0.50)
  var cardX = Math.floor(cx - cardW / 2)
  var padX = 22 * sc
  var padY = 20 * sc
  var innerX = cardX + padX
  var innerW = cardW - padX * 2

  // 卡片垂直位置：略高于正中，CTA 按钮在卡片下方
  var cardY = Math.round(h * 0.16)

  // ── 字号（UI 模型方案） ──
  var dynastyFs = Math.floor(15 * sc)
  var nameFs = Math.floor(34 * sc)
  var basicFs = Math.floor(14 * sc)
  var fateFs = Math.floor(18 * sc)
  var fateDescFs = Math.floor(13 * sc)
  var attrFs = Math.floor(12 * sc)
  var attrValFs = Math.floor(13 * sc)
  var chronicleFs = Math.floor(12 * sc)
  var ctaFs = Math.floor(18 * sc)

  // ── 垂直排版 ──
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

  // ── 9 属性 3×3 网格 ──
  var attrGapY = Math.floor(24 * sc)
  var attrColW = innerW / 3

  // ── CTA 按钮（卡片下方） ──
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

// ── 初始属性生成（同前） ──
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
    content: new FadeAnim(500, 600),
    button: new FadeAnim(900, 500),
  }
  for (var k in anims) anims[k].start(now)
}

// ── 触摸处理：卡片或按钮区域均可触发 ──
function onTouch(x, y, type) {
  if (!state || state.hasTapped) return
  state.hasTapped = true
  state.fadeOutStart = Date.now()
}

// ── 柔和分隔线（渐变淡出） ──
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

  // 1. 背景（保持与入口页一致的暗暖调）
  drawBackground(ctx, w, h)

  // 2. 背景暗角，视线聚集卡片
  var vignette = ctx.createRadialGradient(cx, h * 0.34, w * 0.15, cx, h * 0.34, w * 0.75)
  vignette.addColorStop(0, 'rgba(255, 244, 210, 0.06)')
  vignette.addColorStop(1, 'rgba(42, 24, 10, 0.32)')
  ctx.save()
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 3. 淡出
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

  // ════════════════════════════════════
  //  段 1：主卡片（命运文牒）
  // ════════════════════════════════════

  // 卡片阴影
  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(18, 10, 4, 0.42)'
  ctx.shadowBlur = 24 * l.sc
  ctx.shadowOffsetY = 12 * l.sc

  // 卡片渐变：墨褐→近黑
  var cardGrad = ctx.createLinearGradient(0, l.cardY, 0, l.cardY + l.cardH)
  cardGrad.addColorStop(0, C.cardTop)
  cardGrad.addColorStop(1, C.cardBottom)
  ctx.fillStyle = cardGrad
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 3)
  ctx.fill()
  ctx.restore()

  // 外框线（暗金）
  ctx.save()
  ctx.globalAlpha = cardOp * 0.50
  ctx.strokeStyle = C.cardStroke
  ctx.lineWidth = 1
  roundRect(ctx, l.cardX + 0.5, l.cardY + 0.5, l.cardW - 1, l.cardH - 1, 2)
  ctx.stroke()
  ctx.restore()

  // 内框线（淡金，微光）
  ctx.save()
  ctx.globalAlpha = cardOp * 0.16
  ctx.strokeStyle = 'rgba(244, 218, 156, 0.5)'
  ctx.lineWidth = 0.8
  roundRect(ctx, l.cardX + 6 * l.sc, l.cardY + 6 * l.sc, l.cardW - 12 * l.sc, l.cardH - 12 * l.sc, 1)
  ctx.stroke()
  ctx.restore()

  // ════════════════════════════════════
  //  段 2：内容（淡入）
  // ════════════════════════════════════

  var cOp = anims.content.update(now)
  if (cOp <= 0) return

  // 朝代纪年（淡金）
  var era = ''
  if (IDENTITY.dynasty) {
    var e = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    if (e && e.indexOf(IDENTITY.dynasty) === 0) {
      e = e.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    era = e ? IDENTITY.dynasty + ' · ' + e : IDENTITY.dynasty
  }
  drawText(ctx, era, cx, l.yDynasty, {
    fontSize: l.dynastyFs, color: C.textSub, align: 'center', baseline: 'middle',
    opacity: cOp * 0.55,
  })

  // 姓名（大字锚点）
  drawText(ctx, IDENTITY.name, cx, l.yName, {
    fontSize: l.nameFs, color: C.textMain, align: 'center', baseline: 'middle',
    opacity: cOp * 0.82, bold: true,
  })

  // 基本信息行
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

  // 分隔线 1
  drawSoftLine(ctx, l.innerX, l.yDiv1, l.innerW, cOp * 0.55)

  // 命格（称号金 + 指引灰）
  var destiny = calcDestiny(IDENTITY)
  drawText(ctx, destiny.title, cx, l.yFate, {
    fontSize: l.fateFs, color: C.accent, align: 'center', baseline: 'middle',
    opacity: cOp * 0.60,
  })
  drawText(ctx, destiny.guide, cx, l.yFateDesc, {
    fontSize: l.fateDescFs, color: C.textSub, align: 'center', baseline: 'middle',
    opacity: cOp * 0.35,
  })

  // 属性标签（低调标记）
  drawText(ctx, '初始九数', l.innerX, l.yAttrLabel, {
    fontSize: l.attrFs, color: C.textDim, align: 'left', baseline: 'middle',
    opacity: cOp * 0.30,
  })

  // 9 属性（3×3 文本矩阵：标签左对齐，数值右对齐）
  var allAttrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
  for (var i = 0; i < 9; i++) {
    var name = allAttrOrder[i]
    var val = IDENTITY[name] || 0
    var col = i % 3
    var row = Math.floor(i / 3)
    var ax = l.innerX + col * l.attrColW
    var ay = l.yAttrRow1 + row * l.attrGapY
    var aCellW = l.attrColW - 4 * l.sc  // 右侧留 margin

    // 属性名（左对齐）
    drawText(ctx, name, ax, ay, {
      fontSize: l.attrFs, color: C.textDim, align: 'left', baseline: 'middle',
      opacity: cOp * 0.35,
    })
    // 属性值（右对齐，零值虚化）
    drawText(ctx, val > 0 ? val : '—', ax + aCellW, ay, {
      fontSize: l.attrValFs, color: val > 0 ? C.textMain : C.textDim,
      align: 'right', baseline: 'middle',
      opacity: cOp * (val > 0 ? 0.60 : 0.20),
      bold: val > 0,
    })
  }

  // 分隔线 2
  drawSoftLine(ctx, l.innerX, l.yDiv2, l.innerW, cOp * 0.40)

  // 纪年旁白（氛围句，init 时固定）
  var atmosphere = ''
  if (IDENTITY.dynasty) {
    atmosphere = IDENTITY.dynasty + ' · 天命初定'
  }
  state.narrative_era = atmosphere
  drawText(ctx, state.narrative_era || '', cx, l.yChronicle, {
    fontSize: l.chronicleFs, color: C.textDim, align: 'center', baseline: 'middle',
    opacity: cOp * 0.25,
  })

  // ════════════════════════════════════
  //  段 3：CTA 按钮（卡片下方）
  // ════════════════════════════════════

  var bOp = anims.button.update(now)
  if (bOp > 0) {
    // 按钮阴影
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

    // 按钮边框
    ctx.save()
    ctx.globalAlpha = bOp * 0.42
    ctx.strokeStyle = 'rgba(255, 231, 180, 0.5)'
    ctx.lineWidth = 1
    roundRect(ctx, l.btnX + 0.5, l.btnY + 0.5, l.btnW - 1, l.btnH - 1, 1)
    ctx.stroke()
    ctx.restore()

    // 按钮文字
    drawText(ctx, '落笔开局', cx, l.btnY + Math.floor(l.btnH / 2) + 1, {
      fontSize: l.ctaFs, color: C.btnText, align: 'center', baseline: 'middle',
      opacity: bOp * 0.75,
    })
  }
}
module.exports = { init, render, onTouch, autoNext: null }
