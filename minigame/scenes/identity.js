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

// 命格计算（固定规则匹配）
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
  var cardW = Math.floor(w * 0.86)
  var cardH = Math.floor(h * 0.56)  // 稍高以容纳竹简
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.19)

  // ── 玉牒（基本信息区） ──
  var jadeW = Math.floor(cardW * 0.68)   // 约两个竹简宽
  var jadeH = Math.floor(cardH * 0.28)
  var jadeX = cx - Math.floor(jadeW / 2)
  var jadeY = cardY + Math.floor(cardH * 0.035)

  var nameS = Math.min(24, Math.floor(w * 0.062))
  var eraS = Math.min(9, Math.floor(w * 0.024))
  var subS = Math.min(10, Math.floor(w * 0.026))
  var destinyS = Math.min(10, Math.floor(w * 0.026))
  var jadePadTop = 10
  var eraY = jadeY + jadePadTop + 2
  var nameY = eraY + eraS + Math.floor(jadeH * 0.05)
  var subY = nameY + Math.floor(nameS * 0.55) + 2
  // 命格文字位于玉牒底部
  var destinyGuideY = jadeY + jadeH - 6
  var destinyTitleY = destinyGuideY - Math.floor(destinyS * 1.1) - 2

  // ── 竹简属性（上5下4） ──
  var slipPadX = 16
  var topN = 5, botN = 4

  var fullAvail = cardW - slipPadX * 2  // 可用宽度
  var slipGap = 4
  var topSlipW = Math.floor((fullAvail - slipGap * (topN - 1)) / topN)
  var botSlipW = Math.floor((fullAvail - slipGap * (botN - 1)) / botN)
  // 两排分别定位居中
  var topRowW = topN * topSlipW + (topN - 1) * slipGap
  var botRowW = botN * botSlipW + (botN - 1) * slipGap
  var topRowX = cx - Math.floor(topRowW / 2)
  var botRowX = cx - Math.floor(botRowW / 2)

  var slipH = Math.min(90, Math.floor(cardH * 0.19))

  // 竹简位置（在卡片内居下，玉牒下方）
  var slipsY = jadeY + jadeH + Math.floor(cardH * 0.05)
  var slip1Y = slipsY
  var slip2Y = slip1Y + slipH + 6

  var slip1Starts = []
  for (var i = 0; i < topN; i++) slip1Starts.push(topRowX + i * (topSlipW + slipGap))
  var slip2Starts = []
  for (var i = 0; i < botN; i++) slip2Starts.push(botRowX + i * (botSlipW + slipGap))

  var attrNameS = Math.min(10, Math.floor(w * 0.026))
  var attrValS = Math.min(12, Math.floor(w * 0.031))

  // ── 朱砂印 ──
  var btnY = cardY + cardH - Math.floor(cardH * 0.10)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH, cardX: cardX, cardY: cardY,
    jadeW: jadeW, jadeH: jadeH, jadeX: jadeX, jadeY: jadeY,
    nameS: nameS, nameY: nameY,
    eraS: eraS, eraY: eraY,
    subS: subS, subY: subY,
    destinyS: destinyS, destinyTitleY: destinyTitleY, destinyGuideY: destinyGuideY,
    topSlipW: topSlipW, botSlipW: botSlipW, slipH: slipH,
    slip1Y: slip1Y, slip2Y: slip2Y,
    slip1Starts: slip1Starts, slip2Starts: slip2Starts,
    slipGap: slipGap, slipPadX: slipPadX,
    attrNameS: attrNameS, attrValS: attrValS,
    btnY: btnY,
    _topN: topN, _botN: botN,
  }
}

