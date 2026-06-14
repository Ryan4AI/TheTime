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

  // 卡片尺寸（v0.6.5 加大）
  var cardW = Math.floor(w * 0.88)
  var cardH = Math.floor(h * 0.62)
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.16)

  // 1. 顶部：朝代 + 纪年
  var eraS = Math.min(13, Math.floor(w * 0.035))
  var eraY = cardY + Math.floor(cardH * 0.08)

  // 2. 姓名（大字 + 楷体）
  var nameS = Math.min(40, Math.floor(w * 0.105))
  var nameY = eraY + Math.floor(cardH * 0.13)

  // 3. 副标题：阶层+职业+年龄+性别
  var subS = Math.min(13, Math.floor(w * 0.035))
  var subY = nameY + Math.floor(nameS * 0.55) + 4

  // 4. 第一道分割线
  var div1Y = subY + Math.floor(subS * 1.4)

  // 5. 命格标题
  var labelS = Math.min(12, Math.floor(w * 0.032))
  var labelY = div1Y + Math.floor(cardH * 0.06)

  // 6. 4 列属性：名+值
  var attrNameS = Math.min(12, Math.floor(w * 0.032))
  var attrValS = Math.min(20, Math.floor(w * 0.052))     // 数值大
  var attrNameY = labelY + Math.floor(cardH * 0.05)
  var attrValY = attrNameY + Math.floor(attrNameS * 1.6)
  var attrColW = Math.floor((cardW - 60) / 4)

  // 7. 第二道分割线
  var div2Y = attrValY + Math.floor(cardH * 0.06)

  // 8. 庇护层数
  var shieldS = Math.min(12, Math.floor(w * 0.032))
  var shieldY = div2Y + Math.floor(cardH * 0.05)

  // 9. 落笔按钮
  var btnH = Math.floor(cardH * 0.10)
  var btnY = cardY + cardH - Math.floor(cardH * 0.20)
  var btnW = Math.floor(cardW * 0.55)
  var btnX = Math.floor(cx - btnW / 2)

  // 10. 点击提示
  var tapS = Math.min(11, Math.floor(w * 0.030))
  var tapY = cardY + cardH - Math.floor(cardH * 0.05)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    eraS: eraS, eraY: eraY,
    nameS: nameS, nameY: nameY,
    subS: subS, subY: subY,
    div1Y: div1Y,
    labelS: labelS, labelY: labelY,
    attrNameS: attrNameS, attrValS: attrValS,
    attrNameY: attrNameY, attrValY: attrValY,
    attrColW: attrColW,
    div2Y: div2Y,
    shieldS: shieldS, shieldY: shieldY,
    btnH: btnH, btnY: btnY, btnW: btnW, btnX: btnX,
    tapS: tapS, tapY: tapY,
  }
}

