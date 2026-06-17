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
  var cardW = Math.floor(w * 0.88)
  var cardH = Math.floor(h * 0.62)
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.16)

  // 1. 姓名（大字楷体）
  var nameS = Math.min(36, Math.floor(w * 0.095))
  var nameY = cardY + Math.floor(cardH * 0.14)

  // 2. 基础信息行：年龄 · 性别 · 职业 · 居所（统一在一行）
  var infoS = Math.min(12, Math.floor(w * 0.032))
  var infoY = nameY + Math.floor(nameS * 0.65) + 10

  // 3. 分割线
  var divY = infoY + Math.floor(infoS * 1.6)

  // 4. 命格（雷达图）+ 标签
  var labelS = Math.min(11, Math.floor(w * 0.03))
  var labelY = divY + Math.floor(cardH * 0.05)
  var radarR = Math.min(40, Math.floor(cardH * 0.16))
  var radarCX = cx
  var radarCY = labelY + radarR + 20
  var labelDist = radarR + 10  // 标签距离中心

  // 5. 底部纪年（只出现一次）+ 按钮
  var tailS = Math.min(10, Math.floor(w * 0.028))
  var tailY = cardY + cardH - Math.floor(cardH * 0.18)

  // 6. 落笔按钮
  var btnH = Math.floor(cardH * 0.10)
  var btnY = cardY + cardH - Math.floor(cardH * 0.20)
  var btnW = Math.floor(cardW * 0.55)
  var btnX = Math.floor(cx - btnW / 2)

  // 7. 点击提示
  var tapS = Math.min(11, Math.floor(w * 0.030))
  var tapY = cardY + cardH - Math.floor(cardH * 0.05)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    nameS: nameS, nameY: nameY,
    infoS: infoS, infoY: infoY,
    divY: divY,
    labelS: labelS, labelY: labelY,
    radarR: radarR, radarCX: radarCX, radarCY: radarCY,
    labelDist: labelDist,
    tailS: tailS, tailY: tailY,
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
    const age = identity.age != null ? identity.age : 25  // v0.6.50: 0岁不摔进 || 陷阱

    var ALL_ATTRS = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']

    // ── 1. 阶层能力预算 ──
    var budget = 8000
    if (sc.indexOf('贵') >= 0 || sc.indexOf('皇') >= 0 || sc.indexOf('公') >= 0 || sc.indexOf('侯') >= 0 || sc.indexOf('伯') >= 0 || sc.indexOf('大夫') >= 0 || sc.indexOf('宗') >= 0) {
      budget = 12000
    } else if (sc.indexOf('官') >= 0 || sc.indexOf('士') >= 0 || sc.indexOf('举') >= 0 || sc.indexOf('进士') >= 0) {
      budget = 10000
    } else if (sc.indexOf('商') >= 0 || sc.indexOf('贾') >= 0) {
      budget = 11000
    } else if (sc.indexOf('贱') >= 0 || sc.indexOf('奴') >= 0 || sc.indexOf('婢') >= 0 || sc.indexOf('仆') >= 0) {
      budget = 6000
    }
    budget = Math.floor(budget * (0.9 + Math.random() * 0.2))

    // ── 2. 三层独立池模型 ──
    // 天生池(颜值独占) + 生活池(声望财富学识义行) + 专精池(医术战功文采政绩)
    // 三层互不干扰，年龄乘数按池子算
    var PROFILES = {
      '医者': { innate:0.10, life:0.35, skill:0.55, lifeW:{声望:0.20,财富:0.20,学识:0.35,义行:0.25}, skillW:{医术:0.85,文采:0.05,政绩:0.10} },
      '将士': { innate:0.10, life:0.35, skill:0.55, lifeW:{声望:0.30,财富:0.10,学识:0.10,义行:0.50}, skillW:{医术:0.05,战功:0.85,政绩:0.10} },
      '书生': { innate:0.10, life:0.40, skill:0.50, lifeW:{声望:0.15,财富:0.05,学识:0.60,义行:0.20}, skillW:{文采:0.85,政绩:0.15} },
      '官员': { innate:0.10, life:0.30, skill:0.60, lifeW:{声望:0.30,财富:0.20,学识:0.25,义行:0.25}, skillW:{文采:0.05,政绩:0.95} },
      '商贾': { innate:0.10, life:0.60, skill:0.30, lifeW:{声望:0.15,财富:0.60,学识:0.15,义行:0.10}, skillW:{文采:0.05,政绩:0.95} },
      '僧道': { innate:0.10, life:0.40, skill:0.50, lifeW:{声望:0.15,财富:0.05,学识:0.30,义行:0.50}, skillW:{医术:0.30,文采:0.20,政绩:0.50} },
      '渔猎': { innate:0.15, life:0.50, skill:0.35, lifeW:{声望:0.05,财富:0.25,学识:0.05,义行:0.65}, skillW:{医术:0.20,战功:0.60,政绩:0.20} },
      '农夫': { innate:0.15, life:0.75, skill:0.10, lifeW:{声望:0.05,财富:0.20,学识:0.05,义行:0.70}, skillW:{医术:0.50,政绩:0.50} },
      '工匠': { innate:0.12, life:0.73, skill:0.15, lifeW:{声望:0.15,财富:0.30,学识:0.10,义行:0.45}, skillW:{医术:0.40,政绩:0.60} },
      '杂役': { innate:0.15, life:0.77, skill:0.08, lifeW:{声望:0.10,财富:0.15,学识:0.05,义行:0.70}, skillW:{医术:0.50,政绩:0.50} },
    }

    // 正则→profile映射
    var rxMap = [
      {rx: /医|药|针灸|郎中/, k:'医者'},
      {rx: /将|兵|军|武|侠|卒|虎贲|甲士|师旅|御手|车右/, k:'将士'},
      {rx: /书|诗|文|画|儒|墨|秀才|游士|游说|策士|谋士|幕僚|族士/, k:'书生'},
      {rx: /官|府|县|尹|令|相|卿|司[徒空马寇]|内史|太史|法吏|狱掾|郡守|邑[宰胥]|乡[吏绅]|史$|吏$|尉|丞|博士/, k:'官员'},
      {rx: /商|贾|贩|货郎|脚夫/, k:'商贾'},
      {rx: /僧|道|观|卜|祝|祭司|巫|觋|乐师|术士/, k:'僧道'},
      {rx: /渔|猎|樵|牧/, k:'渔猎'},
      {rx: /农|耕|田/, k:'农夫'},
      {rx: /匠|工|作|造|铸|建|织|染|缝|陶|窑|伙夫|膳夫|缀衣|车夫|舟人/, k:'工匠'},
      {rx: /.+/, k:'杂役'},
    ]
    var pf = PROFILES['农夫']
    if (occ) {
      for (var pi = 0; pi < rxMap.length; pi++) {
        if (occ.search(rxMap[pi].rx) >= 0) { pf = PROFILES[rxMap[pi].k]; break }
      }
    }

    // ── 3. 年龄三池乘数 [天生, 生活, 专精] ──
    function poolMuls(a) {
      if (a < 6) return [0.5, 0, 0]
      if (a < 12) return [0.9, 0.15, 0.05]
      if (a < 18) return [1.0, 0.4, 0.25]
      if (a < 30) return [1.0, 0.7, 0.75]
      if (a <= 50) return [0.8, 1.1, 1.1]
      if (a <= 60) return [0.5, 1.15, 1.0]
      return [0.3, 1.0, 0.7]
    }
    var muls = poolMuls(age)

    // ── 4. 属性初始化 ──
    for (var ai = 0; ai < ALL_ATTRS.length; ai++) identity[ALL_ATTRS[ai]] = 0

    // 4a. 天生池 → 颜值
    identity['颜值'] = Math.floor(budget * pf.innate * muls[0] * (0.8 + Math.random() * 0.4))

    // 4b. 生活池 → 声望·财富·学识·义行
    if (muls[1] > 0) {
      var lifePool = budget * pf.life * muls[1]
      var lifeSum = 0; for (var lk in pf.lifeW) lifeSum += pf.lifeW[lk]
      if (lifeSum > 0) {
        for (var lk in pf.lifeW) {
          var lw = pf.lifeW[lk] / lifeSum
          if (lk === '学识') lw *= (canRead ? 1.3 : 0.7)
          identity[lk] = Math.floor(lifePool * lw * (0.75 + Math.random() * 0.5))
        }
      }
    }

    // 4c. 专精池 → 医术·战功·文采·政绩
    if (muls[2] > 0) {
      var skillPool = budget * pf.skill * muls[2]
      var skillSum = 0; for (var sk in pf.skillW) skillSum += pf.skillW[sk]
      if (skillSum > 0) {
        for (var sk in pf.skillW) {
          identity[sk] = Math.floor(skillPool * (pf.skillW[sk] / skillSum) * (0.75 + Math.random() * 0.5))
        }
      }
    }

    // clamp [0, 10000]
    for (var ai = 0; ai < ALL_ATTRS.length; ai++) {
      if (identity[ALL_ATTRS[ai]] > 10000) identity[ALL_ATTRS[ai]] = 10000
    }

  }

  // 统一云函数(e.g. generate_identity)和本地引擎的身份数据格式
  if (identity && identity.city) {
    // 身份卡格式（v0.6.4 修复：保留所有 v2 属性字段）
    IDENTITY = {
      ...identity,  // 保留声望/财富/学识/颜值/医术/战功/文采/政绩/义行 等
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

  // v0.6.50j: 注入轮回数据（死亡页存储，下一世继承）
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    var rebirth = wx.getStorageSync('rebirth')
    if (rebirth) {
      IDENTITY.life_number = rebirth.life_number || 1
      IDENTITY.historical_shelter = rebirth.historical_shelter || 0
      IDENTITY.legacy = rebirth.legacy || ''
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

    // ── v0.6.65 新设计：姓名 → 基础信息 → 雷达图命格 → 纪年 → 按钮 ──

  // 段 1：姓名（大字楷体金色光晕）
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

  // 段 2：基础信息（统一设计：年龄 · 性别 · 职业 · 居所，一行）
  var iOp = anims.info.update(now)
  if (iOp > 0) {
    var parts = []
    if (IDENTITY.age != null) parts.push(IDENTITY.age + '岁')
    if (IDENTITY.gender) parts.push(IDENTITY.gender)
    if (IDENTITY.occupation) parts.push(IDENTITY.occupation)
    if (IDENTITY.residence) parts.push('居' + IDENTITY.residence)
    var infoText = parts.filter(Boolean).join(' · ')
    drawText(ctx, infoText, cx, l.infoY, {
      fontSize: l.infoS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: iOp * 0.8,
    })
  }

  // 段 3：分割线
  if (iOp > 0.5) {
    ctx.save()
    ctx.globalAlpha = (iOp - 0.5) * 0.15
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(l.cardX + 30, l.divY)
    ctx.lineTo(l.cardX + l.cardW - 30, l.divY)
    ctx.stroke()
    ctx.restore()
  }

  // 段 4：命格标题 + 雷达图
  if (iOp > 0) {
    drawText(ctx, '─ 命 格 ─', cx, l.labelY, {
      fontSize: l.labelS,
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: iOp * 0.7,
    })
  }

  // 雷达图
  if (iOp > 0 && l.radarR > 0) {
    var rKeys = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
    var rVals = rKeys.map(function(k) { return IDENTITY[k] || 0 })
    ui.drawRadarEdges(ctx, l.radarCX, l.radarCY, l.radarR, rVals)

    // 属性标签（边中点）
    ctx.save()
    for (var i = 0; i < 9; i++) {
      var a = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2) / 9
      var lx = l.radarCX + l.labelDist * Math.cos(a)
      var ly = l.radarCY + l.labelDist * Math.sin(a)
      ctx.fillStyle = 'rgba(170,210,180,0.65)'
      ctx.font = '8px "STKaiti", "KaiTi", "楷体", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(rKeys[i], lx, ly)
    }
    ctx.restore()
  }

  // v0.6.66: 命格评价（雷达图下方）
  if (iOp > 0 && l.radarR > 0) {
    var evalText = generateFateEval(rVals)
    // 限制长度，防止溢出
    if (evalText.length > 40) evalText = evalText.slice(0, 40) + '…'
    drawText(ctx, evalText, cx, l.radarCY + l.radarR + l.labelDist + 12, {
      fontSize: 9,
      color: 'rgba(200,168,124,0.45)',
      align: 'center', baseline: 'top',
      opacity: iOp * 0.65,
      maxWidth: l.cardW - 80,
    })
  }

  // v0.6.66: 命格评价（雷达图下方）
  if (iOp > 0 && l.radarR > 0) {
    var evalText = generateFateEval(rVals)
    // 限制长度，防止溢出
    if (evalText.length > 40) evalText = evalText.slice(0, 40) + '…'
    drawText(ctx, evalText, cx, l.radarCY + l.radarR + l.labelDist + 12, {
      fontSize: 9,
      color: 'rgba(200,168,124,0.45)',
      align: 'center', baseline: 'top',
      opacity: iOp * 0.65,
      maxWidth: l.cardW - 80,
    })
  }

  // 段 5：底部纪年（只出现一次）
  var yOp = anims.year.update(now)
  if (yOp > 0) {
    var eraText = ''
    if (IDENTITY.dynasty) {
      // v0.6.65: 去重：如果 eraDisplay 已包含朝代，不重复
      var era = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
      if (era && era.indexOf(IDENTITY.dynasty) === 0) {
        era = era.slice(IDENTITY.dynasty.length).replace(/^[·\s]*/, '')
      }
      eraText = era ? IDENTITY.dynasty + ' · ' + era : IDENTITY.dynasty
    }
    drawText(ctx, eraText || '', cx, l.tailY, {
      fontSize: l.tailS,
      color: COLORS.paperDarker,
      align: 'center', baseline: 'middle',
      opacity: yOp * 0.6,
    })
  }

  // 段 6：落笔开局按钮
  if (yOp > 0) {
    ctx.save()
    ctx.globalAlpha = yOp * 0.95
    ctx.fillStyle = 'rgba(60, 45, 30, 0.85)'
    roundRect(ctx, l.btnX, l.btnY, l.btnW, l.btnH, l.btnH / 2)
    ctx.fill()
    ctx.globalAlpha = yOp * 0.8
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 1.2
    roundRect(ctx, l.btnX, l.btnY, l.btnW, l.btnH, l.btnH / 2)
    ctx.stroke()
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

  // 段 7：底部点击提示
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

// v0.6.66: 命格评价（算命式，根据9属性生成）
function generateFateEval(attrs) {
  // v0.6.67: 算命式命格评价——文采、韵脚、意象全面提升
  var sorted = []
  var attrNames = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
  for (var fi = 0; fi < 9; fi++) {
    sorted.push({ name: attrNames[fi], val: attrs[fi] || 0 })
  }
  sorted.sort(function(a,b) { return b.val - a.val })

  var top = sorted[0]
  var top2 = sorted[1]
  var bot = sorted[8]

  // ── 强属性辞赋 ──（各6种，带意象和典故）
  var strongPhrases = {
    '声望': [
      '威名如雷，四海俱惊',
      '一呼百应，天下景从',
      '声振屋瓦，名动公卿',
      '德高望重，泰山北斗',
      '桃李不言，下自成蹊',
      '一言既出，满座皆惊',
    ],
    '财富': [
      '金玉满堂，富埒王侯',
      '铜山金穴，用之不竭',
      '千金散尽，复又重来',
      '堆金积玉，富甲一方',
      '财源广进，日进斗金',
      '珍珠如土，金玉如尘',
    ],
    '学识': [
      '学贯天人之际，通古今之变',
      '才高八斗，胸藏万卷',
      '博闻强识，无所不知',
      '腹有诗书，气度自华',
      '过目成诵，通晓百家',
      '皓首穷经，学问精深',
    ],
    '颜值': [
      '面若冠玉，目若朗星',
      '清姿玉质，出尘脱俗',
      '容光焕发，顾盼生辉',
      '月华为肤，冰雪为骨',
      '一颦一笑，倾倒众生',
      '仪态万方，世所罕见',
    ],
    '医术': [
      '妙手回春，起死回生',
      '望色而知症，切脉可断命',
      '岐黄妙术，通鬼神之机',
      '药到病除，针到痛止',
      '君臣佐使，配伍精妙',
      '悬壶济世，杏林春暖',
    ],
    '战功': [
      '百战百胜，未尝一败',
      '铁马金戈，气吞万里',
      '沙场宿将，威震边关',
      '挽弓三百斤，射石没羽',
      '运筹帷幄，决胜千里',
      '一夫当关，万夫莫开',
    ],
    '文采': [
      '下笔千言，倚马可待',
      '锦绣文章，字字珠玑',
      '诗成惊天地，赋就泣鬼神',
      '文章本天成，妙手偶得之',
      '洛阳纸贵，天下传诵',
      '笔落惊风雨，诗成泣鬼神',
    ],
    '政绩': [
      '经天纬地，治世之才',
      '明镜高悬，政通人和',
      '运筹帷幄，安邦定国',
      '察秋毫之末，断如神之案',
      '抚民如子，治下昇平',
      '拨乱反正，功在社稷',
    ],
    '义行': [
      '侠肝义胆，路见不平拔刀助',
      '仗义疏财，千金散尽济苍生',
      '一诺千金，片言重于九鼎',
      '路不拾遗，夜不闭户',
      '急公好义，扶危济困',
      '舍生取义，杀身成仁',
    ],
  }

  // ── 弱属性警语 ──
  var weakPhrases = {
    '声望': [
      '门可罗雀，无人问津',
      '声名狼藉，为世不齿',
      '籍籍无名，泯然众人',
      '墙倒众人推',
      '人微言轻，不足道也',
      '落毛凤凰不如鸡',
    ],
    '财富': [
      '身无分文，家徒四壁',
      '贫无立锥，衣不蔽体',
      '囊中羞涩，赊借度日',
      '瓦灶绳床，箪食瓢饮',
      '断炊绝粮，朝不保夕',
      '赤贫如洗，一无所余',
    ],
    '学识': [
      '目不识丁，蒙昧无知',
      '胸无点墨，浅薄鄙陋',
      '学疏才浅，孤陋寡闻',
      '井底之蛙，不知天地之大',
      '浑浑噩噩，不辨菽麦',
      '朽木不可雕也',
    ],
    '颜值': [
      '其貌不扬，见之忘俗都难',
      '面目可憎，言语无味',
      '形貌猥琐，不修边幅',
      '獐头鼠目，不堪入目',
      '蓬头垢面，憔悴枯槁',
      '粗服乱头，不掩其陋',
    ],
    '医术': [
      '庸医误诊，草菅人命',
      '药石无功，徒呼奈何',
      '医理不通，歧黄门外',
      '望闻问切，一窍不通',
      '以药试病，十死九伤',
      '认错了是救命，认对了是催命',
    ],
    '战功': [
      '手无缚鸡之力',
      '闻鼓而逃，望风披靡',
      '纸上谈兵，不堪一战',
      '临阵磨枪，仓皇无措',
      '身不能扛，弓不能开',
      '未战先怯，懦弱如鼠',
    ],
    '文采': [
      '文笔拙劣，词不达意',
      '才疏学浅，文墨不通',
      '拾人牙慧，了无新意',
      '言之无物，味同嚼蜡',
      '下笔如钝刀割肉',
      '寻章摘句，老雕虫耳',
    ],
    '政绩': [
      '碌碌无为，寸功未立',
      '尸位素餐，徒耗俸禄',
      '管窥蠡测，难当大任',
      '上行下效，政令不通',
      '疮痍满目，民不聊生',
      '昏聩无能，一事无成',
    ],
    '义行': [
      '各扫门前雪，休管他人瓦上霜',
      '见利忘义，刻薄寡恩',
      '独善其身，不问世事',
      '自私自利，雁过拔毛',
      '事不关己，高高挂起',
      '落井下石，小人行径',
    ],
  }

  // ── 生成评价 ──
  var parts = []

  // 最强属性
  if (top.val >= 7000) {
    var tp = strongPhrases[top.name]
    var ti = Math.floor(Math.abs(top.val * 13 + 41) % tp.length)
    parts.push(tp[ti])
  } else if (top.val >= 5000) {
    parts.push('「' + top.name + '」略有根基')
  }

  // 次强
  if (top2.val >= 6500 && top2.name !== top.name) {
    var t2p = strongPhrases[top2.name]
    var t2i = Math.floor(Math.abs(top2.val * 17 + top.val * 3 + 7) % t2p.length)
    parts.push('更兼' + t2p[t2i])
  } else if (top2.val >= 5000 && top2.name !== top.name) {
    parts.push('「' + top2.name + '」亦有可观')
  }

  // 最弱
  if (bot.val <= 1200) {
    var bp = weakPhrases[bot.name]
    var bi = Math.floor(Math.abs(bot.val * 19 + 53) % bp.length)
    var prefix = parts.length > 0 ? '然' : ''
    parts.push(prefix + '「' + bot.name + '」' + bp[bi])
  } else if (bot.val <= 2500) {
    if (parts.length > 0) {
      parts.push('惟「' + bot.name + '」有所不足')
    } else {
      parts.push('「' + bot.name + '」稍逊一筹')
    }
  }

  var total = 0
  for (var fi = 0; fi < 9; fi++) { total += attrs[fi] || 0 }
  var avg = total / 9

  if (parts.length === 0) {
    if (avg > 5000) return '中人之姿，平淡一生。'
    if (avg > 2000) return '庸碌之辈，不足挂齿。'
    return '微末之命，如草如芥。'
  }

  return parts.join('。') + '。'
}

module.exports = { init, render, onTouch, autoNext: null }