function init(items, identity) {
  // v0.6.3 重构：精细化初始属性（阶层/职业/年龄/名人 4 维度）
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    const occ = identity.occupation || ''
    const canRead = !!identity.canRead
    const age = identity.age || 25
    // v0.6.6 移除名人彩蛋（避免与排行榜冲突）
    const isCelebrity = false

    // ── 1. 阶层基础（声望/财富/学识）──
    let base = { '声望': 100, '财富': 500, '学识': 80 }
    if (sc.includes('贵') || sc.includes('皇') || sc.includes('公') || sc.includes('侯') || sc.includes('伯') || sc.includes('大夫') || sc.includes('宗')) {
      base = { '声望': 800, '财富': 5000, '学识': 200 }  // 贵族
    } else if (sc.includes('官') || sc.includes('士') || sc.includes('举') || sc.includes('进士')) {
      base = { '声望': 500, '财富': 2000, '学识': 300 }  // 士绅
    } else if (sc.includes('商') || sc.includes('贾')) {
      base = { '声望': 200, '财富': 4000, '学识': 150 }  // 商人
    } else if (sc.includes('贱') || sc.includes('奴') || sc.includes('婢') || sc.includes('仆')) {
      base = { '声望': 30, '财富': 30, '学识': 10 }  // 贱籍
    } else {
      base = { '声望': 100, '财富': 500, '学识': 80 }  // 平民/农/工
    }

    // ── 2. 识字加成 ──
    if (canRead) base['学识'] += 200

    // ── 3. 职业专属属性（v0.6.3 新增：医生有医术，士兵有战功等）──
    let specialized = { '医术': 0, '战功': 0, '文采': 0, '政绩': 0, '义行': 0 }
    if (occ.includes('医') || occ.includes('药') || occ.includes('针灸') || occ.includes('郎中')) specialized['医术'] = 800
    if (occ.includes('将') || occ.includes('兵') || occ.includes('军') || occ.includes('武') || occ.includes('侠') || occ.includes('卒')) specialized['战功'] = 600
    if (occ.includes('书') || occ.includes('诗') || occ.includes('文') || occ.includes('画') || occ.includes('儒') || occ.includes('墨') || occ.includes('秀才')) specialized['文采'] = 800
    if (occ.includes('官') || occ.includes('府') || occ.includes('县') || occ.includes('尹') || occ.includes('令') || occ.includes('相') || occ.includes('卿') || occ.includes('大夫')) specialized['政绩'] = 600
    if (occ.includes('僧') || occ.includes('道') || occ.includes('侠') || occ.includes('义') || occ.includes('丐') || occ.includes('善')) specialized['义行'] = 500

    // ── 4. 年龄调整系数 ──
    let ageBonus = 1.0
    if (age < 18) ageBonus = 0.7           // 少年：属性低但潜力大
    else if (age > 60) ageBonus = 1.3     // 老年：经验丰富
    else if (age >= 30 && age <= 50) ageBonus = 1.2  // 壮年：黄金期

    // ── 5. 名人彩蛋加成 ──
    let celebBonus = 1.0  // v0.6.6 永远 1.0

    // ── 6. 颜值：随机 3000-7000，名人 +30% ──
    let face = 3000 + Math.floor(Math.random() * 4000)
    // v0.6.6 移除名人颜值加成

    // ── 7. 综合赋值（clamp 0-10000）──
    const set = (key, val) => { identity[key] = Math.max(0, Math.min(10000, Math.floor(val))) }
    set('声望', base['声望'] * ageBonus * celebBonus)
    set('财富', base['财富'] * ageBonus * celebBonus)
    set('学识', base['学识'] * ageBonus * celebBonus)
    set('颜值', face)
    set('医术', specialized['医术'] * celebBonus)
    set('战功', specialized['战功'] * celebBonus)
    set('文采', specialized['文采'] * celebBonus)
    set('政绩', specialized['政绩'] * celebBonus)
    set('义行', specialized['义行'] * celebBonus)
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
  // 点击任意位置开始游戏
  state.hasTapped = true
  state.fadeOutStart = Date.now()
}

