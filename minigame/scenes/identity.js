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

// D049c（2026-06-29 09:31 拍板）：身份生成完调 player_save helper
// 9 属性是新身份的关键数据，跨设备续作必须存云端
// D049d（2026-06-29 09:31 拍板）：删 player_life_cache localStorage 兜底
function identitySaveToCloud(identity) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return
  let openid = null
  try {
    openid = wx.getStorageSync && wx.getStorageSync('openid')
  } catch (e) { /* ignore */ }
  if (!openid) {
    // D049d：没 openid 时不再写 localStorage 兜底
    return
  }

  // 构造 player_life record（IDENTITY 字段 → player_life 字段）
  const player_life = {
    openid: openid,
    life_number: identity.life_number || 1,
    alive: true,  // 身份生成时默认活着
    name: identity.name || '无名',
    gender: (identity.gender === '女' || identity.gender === 'female') ? 'female' : 'male',
    age: identity.age || 25,
    occupation: identity.occupation || 'commoner',
    social_class: identity.socialClass || identity.social_class || 'commoner',
    dynasty: identity.dynasty || '',
    era_display: identity.eraDisplay || '',
    city: identity.city || '某地',
    year: identity.year || 0,
    month: identity.month || 1,
    health: 100,  // 初始健康
    lifespan: identity.lifespan || (55 + Math.floor(Math.random() * 25)),  // 55-80
    reputation: identity['声望'] || 0,
    wealth: identity['财富'] || 0,
    knowledge: identity['学识'] || 0,
    appearance: identity['颜值'] || 0,
    medical: identity['医术'] || 0,
    military: identity['战功'] || 0,
    literary: identity['文采'] || 0,
    political: identity['政绩'] || 0,
    righteous: identity['义行'] || 0,
    current_items: identity.items || [],
    created_at: Date.now(),
    updated_at: Date.now(),
  }
  const player = { _id: openid, life_number: player_life.life_number, created_at: Date.now(), updated_at: Date.now() }
  const narrate_history_list = []  // 身份生成时还没叙事历史

  wx.cloud.callFunction({
    name: 'player_save',
    data: { player, player_life, narrate_history_list },
    success: (res) => {
      if (res && res.result && res.result.success) {
        console.log('[D049c] 身份存档成功, life_number=', player_life.life_number, ' name=', player_life.name)
      } else {
        console.error('[D049c] 身份存档失败:', (res && res.result && res.result.error) || 'unknown')
      }
    },
    fail: (err) => {
      console.error('[D049c] 身份存档失败:', (err && (err.errMsg || err.message)) || 'unknown')
    },
  })
}

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // 卡片尺寸
  var cardW = Math.floor(w * 0.88)
  var cardH = Math.min(Math.floor(Math.max(h * 0.62, h * 0.72 - 10)), Math.floor(h * 0.80))
  var cardX = Math.floor(cx - cardW / 2)
  var cardY = Math.floor(h * 0.16)

  // 1. 顶部纪年（朝代标题）
  var eraS = Math.min(13, Math.floor(w * 0.035))
  var eraY = cardY + Math.floor(cardH * 0.04)

  // 2. 基础信息行（含姓名·年齿·身份·居所）— 14px展宽
  var infoS = Math.min(14, Math.floor(w * 0.036))
  var infoY = eraY + Math.floor(eraS * 1.8) + 8

  // 3. 分割线（小屏紧凑/大屏文书双行）
  var compactInfo = h < 540
  var divY = compactInfo ? (infoY + Math.floor(infoS * 1.4)) : (infoY + Math.floor(infoS * 1.7) * 2 + 6)

  // v0.6.74: 命格区域整体设计（标题+大雷达+命签诗做一体）
  var radarR = Math.min(48, Math.max(32, Math.floor(h * 0.080)))
  var radarCX = cx
  var radarCY = divY + radarR + 44      // 44px: 标题(13px) + 下间距12px + 标签偏移(6px) + 标签半高(5px) + 8px额外
  var labelDist = radarR + 8             // 距雷达顶点8px，避免标签压九边形边
  var titleY = divY + 10                 // 标题基线（13px楷体，baseline middle）

  // 雷达→诗紧凑排列，4px间隙
  var btnH = Math.floor(cardH * 0.10)
  var btnY = cardY + cardH - Math.floor(cardH * 0.20)
  var btnW = Math.floor(cardW * 0.55)
  var btnX = Math.floor(cx - btnW / 2)
  var poemY = radarCY + radarR + labelDist + 4  // 诗紧贴雷达标签下方
  var poemS = Math.min(14, Math.max(11, Math.floor((btnY - poemY) / 3)))

  // 命格区域（标题+雷达+诗）整体垂直居中于分割线和按钮之间
  var unitEnd = poemY + 19 + poemS
  var unitSlack = (btnY - divY) - (unitEnd - divY)
  if (unitSlack > 4) {
    var shift = Math.floor(unitSlack / 2)
    titleY += shift
    radarCY += shift
    poemY += shift
  }

  var tailS = Math.min(10, Math.floor(w * 0.028))
  var tailY = cardY + cardH - Math.floor(cardH * 0.19)

  // 7. 点击提示
  var tapS = Math.min(11, Math.floor(w * 0.030))
  var tapY = cardY + cardH - Math.floor(cardH * 0.04)

  layout = {
    w: w, h: h, cx: cx,
    cardW: cardW, cardH: cardH,
    cardX: cardX, cardY: cardY,
    infoS: infoS, infoY: infoY,
    eraS: eraS, eraY: eraY,
    divY: divY,
    radarR: radarR, radarCX: radarCX, radarCY: radarCY,
    labelDist: labelDist,
    poemS: poemS, poemY: poemY,
    titleY: titleY,
    tailS: tailS, tailY: tailY,
    btnH: btnH, btnY: btnY, btnW: btnW, btnX: btnX,
    tapS: tapS, tapY: tapY,
  }
}