function init(items, identity) {
  // v0.6.3 重构：精细化初始属性（阶层/职业/年龄/名人 4 维度）
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    const occ = identity.occupation || ''
    const canRead = !!identity.canRead
    const age = identity.age || 25
    const isCelebrity = !!identity.isCelebrity

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
    let celebBonus = isCelebrity ? 1.5 : 1.0

    // ── 6. 颜值：随机 3000-7000，名人 +30% ──
    let face = 3000 + Math.floor(Math.random() * 4000)
    if (isCelebrity) face = Math.floor(face * 1.3)

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
    set('历史庇护', isCelebrity ? 3 : 0)  // 名人初始 3 层庇护
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

  // ── v0.6.5 新设计：5 段（朝代/姓名/副标题/属性/庇护+按钮）──

  // 段 1：顶部朝代 + 纪年
  var tOp = anims.title.update(now)
  if (tOp > 0 && IDENTITY.dynasty) {
    var era = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    // 去重
    if (era && era.indexOf(IDENTITY.dynasty) === 0) {
      era = era.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    var eraText = era ? IDENTITY.dynasty + ' · ' + era : IDENTITY.dynasty
    // 顶部细线
    ctx.save()
    ctx.globalAlpha = tOp * 0.15
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(l.cardX + 30, l.eraY - 8)
    ctx.lineTo(cx - 40, l.eraY - 8)
    ctx.moveTo(cx + 40, l.eraY - 8)
    ctx.lineTo(l.cardX + l.cardW - 30, l.eraY - 8)
    ctx.stroke()
    ctx.restore()
    drawText(ctx, eraText, cx, l.eraY, {
      fontSize: l.eraS,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: tOp * 0.85,
    })
  }

  // 段 2：姓名（楷体 + 金色光晕）
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    ctx.save()
    ctx.shadowColor = 'rgba(232,200,130,' + (nOp * 0.6) + ')'
    ctx.shadowBlur = 12
    drawText(ctx, IDENTITY.name, cx, l.nameY, {
      fontSize: l.nameS,
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: nOp,
      bold: true,
    })
    ctx.restore()
  }

  // 段 3：副标题（14岁 · 女 · 渔夫）
  var sOp = anims.info.update(now)
  if (sOp > 0) {
    var subParts = []
    if (IDENTITY.age != null) subParts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender) subParts.push(IDENTITY.gender)
    if (IDENTITY.occupation) subParts.push(IDENTITY.occupation)
    if (IDENTITY.socialClass && !IDENTITY.occupation?.includes?.(IDENTITY.socialClass)) {
      subParts.push(IDENTITY.socialClass)
    }
    var subText = subParts.filter(Boolean).join(' · ')
    // 居所单独行（如果存在）
    drawText(ctx, subText, cx, l.subY, {
      fontSize: l.subS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: sOp * 0.8,
    })
    if (IDENTITY.residence) {
      drawText(ctx, '居 · ' + IDENTITY.residence, cx, l.subY + Math.floor(l.subS * 1.4), {
        fontSize: l.subS - 1,
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
        opacity: sOp * 0.65,
      })
    }
  }

  // 段 4：第一道分割线
  if (sOp > 0.5) {
    ctx.save()
    ctx.globalAlpha = (sOp - 0.5) * 0.15
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(l.cardX + 30, l.div1Y)
    ctx.lineTo(l.cardX + l.cardW - 30, l.div1Y)
    ctx.stroke()
    ctx.restore()
  }

  // 段 5：命格标题（4 个属性）
  if (sOp > 0) {
    drawText(ctx, '─ 你的命格 ─', cx, l.labelY, {
      fontSize: l.labelS,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: sOp * 0.7,
    })
  }

  // 段 6：4 列属性
  if (sOp > 0) {
    var attrs = [
      { name: '声望', val: IDENTITY['声望'] || 0 },
      { name: '财富', val: IDENTITY['财富'] || 0 },
      { name: '学识', val: IDENTITY['学识'] || 0 },
      { name: '颜值', val: IDENTITY['颜值'] || 0 },
    ]
    for (var ai = 0; ai < attrs.length; ai++) {
      var col = ai % 4
      var ax = l.cardX + 30 + col * l.attrColW + l.attrColW / 2

      // 属性名（小字）
      drawText(ctx, attrs[ai].name, ax, l.attrNameY, {
        fontSize: l.attrNameS,
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
        opacity: sOp * 0.7,
      })
      // 属性值（金色大字）
      ctx.save()
      ctx.shadowColor = 'rgba(232,200,130,' + (sOp * 0.3) + ')'
      ctx.shadowBlur = 4
      drawText(ctx, attrs[ai].val, ax, l.attrValY, {
        fontSize: l.attrValS,
        color: COLORS.goldLight,
        align: 'center', baseline: 'middle',
        opacity: sOp,
        bold: true,
      })
      ctx.restore()
    }
  }

  // 段 7：第二道分割线
  if (sOp > 0.5) {
    ctx.save()
    ctx.globalAlpha = (sOp - 0.5) * 0.15
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(l.cardX + 30, l.div2Y)
    ctx.lineTo(l.cardX + l.cardW - 30, l.div2Y)
    ctx.stroke()
    ctx.restore()
  }

  // 段 8：庇护层数 + 名人彩蛋
  if (sOp > 0) {
    var shield = IDENTITY['历史庇护'] || 0
    var shieldText = shield > 0
      ? '☯ 庇护层数 ' + shield + ' · 历史名人庇佑'
      : '☯ 庇护层数 0 · 尚未入榜'
    drawText(ctx, shieldText, cx, l.shieldY, {
      fontSize: l.shieldS,
      color: shield > 0 ? COLORS.gold : COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: sOp * 0.8,
    })
    // 名人彩蛋（如果）
    if (IDENTITY.isCelebrity && IDENTITY.figure) {
      drawText(ctx, '✦ 穿越成 ' + IDENTITY.figure, cx, l.shieldY + Math.floor(l.shieldS * 1.6), {
        fontSize: l.shieldS,
        color: COLORS.goldLight,
        align: 'center', baseline: 'middle',
        opacity: sOp,
        bold: true,
      })
    }
  }

  // 段 9：落笔开局按钮
  var yOp = anims.year.update(now)
  if (yOp > 0) {
    ctx.save()
    // 按钮底（暖金半透）
    ctx.globalAlpha = yOp * 0.95
    ctx.fillStyle = 'rgba(60, 45, 30, 0.85)'
    roundRect(ctx, l.btnX, l.btnY, l.btnW, l.btnH, l.btnH / 2)
    ctx.fill()
    // 按钮描边（暗金）
    ctx.globalAlpha = yOp * 0.8
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 1.2
    roundRect(ctx, l.btnX, l.btnY, l.btnW, l.btnH, l.btnH / 2)
    ctx.stroke()
    // 按钮文字（楷体 + 金色光晕）
    ctx.globalAlpha = yOp
    ctx.shadowColor = 'rgba(232,200,130,0.6)'
    ctx.shadowBlur = 8
    drawText(ctx, '落 笔 开 局', cx, l.btnY + l.btnH / 2, {
      fontSize: Math.min(18, Math.floor(l.btnH * 0.55)),
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: yOp,
      bold: true,
    })
    ctx.restore()
  }

  // 段 10：底部点击提示
  if (yOp > 0) {
    drawText(ctx, '· 点击任意处开始 ·', cx, l.tapY, {
      fontSize: l.tapS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: yOp * 0.5,
    })
  }

  // 记录按钮位置（用于触摸检测）
  layout._btnArea = { x: l.btnX, y: l.btnY, w: l.btnW, h: l.btnH }
}
module.exports = { init, render, onTouch, autoNext: null }