function drawCornerDeco(ctx, x, y, w, h, scale) {
  var col = COLORS.gold
  var gap = 4 * scale
  var len = 12 * scale

  ctx.save()
  ctx.globalAlpha = 0.30
  ctx.strokeStyle = col
  ctx.lineWidth = 0.8

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

  // 3. 卡片淡入
  var cardOp = anims.card.update(now)
  if (cardOp <= 0) return

  // ── 卷轴木轴 ──
  var rollerW = l.cardW + 10
  var rollerH = 7
  var rollerTopY = l.cardY - rollerH + 1
  var rollerBotY = l.cardY + l.cardH - 2

  ctx.save()
  ctx.globalAlpha = cardOp

  // 上轴
  var gTop = ctx.createLinearGradient(l.cx, rollerTopY, l.cx, rollerTopY + rollerH)
  gTop.addColorStop(0, '#504030')
  gTop.addColorStop(0.4, '#7a6040')
  gTop.addColorStop(0.6, '#8a7050')
  gTop.addColorStop(1, '#403020')
  ctx.fillStyle = gTop
  roundRect(ctx, l.cx - rollerW / 2, rollerTopY, rollerW, rollerH, 3)
  ctx.fill()
  ctx.fillStyle = '#302010'
  roundRect(ctx, l.cx - rollerW / 2 - 1, rollerTopY - 1, 6, rollerH + 2, 2)
  ctx.fill()
  roundRect(ctx, l.cx + rollerW / 2 - 5, rollerTopY - 1, 6, rollerH + 2, 2)
  ctx.fill()

  // 下轴
  var gBot = ctx.createLinearGradient(l.cx, rollerBotY, l.cx, rollerBotY + rollerH)
  gBot.addColorStop(0, '#8a7050')
  gBot.addColorStop(0.3, '#7a6040')
  gBot.addColorStop(0.6, '#504030')
  gBot.addColorStop(1, '#403020')
  ctx.fillStyle = gBot
  roundRect(ctx, l.cx - rollerW / 2, rollerBotY, rollerW, rollerH, 3)
  ctx.fill()
  ctx.fillStyle = '#302010'
  roundRect(ctx, l.cx - rollerW / 2 - 1, rollerBotY - 1, 6, rollerH + 2, 2)
  ctx.fill()
  roundRect(ctx, l.cx + rollerW / 2 - 5, rollerBotY - 1, 6, rollerH + 2, 2)
  ctx.fill()
  ctx.restore()

  // 卡片阴影 + 底色
  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 3
  ctx.fillStyle = 'rgba(40,35,30,0.88)'
  roundRect(ctx, l.cardX, l.cardY, l.cardW, l.cardH, 4)
  ctx.fill()
  ctx.restore()

  // 卡片边框
  ctx.save()
  ctx.globalAlpha = cardOp * 0.18
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 1
  roundRect(ctx, l.cardX + 2, l.cardY + 2, l.cardW - 4, l.cardH - 4, 3)
  ctx.stroke()
  ctx.restore()

  // 内层纸面
  ctx.save()
  ctx.globalAlpha = cardOp * 0.12
  ctx.fillStyle = 'rgba(80,68,55,0.3)'
  roundRect(ctx, l.cardX + 6, l.cardY + 6, l.cardW - 12, l.cardH - 12, 2)
  ctx.fill()
  ctx.restore()

  // 四角装饰
  drawCornerDeco(ctx, l.cardX + 3, l.cardY + 3, l.cardW - 6, l.cardH - 6, 1)
  var dotR = 2, dotOp = cardOp * 0.30
  var corners = [
    [l.cardX + 3, l.cardY + 3], [l.cardX + l.cardW - 3, l.cardY + 3],
    [l.cardX + 3, l.cardY + l.cardH - 3], [l.cardX + l.cardW - 3, l.cardY + l.cardH - 3],
  ]
  for (var di = 0; di < 4; di++) {
    ctx.save()
    ctx.globalAlpha = dotOp
    ctx.fillStyle = COLORS.gold
    ctx.beginPath()
    ctx.arc(corners[di][0], corners[di][1], dotR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ── 段 1：玉牒（基本信息 + 命格，翡翠色面） ──
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    var jx = l.jadeX, jy = l.jadeY, jw = l.jadeW, jh = l.jadeH

    // 玉牒底面——翡翠渐变
    ctx.save()
    ctx.globalAlpha = nOp * 0.70
    var jGrad = ctx.createLinearGradient(jx, 0, jx + jw, 0)
    jGrad.addColorStop(0, '#4a7a5a')
    jGrad.addColorStop(0.15, '#6a9a78')
    jGrad.addColorStop(0.4, '#7aaa88')
    jGrad.addColorStop(0.6, '#7aaa88')
    jGrad.addColorStop(0.85, '#6a9a78')
    jGrad.addColorStop(1, '#4a7a5a')
    ctx.fillStyle = jGrad
    roundRect(ctx, jx, jy, jw, jh, 3)
    ctx.fill()
    ctx.restore()

    // 玉牒边框
    ctx.save()
    ctx.globalAlpha = nOp * 0.15
    ctx.strokeStyle = 'rgba(200,220,200,0.5)'
    ctx.lineWidth = 0.5
    roundRect(ctx, jx + 2, jy + 2, jw - 4, jh - 4, 2)
    ctx.stroke()
    ctx.restore()

    // 玉牒表面光泽
    ctx.save()
    ctx.globalAlpha = nOp * 0.06
    var shine = ctx.createLinearGradient(0, jy, 0, jy + jh)
    shine.addColorStop(0, 'rgba(255,255,255,0.15)')
    shine.addColorStop(0.5, 'rgba(255,255,255,0)')
    shine.addColorStop(1, 'rgba(0,0,0,0.1)')
    ctx.fillStyle = shine
    ctx.fillRect(jx + 4, jy + 4, jw - 8, jh - 8)
    ctx.restore()

    // ── 纪年（左上小字） ──
    var era = ''
    if (IDENTITY.dynasty) {
      var e = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
      if (e && e.indexOf(IDENTITY.dynasty) === 0) {
        e = e.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
      }
      era = e ? IDENTITY.dynasty + ' · ' + e : IDENTITY.dynasty
    }
    drawText(ctx, era, jx + jw / 2, l.eraY, {
      fontSize: Math.floor(l.eraS * 0.85), color: '#e0e8d0',
      align: 'center', baseline: 'middle', opacity: nOp * 0.30,
    })

    // ── 姓名（玉牒正中大字） ──
    drawText(ctx, IDENTITY.name, jx + jw / 2, l.nameY, {
      fontSize: l.nameS, fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: '#e8f0e0', align: 'center', baseline: 'middle',
      opacity: nOp * 0.80, bold: true,
    })

    // ── 副标题 ──
    var parts = []
    if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender === '男') parts.push('儿郎')
    else if (IDENTITY.gender === '女') parts.push('女子')
    if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
    if (IDENTITY.residence) parts.push(IDENTITY.residence)
    drawText(ctx, parts.join(' · '), jx + jw / 2, l.subY, {
      fontSize: l.subS, color: '#c0d0b8',
      align: 'center', baseline: 'middle', opacity: nOp * 0.45,
    })

    // ── 玉牒底部细线 ──
    var lineY = l.destinyTitleY - 6
    ctx.save()
    ctx.globalAlpha = nOp * 0.06
    ctx.strokeStyle = 'rgba(200,220,200,0.6)'
    ctx.lineWidth = 0.3
    ctx.beginPath()
    ctx.moveTo(jx + Math.floor(jw * 0.15), lineY)
    ctx.lineTo(jx + jw - Math.floor(jw * 0.15), lineY)
    ctx.stroke()
    ctx.restore()

    // ── 命格（玉牒底部，纯文本，无高亮） ──
    var destiny = calcDestiny(IDENTITY)
    drawText(ctx, destiny.title, jx + jw / 2, l.destinyTitleY, {
      fontSize: l.destinyS, color: '#d0dcc8',
      align: 'center', baseline: 'middle', opacity: nOp * 0.40,
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
    })
    drawText(ctx, destiny.guide, jx + jw / 2, l.destinyGuideY, {
      fontSize: Math.floor(l.destinyS * 0.85), color: '#c0d0b8',
      align: 'center', baseline: 'middle', opacity: nOp * 0.25,
    })
  }

  // ── 段 2：命格竹简属性（上5下4） ──
  if (nOp > 0.4) {
    var allAttrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    var headH = Math.floor(l.slipH * 0.18)  // 朱红签头高度
    var bodyH = l.slipH - headH

    // 上排 5 片
    for (var si = 0; si < l._topN; si++) {
      var attrIdx = si
      var sx = l.slip1Starts[si]
      var name = allAttrOrder[attrIdx]
      var val = IDENTITY[name] || 0
      var isZero = (val === 0)
      var sw = l.topSlipW

      drawSlip(ctx, sx, l.slip1Y, sw, l.slipH, headH, bodyH, name, val, isZero, nOp * 0.90, l.attrNameS, l.attrValS)
    }

    // 下排 4 片
    for (var si = 0; si < l._botN; si++) {
      var attrIdx = l._topN + si
      var sx = l.slip2Starts[si]
      var name = allAttrOrder[attrIdx]
      var val = IDENTITY[name] || 0
      var isZero = (val === 0)
      var sw = l.botSlipW

      drawSlip(ctx, sx, l.slip2Y, sw, l.slipH, headH, bodyH, name, val, isZero, nOp * 0.90, l.attrNameS, l.attrValS)
    }
  }

  // ── 段 3：朱砂印"开局" ──
  var yOp = anims.seal.update(now)
  if (yOp > 0) {
    var stampW = 56, stampH = 44
    var stampX = cx - stampW / 2, stampY = l.btnY - stampH / 2

    ctx.save()
    ctx.globalAlpha = yOp * 0.88
    ctx.shadowColor = 'rgba(200,58,46,0.3)'
    ctx.shadowBlur = 8
    ctx.fillStyle = COLORS.vermillion
    roundRect(ctx, stampX, stampY, stampW, stampH, 4)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = yOp * 0.60
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 0.8
    roundRect(ctx, stampX + 3, stampY + 3, stampW - 6, stampH - 6, 2)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = yOp * 0.85
    ctx.translate(cx, l.btnY + 1)
    ctx.rotate(-0.04)
    drawText(ctx, '开局', 0, 0, {
      fontSize: Math.min(15, Math.floor(l.cardH * 0.065)),
      fontFamily: '"STKaiti", "KaiTi", "楷体", serif',
      color: '#fff', align: 'center', baseline: 'middle', letterSpacing: 4,
    })
    ctx.restore()

    // 印章小点
    ctx.save()
    ctx.globalAlpha = yOp * 0.3
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(stampX + stampW - 8, stampY + 5, 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(stampX + 5, stampY + stampH - 8, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// 绘制一片竹简
function drawSlip(ctx, sx, sy, sw, sh, headH, bodyH, name, val, isZero, opacity, nameS, valS) {
  // ── 签头（朱红） ──
  var hg = ctx.createLinearGradient(sx, 0, sx + sw, 0)
  hg.addColorStop(0, '#9a2018')
  hg.addColorStop(0.3, '#c83a2e')
  hg.addColorStop(0.7, '#c83a2e')
  hg.addColorStop(1, '#9a2018')
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = hg
  roundRect(ctx, sx, sy, sw, headH, 1)
  ctx.fill()
  ctx.restore()

  // ── 签头底部金线 ──
  ctx.save()
  ctx.globalAlpha = opacity * 0.10
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = 0.3
  ctx.beginPath()
  ctx.moveTo(sx + 2, sy + headH)
  ctx.lineTo(sx + sw - 2, sy + headH)
  ctx.stroke()
  ctx.restore()

  // ── 签体（竹色） ──
  var bg = ctx.createLinearGradient(sx, 0, sx + sw, 0)
  bg.addColorStop(0, '#b8a880')
  bg.addColorStop(0.15, '#d4c8a8')
  bg.addColorStop(0.5, '#e0d0b0')
  bg.addColorStop(0.85, '#d4c8a8')
  bg.addColorStop(1, '#b8a880')
  ctx.save()
  ctx.globalAlpha = opacity * 0.85
  ctx.fillStyle = bg
  roundRect(ctx, sx, sy + headH, sw, bodyH, 1)
  ctx.fill()
  ctx.restore()

  // ── 竹纹纵线 ──
  ctx.save()
  ctx.globalAlpha = opacity * 0.06
  ctx.strokeStyle = '#6a5a40'
  ctx.lineWidth = 0.3
  ctx.beginPath(); ctx.moveTo(sx + 1, sy + headH); ctx.lineTo(sx + 1, sy + sh - 1); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sx + sw - 1, sy + headH); ctx.lineTo(sx + sw - 1, sy + sh - 1); ctx.stroke()
  ctx.restore()

  // ── 属性名（签头上，白金色小字） ──
  drawText(ctx, name, sx + sw / 2, sy + headH / 2 + 1, {
    fontSize: Math.floor(nameS * 0.85), color: 'rgba(255,230,200,0.65)',
    align: 'center', baseline: 'middle',
    fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
  })

  // ── 属性值（签体上） ──
  var valCX = sx + sw / 2
  var valCY = sy + headH + bodyH * 0.55
  if (isZero) {
    drawText(ctx, '—', valCX, valCY, {
      fontSize: Math.floor(valS * 0.85), color: COLORS.paperDarker,
      align: 'center', baseline: 'middle', opacity: opacity * 0.04,
    })
  } else {
    ctx.save()
    ctx.shadowColor = 'rgba(232,200,130,' + (opacity * 0.10) + ')'
    ctx.shadowBlur = 1.5
    drawText(ctx, val, valCX, valCY, {
      fontSize: valS, color: COLORS.goldLight,
      align: 'center', baseline: 'middle', opacity: opacity * 0.65, bold: true,
    })
    ctx.restore()
  }
}
module.exports = { init, render, onTouch, autoNext: null }