function init(items, identity) {
  // D049b 阶段 1（2026-06-29 01:42 拍板）：wx.login 拿 openid，存 storage 备用
  // 先生有存档时后续 D049b 阶段 2 调 player_load 用
  if (typeof wx !== 'undefined' && wx.login) {
    try {
      wx.login({
        success: (res) => {
          if (res && res.code) {
            if (typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('wx_login_code', res.code)
              console.log('[D049b] wx.login code 长度=', res.code.length)
            }
          }
        },
        fail: (err) => {
          console.error('[D049b] wx.login 失败:', err && (err.errMsg || err.message))
        }
      })
    } catch (e) {
      console.error('[D049b] wx.login 异常:', e.message)
    }
  }

  // D049b 阶段 2（2026-06-29 02:02 拍板）：异步调 player_load 检查存档
  // 找到存档：标志位 cloudSaveFound = true（onTouch 时直接进 game 跳过身份生成）
  // 没找到：标志位 false（走原 generate_identity 流程）
  // 注意：player_load 是异步，IDENTITY 生成不能 await，先生点"开始"时再判断
  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction && !identity) {
    try {
      wx.cloud.callFunction({
        name: 'player_load',
        data: {},
        success: (res) => {
          const r = (res && res.result) || {}
          if (r.success && r.player_life) {
            // 找到存档：存到全局 state，云端 openid 对应存档
            console.log('[D049b] player_load 找到存档, life_number=', r.player.life_number, ' alive=', r.player_life.alive)
            if (typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('cloud_save_data', {
                player: r.player,
                player_life: r.player_life,
                narrate_history: r.narrate_history_list || []
              })
            }
          } else {
            console.log('[D049b] player_load 无存档或失败:', r.error || 'no_player')
            if (typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('cloud_save_data', null)
            }
          }
        },
        fail: (err) => {
          console.error('[D049b] player_load 失败:', err && (err.errMsg || err.message))
          if (typeof wx.setStorageSync === 'function') {
            wx.setStorageSync('cloud_save_data', null)
          }
        }
      })
    } catch (e) {
      console.error('[D049b] player_load 异常:', e.message)
    }
  }

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

  // v3.0.35: 删 deathCause 字段·legacy = { epRecord, epitaph }
  // 兼容老格式（legacy 是字符串）→ 自动迁移到 epitaph
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    var rebirth = wx.getStorageSync('rebirth')
    if (rebirth) {
      IDENTITY.life_number = rebirth.life_number || 1
      IDENTITY.historical_shelter = rebirth.historical_shelter || 0
      if (typeof rebirth.legacy === 'string') {
        // 老格式：legacy 是一句墓志铭
        IDENTITY.legacy = {
          epRecord: '',
          epitaph: rebirth.legacy,
        }
      } else if (rebirth.legacy && typeof rebirth.legacy === 'object') {
        // 新格式：legacy 是两字段
        IDENTITY.legacy = {
          epRecord: rebirth.legacy.epRecord || '',
          epitaph: rebirth.legacy.epitaph || '',
        }
      } else {
        IDENTITY.legacy = { epRecord: '', epitaph: '' }
      }
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
    // D049b 阶段 2（2026-06-29 02:02 拍板）：点击时检查云端存档
    // 如果有存档且 alive=true，直接跳过身份生成进 game
    var cloudSave = null
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        cloudSave = wx.getStorageSync('cloud_save_data')
      }
    } catch (e) { /* ignore */ }
    if (cloudSave && cloudSave.player && cloudSave.player_life && cloudSave.player_life.alive) {
      // 有存档 → 把 player_life 转成 identity 格式直接进 game
      var life = cloudSave.player_life
      var restoredIdentity = {
        life_number: life.life_number,
        name: life.name,
        gender: life.gender,
        age: life.age,
        occupation: life.occupation,
        social_class: life.social_class,
        dynasty: life.dynasty,
        eraDisplay: life.era_display,
        city: life.city,
        year: life.year,
        // 9 属性
        '声望': life.reputation,
        '财富': life.wealth,
        '学识': life.knowledge,
        '颜值': life.appearance,
        '医术': life.medical,
        '战功': life.military,
        '文采': life.literary,
        '政绩': life.political,
        '义行': life.righteous,
        // 标记：来自云端
        fromCloud: true,
        cloudPlayer: cloudSave.player,
        cloudNarrateHistory: cloudSave.narrate_history || [],
      }
      console.log('[D049b] 使用云端存档, life=', life.life_number, ' name=', life.name)
      IDENTITY = restoredIdentity
    } else {
      // D049c（2026-06-29 09:31 拍板）：身份生成完（9 属性赋值后）自动存档
      // 先生 9 属性是新身份的关键数据，跨设备续作必须存云端
      identitySaveToCloud(IDENTITY)
    }
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

    // ── v0.6.71 重构：纪年(顶) → 姓名 → 信息 → 分割线 → 命格属性雷达 → 两句联 → 按钮 ──

  // 段 0：顶部纪年
  var nOp = anims.name.update(now)
  if (nOp > 0 && IDENTITY.dynasty) {
    var eraDisp = IDENTITY.eraDisplay || IDENTITY.eraLabel || ''
    if (eraDisp && eraDisp.indexOf(IDENTITY.dynasty) === 0) {
      eraDisp = eraDisp.slice(IDENTITY.dynasty.length).replace(/^[·\s]*/, '')
    }
    var eraTitle = eraDisp ? IDENTITY.dynasty + ' · ' + eraDisp : IDENTITY.dynasty
    ctx.save()
    ctx.globalAlpha = nOp * 0.7
    ctx.fillStyle = 'rgba(210,185,140,0.7)'
    ctx.font = '13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('— ' + eraTitle + ' —', cx, l.eraY)
    ctx.restore()
  }

  // 段 1：姓名已合并进下方信息区，不再独立渲染

  // 段 2：古代身份文书样式（双行居中：姓名·年齿 / 身份·居所；小屏紧凑单行）
  var iOp = anims.info.update(now)
  if (iOp > 0) {
    ctx.font = l.infoS + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.textBaseline = 'middle'

    var compact = l.h < 540
    var vCol = 'rgba(215,200,175,' + (iOp * 0.85) + ')'

    if (compact) {
      // 紧凑单行：姓名·年齿·身份·居所
      var parts = []
      var nameLabel = IDENTITY.gender === '女' ? '小字' : '姓名'
      parts.push(nameLabel + '：' + IDENTITY.name)
      parts.push('年齿：' + IDENTITY.age + '岁')
      parts.push(IDENTITY.occupation || '庶民')
      parts.push(IDENTITY.residence || '不详')
      var text = parts.join(' · ')
      ctx.textAlign = 'center'
      ctx.fillStyle = vCol
      ctx.fillText(text, l.cx, l.infoY)
    } else {
      // 大屏双行文书（居中对称）
      var halfW = Math.floor(l.cardW * 0.14)
      var r1Y = l.infoY - 2
      var r2Y = l.infoY + Math.floor(l.infoS * 1.6) - 2
      var nameLabel = IDENTITY.gender === '女' ? '小字' : '姓名'
      var gender = IDENTITY.gender || '男'

      ctx.textAlign = 'center'
      ctx.fillStyle = vCol
      ctx.fillText(nameLabel + '：' + IDENTITY.name, l.cx - halfW, r1Y)
      ctx.fillText('年齿：' + IDENTITY.age + '岁', l.cx + halfW, r1Y)
      ctx.fillText('身份：' + (IDENTITY.occupation || '庶民'), l.cx - halfW, r2Y)
      ctx.fillText('居所：' + (IDENTITY.residence || '不详'), l.cx + halfW, r2Y)
    }
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

    // v0.6.74: 雷达图（标题13px+大雷达+两句联紧凑）
  if (iOp > 0 && l.radarR > 0) {
    // 标题：命格（13px淡金，夹在分割线与雷达顶点之间）
    ctx.save()
    ctx.globalAlpha = iOp * 0.45
    ctx.fillStyle = 'rgba(200,168,124,0.6)'
    ctx.font = '13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('— 你的命格属性 —', cx, l.titleY)
    ctx.restore()

    // 雷达图
    var rKeys = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
    var rVals = rKeys.map(function(k) { return IDENTITY[k] || 0 })
    ui.drawRadarEdges(ctx, l.radarCX, l.radarCY, l.radarR, rVals)

    // 属性标签 + 数值（属性名在上，数字在下，统一垂直排列）
    ctx.save()
    for (var ri = 0; ri < 9; ri++) {
      var a = -Math.PI / 2 + (ri + 0.5) * (Math.PI * 2) / 9
      var cosA = Math.cos(a), sinA = Math.sin(a)
      var ld = l.labelDist
      var lx = l.radarCX + ld * cosA
      var ly = l.radarCY + ld * sinA
      var rn = rKeys[ri]
      var rv = rVals[ri]
      // 属性名（沿径向向外偏移6px）
      ctx.fillStyle = 'rgba(170,210,180,0.65)'
      ctx.font = '10px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(rn, lx + cosA * 6, ly + sinA * 6)
      // 数值（属性名下边，垂直偏移11px）
      var valAlpha = 0.25 + Math.min(1, rv / 8000) * 0.4
      ctx.fillStyle = 'rgba(210,180,130,' + valAlpha + ')'
      ctx.font = '11px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      ctx.fillText(rv, lx + cosA * 6, ly + sinA * 6 + 11)
    }
    ctx.restore()

    // 命签诗（两句联，14px楷体）
    var poemLines = genFatePoem(rVals)
    ctx.save()
    ctx.globalAlpha = iOp * 0.5
    ctx.shadowColor = 'rgba(200,168,124,0.08)'
    ctx.shadowBlur = 4
    ctx.fillStyle = 'rgba(210,180,130,0.55)'
    ctx.font = l.poemS + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(poemLines[0], cx, l.poemY)
    if (poemLines.length > 1) {
      ctx.fillText(poemLines[1], cx, l.poemY + 19)
    }
    ctx.restore()
  }  // 雷达图+诗结束

  // 段 4：落笔开局按钮
  var yOp = anims.year.update(now)
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
      fontFamily: '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily,
      fontSize: Math.min(18, Math.floor(l.btnH * 0.55)),
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: yOp,
      bold: true,
    })
    ctx.restore()
  }

  // 段 5：底部点击提示
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
function genFatePoem(attrs) {
  // v0.6.70: 五言命签联（两句联，每句10字=两联拼合，14px展示）
  return genCouplet(attrs)
}

