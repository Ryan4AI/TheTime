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
