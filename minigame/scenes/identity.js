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
  var infoY = nameY + Math.floor(nameS * 0.4) + 6

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
  // 属性权重排序
  var sorted = []
  var attrNames = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
  for (var fi = 0; fi < 9; fi++) {
    sorted.push({ name: attrNames[fi], val: attrs[fi] || 0 })
  }
  sorted.sort(function(a,b) { return b.val - a.val })

  var top = sorted[0]
  var top2 = sorted[1]
  var bot = sorted[8]
  var bot2 = sorted[7]

  // 强属性描述
  var strongPhrases = {
    '声望': ['威仪赫赫，名动四方', '声名远播，天下皆知', '一言九鼎，众望所归'],
    '财富': ['富甲一方，金玉满堂', '财源滚滚，富可敌国', '黄金铺地，白银为阶'],
    '学识': ['才高八斗，学富五车', '过目不忘，通晓古今', '博闻强识，满腹经纶'],
    '颜值': ['面若冠玉，风华绝代', '容姿端丽，倾国倾城', '清姿玉质，世所罕见'],
    '医术': ['妙手回春，活死人肉白骨', '岐黄妙手，医道通神', '望闻问切，无不灵验'],
    '战功': ['百战百胜，铁血丹心', '马踏山河，功盖三军', '沙场宿将，战无不克'],
    '文采': ['文思泉涌，下笔如神', '锦绣文章，洛阳纸贵', '诗词歌赋，冠绝当世'],
    '政绩': ['经天纬地，治世能臣', '明察秋毫，政通人和', '运筹帷幄，治国安邦'],
    '义行': ['侠肝义胆，路见不平', '仗义疏财，济困扶危', '一诺千金，义薄云天'],
  }
  var weakPhrases = {
    '声望': ['门庭冷落，无人问津', '声名狼藉，谤满天下', '无名之辈，不足挂齿'],
    '财富': ['囊中羞涩，家徒四壁', '穷困潦倒，身无长物', '贫贱难移，衣不蔽体'],
    '学识': ['目不识丁，愚昧蒙昧', '胸无点墨，浅薄无知', '寡陋孤闻，不学无术'],
    '颜值': ['面目可憎，不堪入目', '形貌猥琐，见者侧目', '其貌不扬，泯然众人'],
    '医术': ['庸医误人，不通医理', '药石罔效，医术粗疏', '歧黄门外，徒增笑耳'],
    '战功': ['手无缚鸡，未谙兵事', '临阵脱逃，胆怯如鼠', '纸上谈兵，不谙战阵'],
    '文采': ['文笔拙劣，辞不达意', '才疏学浅，文墨不通', '言词鄙陋，难登大雅'],
    '政绩': ['碌碌无为，寸功未立', '尸位素餐，政绩全无', '管窥蠡测，难当大任'],
    '义行': ['自私自利，独善其身', '见利忘义，刻薄寡恩', '独来独往，不涉世事'],
  }

  // 特殊判定
  var parts = []

  // 最强属性（> 7000 才算明显）
  if (top.val >= 7000) {
    var tPhrases = strongPhrases[top.name]
    var tIdx = Math.floor(Math.abs(top.val) % tPhrases.length)
    parts.push(tPhrases[tIdx])
  } else if (top.val >= 5000) {
    parts.push('「' + top.name + '」略有根基')
  }

  // 次强（> 6000）
  if (top2.val >= 6000 && top2.name !== top.name) {
    var t2Phrases = strongPhrases[top2.name]
    var t2Idx = Math.floor(Math.abs(top2.val * 7 + 3) % t2Phrases.length)
    parts.push(t2Phrases[t2Idx])
  }

  // 最弱（< 1500 才算明显缺陷）
  if (bot.val <= 1500) {
    var bPhrases = weakPhrases[bot.name]
    var bIdx = Math.floor(Math.abs(bot.val * 3 + 7) % bPhrases.length)
    if (parts.length > 0) {
      parts.push('然「' + bot.name + '」' + bPhrases[bIdx])
    } else {
      parts.push('「' + bot.name + '」' + bPhrases[bIdx])
    }
  } else if (bot.val <= 3000) {
    if (parts.length > 0) {
      parts.push('惟「' + bot.name + '」稍显不足')
    } else {
      parts.push('「' + bot.name + '」为短板')
    }
  }

  // 总评
  var total = 0
  for (var fi = 0; fi < 9; fi++) { total += attrs[fi] || 0 }
  var avg = total / 9

  // 如果所有评价都为空
  if (parts.length === 0) {
    if (avg > 5000) return '平庸之辈，碌碌一生。'
    if (avg > 2000) return '资质平平，无甚可道。'
    return '命如草芥，微末之姿。'
  }

  return parts.join('。') + '。'
}

module.exports = { init, render, onTouch, autoNext: null }
