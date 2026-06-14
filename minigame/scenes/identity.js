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
  var cardH = Math.floor(h * 0.56)  // v0.6.17: 略高以容纳命格段
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.18)

  // ── 名帖一体式头部 ──
  var nameS = Math.min(28, Math.floor(w * 0.072))
  var eraS = Math.min(10, Math.floor(w * 0.026))
  var subS = Math.min(11, Math.floor(w * 0.028))
  var plaquePad = 10
  var plaqueTop = cardY + Math.floor(cardH * 0.04)
  var eraY = plaqueTop + plaquePad + eraS
  var nameY = eraY + eraS + 6
  var subY = nameY + Math.floor(nameS * 0.65) + 3
  var plaqueH = (subY - plaqueTop) + plaquePad

  // 分割线
  var divY = subY + Math.floor(cardH * 0.04)

  // ── 命格段 ──
  var destinyTitleS = Math.min(13, Math.floor(w * 0.033))
  var destinyGuideS = Math.min(9, Math.floor(w * 0.024))
  var destinyTitleY = divY + Math.floor(cardH * 0.05)
  var destinyGuideY = destinyTitleY + Math.floor(destinyTitleS * 1.3) + 4

  // ── 命运签（等宽，独立签，无编绳）──
  var slipPadX = 16
  var slipGap = 5
  var slipN = 9            // 共9片，全部等宽
  var slipW = Math.floor((cardW - slipPadX * 2 - slipGap * (slipN - 1)) / slipN)
  var slipH = Math.min(108, Math.floor(cardH * 0.22))
  var topN = 4, botN = 5
  // 下排（5片）确定左右边界，上排（4片）在相同边界内居中
  var botW = botN * slipW + (botN - 1) * slipGap
  var botS = cx - Math.floor(botW / 2)
  var botRight = botS + botW
  var topW = topN * slipW + (topN - 1) * slipGap
  var topS = botS + Math.floor((botW - topW) / 2)  // 以下排边界为基准居中

  var destinyBot = destinyGuideY + 10
  var slip1Y = destinyBot + 4               // 上排命运签顶部
  var rowGap = 12                           // 两排间距
  var slip2Y = slip1Y + slipH + rowGap     // 下排命运签顶部

  var slip1Starts = []
  for (var s1 = 0; s1 < topN; s1++) slip1Starts.push(topS + s1 * (slipW + slipGap))
  var slip2Starts = []
  for (var s2 = 0; s2 < botN; s2++) slip2Starts.push(botS + s2 * (slipW + slipGap))

  var attrNameS = Math.min(9, Math.floor(w * 0.023))
  var attrValS = Math.min(12, Math.floor(w * 0.031))

  // 朱砂印
  var btnY = cardY + cardH - Math.floor(cardH * 0.10)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH, cardX: cardX, cardY: cardY,
    nameS: nameS, nameY: nameY,
    eraS: eraS, eraY: eraY,
    subS: subS, subY: subY,
    plaqueTop: plaqueTop, plaqueH: plaqueH,
    divY: divY,
    destinyTitleS: destinyTitleS, destinyGuideS: destinyGuideS,
    destinyTitleY: destinyTitleY, destinyGuideY: destinyGuideY,
    slipW: slipW, slipH: slipH,
    slip1Y: slip1Y, slip2Y: slip2Y,
    slip1Starts: slip1Starts, slip2Starts: slip2Starts,
    slipPadX: slipPadX,
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
    set('历史庇护', 0)  // v0.6.6：庇护只通过上榜获得，不靠穿越身份
  }

  // 统一云函数(e.g. generate_identity)和本地引擎的身份数据格式
  if (identity && identity.city) {
    // 云函数格式 → 身份卡格式（v0.6.4 修复：保留所有 v2 属性字段）
    IDENTITY = {
      ...identity,  // v0.6.4：保留声望/财富/学识/颜值/医术/战功/文采/政绩/义行/历史庇护 等
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
      isCelebrity: false,  // v0.6.6：永远不穿越成名人不与榜单冲突
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
    name: new FadeAnim(500, 700),         // 名帖一体（纪年+姓名+副标题+竹排）
    seal: new FadeAnim(1200, 300),        // 朱砂印
  }
  for (var k in anims) anims[k].start(now)
}