function genCouplet(attrs) {
  var sorted = []
  var attrNames = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
  for (var fi = 0; fi < 9; fi++) {
    sorted.push({ name: attrNames[fi], val: attrs[fi] || 0 })
  }
  sorted.sort(function(a,b) { return b.val - a.val })

  var top = sorted[0]
  var top2 = sorted[1]
  var bot = sorted[8]
  var total = 0
  for (var fi = 0; fi < 9; fi++) { total += attrs[fi] || 0 }
  var avg = total / 9

  // 诗体判定（同前）
  var archetype = 'ping'
  if (top.val >= 7000) {
    if (top.name === '战功') archetype = 'war'
    else if (top.name === '文采') archetype = 'wen'
    else if (top.name === '学识') archetype = 'xue'
    else if (top.name === '财富') archetype = 'cai'
    else if (top.name === '医术') archetype = 'yi'
    else if (top.name === '声望' || top.name === '政绩') archetype = 'gui'
    else if (top.name === '颜值') archetype = 'yan'
    else if (top.name === '义行') archetype = 'shan'
  } else if (avg <= 1500) {
    archetype = 'gu'
  }

  // 两句联诗库（每联10字=两五言句拼合）
  var COUPLETS = {
    war: [
      ['铁甲裂寒霜 金戈指八荒', '百战功名在 一杯黄土香'],
      ['大漠孤烟直 长河落日圆', '将军百战后 独坐数寒更'],
      ['马踏天山雪 弓惊瀚海云', '封侯非我愿 但愿海波平'],
    ],
    wen: [
      ['笔落惊风雨 词成动鬼神', '文章千古事 得失寸心知'],
      ['墨洒春江月 诗成白玉楼', '才名冠天下 知己有几人'],
      ['一纸风云起 万古姓名标', '文星高照处 寂寞是归潮'],
    ],
    xue: [
      ['寒窗十年苦 青灯一盏明', '胸中藏万卷 不羡世间名'],
      ['青简堆千卷 白首穷一经', '书中天地阔 门外日西沉'],
      ['博览古今事 通晓天地机', '但求明至理 何必万户侯'],
    ],
    cai: [
      ['金樽盛明月 玉盏满珠玑', '富贵如云散 终归一捧泥'],
      ['铜山连海起 珠履踏金阶', '莫羡朱门富 黄粱梦已歇'],
      ['千斛明珠聚 万贯铜钱堆', '聚散如潮水 去留两不知'],
    ],
    yi: [
      ['采药深山里 悬壶济世来', '回春有妙手 阎王也徘徊'],
      ['金针驱病厄 草木有灵心', '但求人无恙 不慕千金裘'],
      ['青囊藏妙诀 白药化玄机', '扁鹊重生日 苍生免苦凄'],
    ],
    gui: [
      ['紫绶三公印 朱衣九卿冠', '庙堂高百尺 一步一霜寒'],
      ['明镜悬高堂 清风拂玉阶', '治国如烹鲜 天下望甘霖'],
      ['金殿风云变 玉墀霜雪深', '一朝权在手 万古名在襟'],
    ],
    yan: [
      ['玉质生尘外 仙姿落凡间', '花容终有尽 空惹世人怜'],
      ['桃面羞春月 柳眉笼晓烟', '倾城复倾国 红颜薄命签'],
      ['芙蓉出水净 牡丹映日红', '风华绝代后 零落已成空'],
    ],
    shan: [
      ['古道照肝胆 侠气满乾坤', '千金散尽日 天地一孤村'],
      ['仗剑行江湖 济困不言苦', '但行仁义事 莫问前程路'],
      ['路见不平事 拔剑为苍生', '此身虽草莽 义气贯长虹'],
    ],
    gu: [
      ['风中一落叶 水上几浮萍', '命薄如秋纸 来去两无凭'],
      ['寒灯照孤影 冷雨打寒窗', '此生无多路 何处是归程'],
      ['枯木依寒岩 霜风摧苦颜', '人生如大梦 醒后已无言'],
    ],
    ping: [
      ['春来花自放 秋去叶飘零', '人生天地间 忽如远行客'],
      ['柴门闻犬吠 风雪夜归人', '碌碌平生事 一笑了红尘'],
      ['晨起理荒秽 月下话桑麻', '此身虽是客 也向人间行'],
    ],
  }

  var pool = COUPLETS[archetype] || COUPLETS.ping
  var idx = Math.floor(Math.abs(top.val * (attrs[1]||1) * 7 + 31) % pool.length)
  return pool[idx]
}

module.exports = { init, render, onTouch, autoNext: null }
