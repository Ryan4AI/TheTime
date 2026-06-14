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

  // 6. 3×3 九属性网格：名+值
  var attrNameS = Math.min(12, Math.floor(w * 0.032))
  var attrValS = Math.min(20, Math.floor(w * 0.052))     // 数值大
  var attrNameY = labelY + Math.floor(cardH * 0.05)
  var attrValY = attrNameY + Math.floor(attrNameS * 1.6)
  var attrRowH = Math.floor(48 * w / 390)
  var attrColW = Math.floor((cardW - 60) / 3)

  // 7. 第二道分割线
  var div2Y = attrValY + attrRowH * 2 + Math.floor(cardH * 0.06)

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
    attrRowH: attrRowH,
    attrColW: attrColW,
    div2Y: div2Y,
    shieldS: shieldS, shieldY: shieldY,
    btnH: btnH, btnY: btnY, btnW: btnW, btnX: btnX,
    tapS: tapS, tapY: tapY,
  }
}

function init(items, identity) {
  // v0.6.31：科学属性生成模型
  // 阶层→总能力预算，职业→分配权重，年龄→分项微调
  if (identity) {
    const sc = identity.socialClass || identity.social_class || '庶人'
    const occ = identity.occupation || ''
    const canRead = !!identity.canRead
    const age = identity.age || 25

    // ── 1. 阶层能力预算 ──
    var budget = 8000
    if (sc.indexOf('贵') >= 0 || sc.indexOf('皇') >= 0 || sc.indexOf('公') >= 0 || sc.indexOf('侯') >= 0 || sc.indexOf('伯') >= 0 || sc.indexOf('大夫') >= 0 || sc.indexOf('宗') >= 0) {
      budget = 12000  // 贵族：资源最优
    } else if (sc.indexOf('官') >= 0 || sc.indexOf('士') >= 0 || sc.indexOf('举') >= 0 || sc.indexOf('进士') >= 0) {
      budget = 10000  // 士族：教育充裕
    } else if (sc.indexOf('商') >= 0 || sc.indexOf('贾') >= 0) {
      budget = 11000  // 商人：财富充裕但偏科
    } else if (sc.indexOf('贱') >= 0 || sc.indexOf('奴') >= 0 || sc.indexOf('婢') >= 0 || sc.indexOf('仆') >= 0) {
      budget = 6000   // 贱籍：起点最低
    }
    // 预算波动 ±10%
    budget = Math.floor(budget * (0.9 + Math.random() * 0.2))

    // ── 2. 职业权重分布（不设默认 sum=1，运行时归一化）──
    // 权重概念：该职业在某属性上的发育潜力
    // 3.0 = 顶尖，1.0 = 一般水平，0.2 = 几乎不涉猎
    var occProfiles = [
      { rx: /医|药|针灸|郎中/, w: { 声望:0.3, 财富:0.3, 学识:0.6, 颜值:0.3, 医术:2.8, 战功:0, 文采:0.2, 政绩:0.1, 义行:0.5 }},
      { rx: /将|兵|军|武|侠|卒/, w: { 声望:0.8, 财富:0.2, 学识:0.2, 颜值:0.4, 医术:0.3, 战功:2.8, 文采:0, 政绩:0.5, 义行:0.5 }},
      { rx: /书|诗|文|画|儒|墨|秀才/, w: { 声望:0.5, 财富:0.1, 学识:1.2, 颜值:0.3, 医术:0.1, 战功:0, 文采:2.8, 政绩:0.3, 义行:0.1 }},
      { rx: /官|府|县|尹|令|相|卿/, w: { 声望:1.0, 财富:0.4, 学识:0.6, 颜值:0.2, 医术:0.1, 战功:0, 文采:0.5, 政绩:2.8, 义行:0.3 }},
      { rx: /商|贾|贩/, w: { 声望:0.6, 财富:2.8, 学识:0.2, 颜值:0.3, 医术:0.1, 战功:0, 文采:0.1, 政绩:0.4, 义行:0.1 }},
      { rx: /僧|道|观/, w: { 声望:0.4, 财富:0.1, 学识:0.8, 颜值:0.2, 医术:0.4, 战功:0, 文采:0.3, 政绩:0.1, 义行:1.0 }},
      { rx: /渔|猎|樵|牧/, w: { 声望:0.1, 财富:0.3, 学识:0.1, 颜值:0.4, 医术:0.2, 战功:0.4, 文采:0, 政绩:0, 义行:0.4 }},
      { rx: /农|耕|田/, w: { 声望:0.1, 财富:0.2, 学识:0.1, 颜值:0.4, 医术:0.2, 战功:0, 文采:0, 政绩:0, 义行:0.3 }},
      { rx: /匠|工|作|造|铸|建|织|染|缝|陶|窑/, w: { 声望:0.3, 财富:0.3, 学识:0.1, 颜值:0.3, 医术:0.1, 战功:0, 文采:0, 政绩:0, 义行:0.2 }},
      // 兜底：奴婢/其他
      { w: { 声望:0.1, 财富:0.1, 学识:0.1, 颜值:0.2, 医术:0.1, 战功:0, 文采:0, 政绩:0, 义行:0.1 }},
    ]
    var profile = occProfiles[occProfiles.length - 1]  // 兜底
    for (var pi = 0; pi < occProfiles.length - 1; pi++) {
      if (occ.search(occProfiles[pi].rx) >= 0) { profile = occProfiles[pi]; break }
    }

    // ── 3. 归一化权重 ──
    var wSum = 0
    for (var at in profile.w) { if (profile.w.hasOwnProperty(at)) wSum += profile.w[at] }

    // ── 4. 识字基线加成 → 学识+学识权重提升 ──
    var literacyBoost = canRead ? 1.3 : 0.7  // ↑学识权重30% / ↓30%

    // ── 5. 年龄分项调节 ──
    function ageMultFor(a) {
      if (age < 18) return { '声望':0.4, '财富':0.3, '学识':0.6, '颜值':1.4, '医术':0.3, '战功':0.3, '文采':0.5, '政绩':0.2, '义行':0.7 }[a] || 1.0
      if (age < 30) return { '声望':0.7, '财富':0.7, '学识':0.8, '颜值':1.2, '医术':0.7, '战功':0.8, '文采':0.8, '政绩':0.6, '义行':0.9 }[a] || 1.0
      if (age <= 50) return { '声望':1.2, '财富':1.1, '学识':1.1, '颜值':0.7, '医术':1.0, '战功':1.0, '文采':1.1, '政绩':1.3, '义行':1.0 }[a] || 1.0
      if (age <= 60) return { '声望':1.3, '财富':1.1, '学识':1.2, '颜值':0.3, '医术':1.1, '战功':0.6, '文采':1.2, '政绩':1.3, '义行':1.1 }[a] || 1.0
      return { '声望':1.3, '财富':0.9, '学识':1.2, '颜值':0.2, '医术':0.8, '战功':0.3, '文采':1.1, '政绩':1.2, '义行':1.2 }[a] || 1.0
    }

    // ── 6. 综合计算 ──
    var ALL_ATTRS = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    for (var ai = 0; ai < ALL_ATTRS.length; ai++) {
      var an = ALL_ATTRS[ai]
      var w = profile.w[an] / wSum
      // 学识识字加成
      if (an === '学识') w *= literacyBoost
      var raw = budget * w * ageMultFor(an)
      // 随机波动 ±25%（让同职业不千篇一律）
      raw *= 0.75 + Math.random() * 0.5
      identity[an] = Math.max(0, Math.min(10000, Math.floor(raw)))
    }
    identity['历史庇护'] = 0
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

  // 段 6：3×3 全属性网格
  if (sOp > 0) {
    var attrs = [
      { name: '声望', val: IDENTITY['声望'] || 0 },
      { name: '财富', val: IDENTITY['财富'] || 0 },
      { name: '学识', val: IDENTITY['学识'] || 0 },
      { name: '颜值', val: IDENTITY['颜值'] || 0 },
      { name: '医术', val: IDENTITY['医术'] || 0 },
      { name: '战功', val: IDENTITY['战功'] || 0 },
      { name: '文采', val: IDENTITY['文采'] || 0 },
      { name: '政绩', val: IDENTITY['政绩'] || 0 },
      { name: '义行', val: IDENTITY['义行'] || 0 },
    ]
    for (var ai = 0; ai < attrs.length; ai++) {
      var col = ai % 3
      var row = Math.floor(ai / 3)
      var ax = l.cardX + 30 + col * l.attrColW + l.attrColW / 2
      var ay = l.attrNameY + row * l.attrRowH
      var av = l.attrValY + row * l.attrRowH

      // 属性名（小字）
      drawText(ctx, attrs[ai].name, ax, ay, {
        fontSize: l.attrNameS,
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
        opacity: sOp * 0.7,
      })
      // 属性值（金色大字）
      ctx.save()
      ctx.shadowColor = 'rgba(232,200,130,' + (sOp * 0.3) + ')'
      ctx.shadowBlur = 4
      drawText(ctx, attrs[ai].val, ax, av, {
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

  // 段 8：v0.6.7 移除庇护层数（先生拍板"多余概念，去掉"）
  // 用一个简单的朝代纪年行填充原位置
  if (sOp > 0) {
    var tailDynasty = IDENTITY.dynasty || ''
    var tailEra = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    var tailText = tailDynasty && tailEra ? tailDynasty + ' · ' + tailEra : (tailDynasty || tailEra)
    drawText(ctx, tailText, cx, l.shieldY, {
      fontSize: l.shieldS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: sOp * 0.7,
    })
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
