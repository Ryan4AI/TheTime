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
  var cardW = Math.floor(w * 0.86)
  var cardH = Math.floor(h * 0.54)
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.19)

  // 段 1：纪年（超小金，居中）
  var eraS = Math.min(10, Math.floor(w * 0.026))
  var eraY = cardY + Math.floor(cardH * 0.06)

  // 段 2：姓名
  var nameS = Math.min(28, Math.floor(w * 0.072))
  var nameY = eraY + Math.floor(cardH * 0.12)

  // 段 3：副标题（单行：年龄·职业·居所）
  var subS = Math.min(11, Math.floor(w * 0.028))
  var subY = nameY + Math.floor(nameS * 0.65) + 3

  // 段 4：分割线 + 9 属性 3×3 网格
  var divY = subY + Math.floor(cardH * 0.06)
  var attrNameS = Math.min(10, Math.floor(w * 0.026))
  var attrValS = Math.min(14, Math.floor(w * 0.036))
  var attrGridY = divY + Math.floor(cardH * 0.07)
  var attrRowGap = Math.floor(cardH * 0.10)
  var attrColW = Math.floor((cardW - 48) / 3)
  var attrCellX = [cardX + 24, cardX + 24 + attrColW, cardX + 24 + attrColW * 2]
  var attrCellW = attrColW - 6

  // 段 5：落笔按钮（纯文字）
  var btnY = cardY + cardH - Math.floor(cardH * 0.11)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    eraS: eraS, eraY: eraY,
    nameS: nameS, nameY: nameY,
    subS: subS, subY: subY,
    divY: divY,
    attrNameS: attrNameS, attrValS: attrValS,
    attrGridY: attrGridY, attrRowGap: attrRowGap,
    attrColW: attrColW, attrCellX: attrCellX, attrCellW: attrCellW,
    btnY: btnY,
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

  // ── v0.6.11 重新布局：5 段极简（纪年/姓名/副标题/属性/按钮）──

  // 段 1：纪年（超小金色，无装饰线）
  var tOp = anims.title.update(now)
  if (tOp > 0 && IDENTITY.dynasty) {
    var era = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    if (era && era.indexOf(IDENTITY.dynasty) === 0) {
      era = era.replace(new RegExp('^' + IDENTITY.dynasty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[·\\s]*'), '')
    }
    var eraText = era ? IDENTITY.dynasty + ' · ' + era : IDENTITY.dynasty
    drawText(ctx, eraText, cx, l.eraY, {
      fontSize: l.eraS,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: tOp * 0.65,
    })
  }

  // 段 2：姓名
  var nOp = anims.name.update(now)
  if (nOp > 0) {
    ctx.save()
    ctx.shadowColor = 'rgba(232,200,130,' + (nOp * 0.25) + ')'
    ctx.shadowBlur = 4
    drawText(ctx, IDENTITY.name, cx, l.nameY, {
      fontSize: l.nameS,
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: nOp * 0.85,
      bold: true,
    })
    ctx.restore()
  }

  // 段 3：副标题（单行：年龄·儿郎/女子·职业·居所）
  var sOp = anims.info.update(now)
  if (sOp > 0) {
    var parts = []
    if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender === '男') parts.push('儿郎')
    else if (IDENTITY.gender === '女') parts.push('女子')
    if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
    if (IDENTITY.residence) parts.push(IDENTITY.residence)
    drawText(ctx, parts.join(' · '), cx, l.subY, {
      fontSize: l.subS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: sOp * 0.75,
    })
  }

  // 段 4：分割线 + 9 属性 3×3 网格（v0.6.14 全属性显示）
  if (sOp > 0.5) {
    // 分割线
    ctx.save()
    ctx.globalAlpha = (sOp - 0.5) * 0.12
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(cx - l.attrColW * 0.8, l.divY)
    ctx.lineTo(cx + l.attrColW * 0.8, l.divY)
    ctx.stroke()
    ctx.restore()

    // 9 属性顺序：声望 财富 学识 颜值 医术 战功 文采 政绩 义行
    var attrOrder = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    for (var ai = 0; ai < attrOrder.length; ai++) {
      var key = attrOrder[ai]
      var val = IDENTITY[key] || 0
      var col = ai % 3
      var row = Math.floor(ai / 3)
      var cellCX = l.attrCellX[col] + l.attrCellW / 2
      var cy = l.attrGridY + row * l.attrRowGap
      var isZero = (val === 0)

      // 属性名
      drawText(ctx, key, cellCX, cy, {
        fontSize: l.attrNameS,
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
        opacity: sOp * (isZero ? 0.25 : 0.50),
      })
      // 属性值：非零金色+微光；零值极小浅灰
      if (isZero) {
        drawText(ctx, val, cellCX, cy + Math.floor(l.attrNameS * 1.3), {
          fontSize: l.attrValS,
          color: COLORS.paperDarker,
          align: 'center', baseline: 'middle',
          opacity: sOp * 0.20,
        })
      } else {
        ctx.save()
        ctx.shadowColor = 'rgba(232,200,130,' + (sOp * 0.15) + ')'
        ctx.shadowBlur = 2
        drawText(ctx, val, cellCX, cy + Math.floor(l.attrNameS * 1.3), {
          fontSize: l.attrValS,
          color: COLORS.goldLight,
          align: 'center', baseline: 'middle',
          opacity: sOp * 0.85, bold: true,
        })
        ctx.restore()
      }
    }
  }

  // 段 5：落笔开局（纯文字，无框无装饰）
  var yOp = anims.year.update(now)
  if (yOp > 0) {
    drawText(ctx, '落 笔 开 局', cx, l.btnY, {
      fontSize: Math.min(16, Math.floor(l.cardH * 0.07)),
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: yOp * 0.75,
      bold: true,
    })
  }
}
module.exports = { init, render, onTouch, autoNext: null }