function onTouch(x, y, type) {
  if (type !== 'end') return null
  if (!state) return null

  // 首次点击：任意位置可触发（或点击按钮）
  if (!state.hasTapped) {
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

  // 3. 宣纸卡片 + 卷轴装饰
  var cardOp = anims.card.update(now)
  if (cardOp <= 0) { return }

  // ── 卷轴木轴（上下各一） ──
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
  // 轴端装饰
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

  // 卡片外层阴影
  ctx.save()
  ctx.globalAlpha = cardOp
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 3

  // 卡片底——暖色宣纸
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

  // 内层宣纸（稍亮）
  ctx.save()
  ctx.globalAlpha = cardOp * 0.12
  ctx.fillStyle = 'rgba(80,68,55,0.3)'
  roundRect(ctx, l.cardX + 6, l.cardY + 6, l.cardW - 12, l.cardH - 12, 2)
  ctx.fill()
  ctx.restore()

  // 四角装饰（增强版：L形 + 端点金点）
  drawCornerDeco(ctx, l.cardX + 3, l.cardY + 3, l.cardW - 6, l.cardH - 6, 1)
  // 四角金点
  var dotR = 2
  var dotOp = cardOp * 0.30
  var corners = [
    [l.cardX + 3, l.cardY + 3],
    [l.cardX + l.cardW - 3, l.cardY + 3],
    [l.cardX + 3, l.cardY + l.cardH - 3],
    [l.cardX + l.cardW - 3, l.cardY + l.cardH - 3],
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

  // ── v0.6.14 卷轴布局 ──

  // ── 段 1-3：名帖头部（层次化构图） ──
  // 纪年→左上角(小印章感)、姓名→正中大字榜题、副标题→下方左对齐落款
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    // ── 纪年（左上角，极淡，像鉴藏印） ──
    var era = ''
    if (IDENTITY.dynasty) {
      var e = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
      if (e && e.indexOf(IDENTITY.dynasty) === 0) {
        e = e.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
      }
      era = e ? IDENTITY.dynasty + ' · ' + e : IDENTITY.dynasty
    }
    drawText(ctx, era, l.cardX + 24, l.plaqueTop + Math.floor(l.plaqueH/2) - 2, {
      fontSize: Math.floor(l.eraS * 0.85), color: COLORS.gold,
      align: 'left', baseline: 'middle', opacity: nOp * 0.30,
    })

    // ── 姓名（正中榜题大字 + 水墨光晕） ──
    ctx.save()
    var inkR = Math.floor(l.nameS * 3)
    var inkGrad = ctx.createRadialGradient(cx, l.nameY, 0, cx, l.nameY, inkR)
    inkGrad.addColorStop(0, 'rgba(200,168,124,' + (nOp * 0.05) + ')')
    inkGrad.addColorStop(0.4, 'rgba(200,168,124,' + (nOp * 0.015) + ')')
    inkGrad.addColorStop(1, 'rgba(200,168,124,0)')
    ctx.fillStyle = inkGrad
    ctx.beginPath()
    ctx.arc(cx, l.nameY, inkR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.shadowColor = 'rgba(232,200,130,' + (nOp * 0.20) + ')'
    ctx.shadowBlur = 3
    drawText(ctx, IDENTITY.name, cx, l.nameY, {
      fontSize: l.nameS, fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: COLORS.goldLight, align: 'center', baseline: 'middle',
      opacity: nOp * 0.85, bold: true,
    })
    ctx.restore()

    // ── 副标题（下方左对齐，像画作落款） ──
    var parts = []
    if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender === '男') parts.push('儿郎')
    else if (IDENTITY.gender === '女') parts.push('女子')
    if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
    if (IDENTITY.residence) parts.push(IDENTITY.residence)
    drawText(ctx, parts.join(' · '), l.cardX + 24, l.subY, {
      fontSize: l.subS, color: COLORS.paperDarker,
      align: 'left', baseline: 'middle', opacity: nOp * 0.55,
    })

    // ── 极细分割线（不贯穿，以人物为中心左右对称短横） ──
    var divLen = Math.floor(l.cardW * 0.3)
    ctx.save()
    ctx.globalAlpha = nOp * 0.04
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.3
    ctx.beginPath()
    ctx.moveTo(cx - divLen, l.divY)
    ctx.lineTo(cx + divLen, l.divY)
    ctx.stroke()
    ctx.restore()
  }

  // ── 段 4：命格（所有命格统一展示，不高亮不偏袒） ──
  if (nOp > 0.3) {
    var destiny = calcDestiny(IDENTITY)
    // 命格称号（楷体，冷金色，所有命格同样展示）
    ctx.save()
    ctx.globalAlpha = nOp * 0.50
    ctx.fillStyle = COLORS.goldLight
    ctx.font = 'bold ' + l.destinyTitleS + 'px "STKaiti","KaiTi","楷体",' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(destiny.title, cx, l.destinyTitleY)
    ctx.restore()

    // 指引语（中性灰色，具体游戏建议）
    drawText(ctx, destiny.guide, cx, l.destinyGuideY, {
      fontSize: l.destinyGuideS, color: COLORS.paperDarker,
      align: 'center', baseline: 'middle', opacity: nOp * 0.30,
    })
  }

  // ── 段 5：命运签属性（上 4 下 5） ──
  // 每片独立签：朱红签头 + 竹签体 + 微旋转
  if (nOp > 0.5) {
    var allAttrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    var allVals = allAttrOrder.map(function(n) { return IDENTITY[n] || 0 })
    var headH = Math.floor(l.slipH * 0.20)  // 签头高度（红漆部分）
    var rows = [[l.slip1Starts, l._topN, l.slip1Y], [l.slip2Starts, l._botN, l.slip2Y]]

    for (var ri = 0; ri < rows.length; ri++) {
      var starts = rows[ri][0], count = rows[ri][1], slipY = rows[ri][2]
      for (var si = 0; si < count; si++) {
        var attrIdx = ri * 4 + si  // 上排0-3，下排4-8
        var sx = starts[si]
        var name = allAttrOrder[attrIdx]
        var val = allVals[attrIdx]
        var isZero = (val === 0)

        // ── 签头（朱红漆） ──
        var hg = ctx.createLinearGradient(sx, 0, sx + l.slipW, 0)
        hg.addColorStop(0, '#9a2018')
        hg.addColorStop(0.3, '#c83a2e')
        hg.addColorStop(0.7, '#c83a2e')
        hg.addColorStop(1, '#9a2018')
        ctx.globalAlpha = nOp * 0.90
        ctx.fillStyle = hg
        roundRect(ctx, sx, slipY, l.slipW, headH, 1)
        ctx.fill()

        // 签头底部金线
        ctx.globalAlpha = nOp * 0.12
        ctx.strokeStyle = COLORS.gold
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.moveTo(sx + 3, slipY + headH)
        ctx.lineTo(sx + l.slipW - 3, slipY + headH)
        ctx.stroke()

        // ── 签体（竹色） ──
        var bg = ctx.createLinearGradient(sx, 0, sx + l.slipW, 0)
        bg.addColorStop(0, '#b8a880')
        bg.addColorStop(0.15, '#d4c8a8')
        bg.addColorStop(0.5, '#e0d0b0')
        bg.addColorStop(0.85, '#d4c8a8')
        bg.addColorStop(1, '#b8a880')
        ctx.globalAlpha = nOp * 0.85
        ctx.fillStyle = bg
        roundRect(ctx, sx, slipY + headH, l.slipW, l.slipH - headH, 1)
        ctx.fill()

        // ── 竹纹（左右纵线） ──
        ctx.save()
        ctx.globalAlpha = nOp * 0.08
        ctx.strokeStyle = '#6a5a40'
        ctx.lineWidth = 0.3
        ctx.beginPath(); ctx.moveTo(sx + 1.5, slipY + headH); ctx.lineTo(sx + 1.5, slipY + l.slipH - 1); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(sx + l.slipW - 1.5, slipY + headH); ctx.lineTo(sx + l.slipW - 1.5, slipY + l.slipH - 1); ctx.stroke()
        ctx.restore()

        // ── 竹节横纹（2道） ──
        ctx.save()
        ctx.globalAlpha = nOp * 0.05
        ctx.strokeStyle = '#5a4a30'
        ctx.lineWidth = 0.3
        var bodyH = l.slipH - headH
        for (var j = 1; j < 3; j++) {
          ctx.beginPath()
          ctx.moveTo(sx + 2, slipY + headH + bodyH * j / 3)
          ctx.lineTo(sx + l.slipW - 2, slipY + headH + bodyH * j / 3)
          ctx.stroke()
        }
        ctx.restore()

        // ── 属性名（红签头上，白金色小字） ──
        drawText(ctx, name, sx + l.slipW / 2, slipY + headH / 2 + 1, {
          fontSize: Math.floor(l.attrNameS * 0.85), color: 'rgba(255,230,200,0.65)',
          align: 'center', baseline: 'middle',
          fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
        })

        // ── 属性值（签体上） ──
        var valCX = sx + l.slipW / 2
        var valCY = slipY + headH + bodyH * 0.55
        if (isZero) {
          drawText(ctx, '—', valCX, valCY, {
            fontSize: l.attrValS, color: COLORS.paperDarker,
            align: 'center', baseline: 'middle', opacity: nOp * 0.05,
          })
        } else {
          ctx.save()
          ctx.shadowColor = 'rgba(232,200,130,' + (nOp * 0.10) + ')'
          ctx.shadowBlur = 1.5
          drawText(ctx, val, valCX, valCY, {
            fontSize: l.attrValS, color: COLORS.goldLight,
            align: 'center', baseline: 'middle', opacity: nOp * 0.60, bold: true,
          })
          ctx.restore()
        }
      }
    }
  }

  // 段 6：朱砂印"开局"（印章风格）
  var yOp = anims.seal.update(now)
  if (yOp > 0) {
    var stampW = 56
    var stampH = 44
    var stampX = cx - stampW / 2
    var stampY = l.btnY - stampH / 2

    ctx.save()
    // 印章本体——朱砂红，带自然湿度边缘
    ctx.globalAlpha = yOp * 0.88
    ctx.shadowColor = 'rgba(200,58,46,0.3)'
    ctx.shadowBlur = 8
    ctx.fillStyle = COLORS.vermillion
    roundRect(ctx, stampX, stampY, stampW, stampH, 4)
    ctx.fill()
    ctx.restore()

    // 内框（白线）
    ctx.save()
    ctx.globalAlpha = yOp * 0.60
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 0.8
    roundRect(ctx, stampX + 3, stampY + 3, stampW - 6, stampH - 6, 2)
    ctx.stroke()
    ctx.restore()

    // 印章文字（白色，模拟篆刻阴文）
    ctx.save()
    ctx.globalAlpha = yOp * 0.85
    ctx.translate(cx, l.btnY + 1)
    ctx.rotate(-0.04)  // 微倾，如手工盖印
    drawText(ctx, '开局', 0, 0, {
      fontSize: Math.min(15, Math.floor(l.cardH * 0.065)),
      fontFamily: '"STKaiti", "KaiTi", "楷体", serif',
      color: '#fff',
      align: 'center', baseline: 'middle',
      letterSpacing: 4,
    })
    ctx.restore()

    // 印章左下白描小点（仿传统篆刻印边残损）
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
module.exports = { init, render, onTouch, autoNext: null }
