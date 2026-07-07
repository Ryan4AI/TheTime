// Death scene — 墓碑页（v2.3.0 古墓3D·墓群·划动平移）
// 决策：先生 14:56 拍板
// 设计：主碑（中央·大）+ 随机 4 块（远近·大小不一·3D 透视·有层次感）+ 划动平移视角
// 不再"切碑"——是"在墓园里平移视角"

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, drawButton, hitTest, roundRect } = ui
const { FadeAnim, SlideFadeAnim } = require('../engine/anim')

// ═══════════════════════════════════════════════════════════════
// 模块级变量
// ═══════════════════════════════════════════════════════════════
var layout = {}
var anims = {}
var playerLives = []
// v3.0.2: 行无限延伸·列也无限·网格感但视觉无限
// 数据结构：otherStones[row][col]·row=0 前排最大·row 越大越远越小
// 同排 col 不同大小一样（先生 05:46 要求）
var COLS = 11  // 数据列数（11 块足够循环）
var ROWS = 5   // 数据行数（前排 0 到后排 4）
var otherStones = []        // 二维群碑 otherStones[row][col]
var currentStoneIndex = 0
var ready = false

// 视角平移（双浮点·相机）
var cameraX = 0
var cameraY = 0
var targetCameraX = 0
var targetCameraY = 0
var isUserSwiping = false
// v3.0.2: momentum（松手后惯性滑动·更顺滑）
var velocityX = 0
var velocityY = 0
var lastTouchX = 0
var lastTouchY = 0
var lastTouchTime = 0

var testPoemData = null
function setTestPoemData(d) { testPoemData = d }
function clearTestPoemData() { testPoemData = null }
var testPoemPending = false
var testPoemCase = null
var testPoemLoading = false
var testPoemError = null
var testPoemLoadingStartTime = 0
var legacyDeathState = null
// v3.0.35: 删 legacyDeathCause（deathCause 字段已废弃）
var legacyEpRecord = ''
var legacyHighestAchievement = null

// ═══════════════════════════════════════════════════════════════
// 颜色（古墓 3D·青灰石+白天）
// ═══════════════════════════════════════════════════════════════
// v2.5.1: 米黄宣纸 + 水墨淡色调
const STONE = {
  // 天空（水墨淡蓝灰）
  skyTop: '#a8b0b8',
  skyBottom: '#d8d4cc',
  // 远景山（淡墨色 2 层）
  mountain: 'rgba(60,68,76,0.35)',
  mountainLight: 'rgba(120,128,136,0.25)',
  // 草地（嫩绿）
  groundFar: '#9aac8a',
  ground: '#b8c8a8',
  groundNear: '#a8b898',
  // 主碑（米黄宣纸 + 黑字）
  bodyTop: '#f0e8d4',
  bodyMid: '#d8c8a8',
  bodyShade: '#a89880',
  bodyEdge: '#1a1a18',
  // 庑殿顶（黑色）
  capTop: '#3a3530',
  capShade: '#1a1612',
  // 须弥座（黑色）
  baseTop: '#3a3530',
  baseShade: '#1a1612',
  // 苔藓（淡绿）
  moss: 'rgba(90,120,70,0.4)',
  mossDark: 'rgba(60,90,40,0.5)',
  // 裂纹
  crack: 'rgba(40,30,20,0.25)',
  // 刻字
  carveDark: 'rgba(20,18,12,0.85)',
  // 印章（朱红）
  seal: '#a83a30',
  // 阴影
  shadow: 'rgba(0,0,0,0.18)',
  // 草/花
  grass: 'rgba(120,150,90,0.4)',
  flower: 'rgba(200,150,180,0.6)',
  // 远景墓（淡米灰剪影）
  farStone: 'rgba(180,170,150,0.5)',
  farStoneLight: 'rgba(200,190,170,0.55)',
  midStone: 'rgba(160,150,130,0.7)',
  midStoneLight: 'rgba(180,170,150,0.75)',
  // 按钮
  btn: '#1a1612',
  btnGold: '#8a6a3a',
}

// ═══════════════════════════════════════════════════════════════
// 3D 墓碑纹理（按 seed）
// ═══════════════════════════════════════════════════════════════
function genStoneTexture(seed) {
  var t = { moss: [], cracks: [] }
  var r = function() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  for (var i = 0; i < 3; i++) {
    t.moss.push({
      cx: r() * 0.8 + 0.1, cy: 0.75 + r() * 0.2,
      rx: 6 + r() * 10, ry: 3 + r() * 6,
      type: r() > 0.5 ? 'light' : 'dark',
    })
  }
  for (var j = 0; j < 2; j++) {
    var pts = []
    var sx = 0.2 + r() * 0.6, sy = 0.2 + r() * 0.5
    pts.push({ x: sx, y: sy })
    for (var s = 1; s < 3; s++) {
      var last = pts[pts.length - 1]
      pts.push({ x: last.x + (r() - 0.5) * 0.25, y: last.y + r() * 0.2 })
    }
    t.cracks.push(pts)
  }
  return t
}

// ═══════════════════════════════════════════════════════════════
// 布局
// ═══════════════════════════════════════════════════════════════
function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  var horizonY = Math.floor(h * 0.25)  // v3.0.9: 草地占 3/4 = h × 0.75·horizon 在 h × 0.25
  var mountainH = Math.floor(h * 0.18)

  // 主墓（中央·最大）
  // v3.0.9: 主碑高度 = 草地(0.75) × 1/2 = h × 0.375（主碑占草地 1/2）
  // v3.0.31: 先生 15:53 改"主碑 = 草地 × 2/3" = h × 0.75 × 2/3 = h × 0.5
  var mainH = Math.floor(h * 0.5)
  var mainW = Math.floor(mainH * 0.55)
  var mainX = Math.floor(cx - mainW / 2)
  var mainY = horizonY - Math.floor(mainH * 0.05)

  layout = {
    w: w, h: h, cx: cx,
    horizonY: horizonY, mountainH: mountainH,
    mainW: mainW, mainH: mainH, mainX: mainX, mainY: mainY,
    capH: 30, baseH: 36,
    padX: 16, innerW: mainW - 32,
    innerTopY: mainY + 30 + 14,
    // 字号
    fs: {
      tabletTitle: 17, epitaph: 19, epRecord: 12,
      meta: 12, cause: 12, btn: 14, pagerHint: 10,
    },
    // v3.0.19: 删 backBtn 字段（不再用按钮·改上划返回）
  }
}

// ═══════════════════════════════════════════════════════════════
// 数据
// ═══════════════════════════════════════════════════════════════
function loadPlayerLives() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return []
  try {
    var lives = wx.getStorageSync('lives')
    return Array.isArray(lives) ? lives : []
  } catch (e) { return [] }
}

function saveCurrentLife(lifeData) {
  if (typeof wx === 'undefined' || !wx.setStorageSync) return
  try {
    var lives = loadPlayerLives()
    var exists = false
    for (var i = 0; i < lives.length; i++) {
      if (lives[i].life_number === lifeData.life_number) { exists = true; break }
    }
    if (!exists) { lives.push(lifeData); wx.setStorageSync('lives', lives) }
  } catch (e) {}
}

// 群碑：二维网格 otherStones[row][col]·COLS×ROWS=9×5=45 块
// 主碑在中心 [centerRow][centerCol]·其余 44 块随机
function buildOtherStones(mainStone) {
  // 1. 收集所有可用墓碑（含主碑 + 玩家前世 + 奠基者）
  var pool = []
  // 0. 主碑
  if (mainStone && mainStone.name) pool.push(mainStone)
  // 1. 玩家前几世（除当前外）
  for (var i = 0; i < playerLives.length; i++) {
    if (playerLives[i].name && playerLives[i].name !== (mainStone && mainStone.name)) {
      pool.push({
        name: playerLives[i].name,
        dynasty: playerLives[i].dynasty,
        age: playerLives[i].age,
        epitaph: playerLives[i].epitaph || '',
        epRecord: '',
        deathCause: playerLives[i].deathCause || '',
        occupation: playerLives[i].occupation || '',
        seed: (i + 1) * 137,
      })
    }
  }
  // 2. 奠基者（6 个）
  var foundation = [
    { name: '韩守安', dynasty: '西汉', age: 65, epitaph: '埋骨一生', occupation: '伙夫', deathCause: '老死' },
    { name: '王守诚', dynasty: '南宋', age: 55, epitaph: '南柯一梦', occupation: '商贾', deathCause: '诬以通敌' },
    { name: '沈青禾', dynasty: '北宋', age: 28, epitaph: '以医殉疫', occupation: '女医', deathCause: '疫中殁' },
    { name: '陈伯仁', dynasty: '唐', age: 70, epitaph: '一生长安', occupation: '文士', deathCause: '寿终' },
    { name: '李墨之', dynasty: '明', age: 45, epitaph: '笔落惊风', occupation: '书生', deathCause: '狱中殁' },
    { name: '周素娥', dynasty: '清', age: 60, epitaph: '绣尽平生', occupation: '绣娘', deathCause: '疾终' },
  ]
  for (var fi = 0; fi < foundation.length; fi++) {
    var f = foundation[fi]
    if (pool.find(function(s) { return s.name === f.name })) continue
    pool.push({
      name: f.name, dynasty: f.dynasty, age: f.age,
      epitaph: f.epitaph, epRecord: '',
      deathCause: f.deathCause, occupation: f.occupation,
      seed: (fi + 100) * 251,
    })
  }

  // 3. 填满 COLS×ROWS=55 块（前排 row=0 是主碑区域·后排是远景）
  var grid = []
  var centerCol = Math.floor(COLS / 2)
  for (var r = 0; r < ROWS; r++) {
    grid[r] = []
    for (var c = 0; c < COLS; c++) {
      if (r === 0 && c === centerCol) {
        // 主碑放在前排中心（row=0, col=centerCol）
        grid[r][c] = mainStone && mainStone.name ? mainStone : (pool[0] || { name: '无名', dynasty: '', age: 0, epitaph: '', epRecord: '', deathCause: '', seed: 1 })
      } else {
        // 其他格：从 pool 随机挑（允许重复填满）
        var idx = Math.floor(Math.random() * pool.length)
        var base = pool[idx] || { name: '无名', dynasty: '', age: 0, epitaph: '', epRecord: '', deathCause: '', seed: 1 }
        grid[r][c] = {
          name: base.name,
          dynasty: base.dynasty,
          age: base.age,
          epitaph: base.epitaph,
          epRecord: base.epRecord || '',
          deathCause: base.deathCause || '',
          occupation: base.occupation || '',
          seed: base.seed + r * 7 + c * 13,
        }
      }
    }
  }
  return grid
}

// ═══════════════════════════════════════════════════════════════
// init
// ═══════════════════════════════════════════════════════════════
function init(items, identity, gender) {
  calcLayout()
  ready = false
  // v3.0.5: 清掉 testPoemLoading 状态（避免从 entry.js 切过来时显示"史官落笔中"）
  testPoemLoading = false
  testPoemError = null
  testPoemLoadingStartTime = 0
  testPoemPending = false
  testPoemCase = null
  // v3.0.2: 主碑初始化在前排中心 [row=0][centerCol]
  // 前排视觉最大·主碑 = 前排中心·相机对正它
  var centerCol = Math.floor(COLS / 2)
  cameraX = centerCol
  cameraY = 0  // row=0 = 前排
  targetCameraX = centerCol
  targetCameraY = 0
  isUserSwiping = false
  velocityX = 0
  velocityY = 0

  if (testPoemData) {
    legacyDeathState = testPoemData._deathState || identity || {}
    legacyEpRecord = testPoemData.epRecord || ''
  } else {
    legacyDeathState = identity || {}
    legacyEpRecord = (identity && identity.epRecord) || ''
  }

  playerLives = loadPlayerLives()
  if (legacyDeathState && legacyDeathState.life_number && !testPoemData) {
    var cur = {
      life_number: legacyDeathState.life_number,
      name: legacyDeathState.name,
      gender: legacyDeathState.gender,
      age: legacyDeathState.age,
      dynasty: legacyDeathState.dynasty,
      city: legacyDeathState.city,
      eraDisplay: legacyDeathState.eraDisplay,
      occupation: legacyDeathState.occupation,
      socialClass: legacyDeathState.socialClass,
      epitaph: legacyDeathState.epitaph || '',
      epRecord: legacyDeathState.epRecord || legacyEpRecord,
      deathType: legacyDeathState.deathType || '意外',
      createdAt: Date.now(),
      _isMain: true,
    }
    var exists = false
    for (var j = 0; j < playerLives.length; j++) {
      if (playerLives[j].life_number === cur.life_number) { exists = true; break }
    }
    if (!exists) { saveCurrentLife(cur); playerLives.push(cur) }
  }
  var mainStone = legacyDeathState && legacyDeathState.life_number
    ? { name: legacyDeathState.name, dynasty: legacyDeathState.dynasty, age: legacyDeathState.age,
        epitaph: legacyDeathState.epitaph || '', epRecord: legacyDeathState.epRecord || '',
        occupation: legacyDeathState.occupation || '',
        eraDisplay: legacyDeathState.eraDisplay || '',
        _isMain: true, seed: 999 }
    : null
  otherStones = buildOtherStones(mainStone)

  if (identity && identity.testPoemPending && identity.testPoemCase) {
    testPoemPending = true
    testPoemCase = identity.testPoemCase
    triggerTestPoemCloud()
  }

  var now = Date.now()
  anims = {
    sky: new FadeAnim(100, 600),
    farStones: new FadeAnim(500, 700),
    mainStone: new FadeAnim(900, 700),
    mainText: new FadeAnim(1500, 500),
    btn: new SlideFadeAnim(8, 400, 2100),
  }
  for (var k in anims) anims[k].start(now)

  if (testPoemPending) {
    // ready 由云函数控制
  } else {
    setTimeout(function() { ready = true }, 2500)
  }
}

// ═══════════════════════════════════════════════════════════════
// onTouch（划动 + 按钮）
// ═══════════════════════════════════════════════════════════════
var touchStartX = 0
var touchStartY = 0
var didSwipe = false

function onTouch(x, y, type) {
  if (type === 'start') {
    touchStartX = x; touchStartY = y
    lastTouchX = x; lastTouchY = y; lastTouchTime = Date.now()
    didSwipe = false
    velocityX = 0; velocityY = 0
    return null
  }
  if (type === 'move') {
    if (!ready) return null
    var now = Date.now()
    var dt = Math.max(1, now - lastTouchTime)
    var ddx = x - lastTouchX
    var ddy = y - lastTouchY
    var dx = x - touchStartX
    var dy = y - touchStartY
    // v3.0.2: momentum·记录每帧 delta → 算瞬时速度
    velocityX = ddx / dt * 16  // 归一化到帧
    velocityY = ddy / dt * 16
    lastTouchX = x; lastTouchY = y; lastTouchTime = now

    // v3.0.19: 先生 01:19 拍板上划返回·didSwipe 触发条件扩到横向/纵向任一方向
    if (Math.abs(dx) > 100 || Math.abs(dy) > 100) {
      didSwipe = true
      isUserSwiping = true
      if (Math.abs(dx) > 100) {
        // 横向划动·更新相机
        var deltaX = dx / 900
        if (deltaX > 0.08) deltaX = 0.08
        if (deltaX < -0.08) deltaX = -0.08
        targetCameraX = cameraX - deltaX
      }
      // 纵向划动·end 时再判断上划返回
    }
    return null
  }
  if (type === 'end') {
    isUserSwiping = false
    if (!ready) return null
    // v3.0.19: 先生 01:19 反馈——上划返回主页·删除按钮·文案优化
    // 先检测上划手势（|dy| > 100 且 |dy| > |dx|）→ 跳主页
    if (didSwipe) {
      var dx2 = x - touchStartX
      var dy2 = y - touchStartY
      // 上划判定：垂直距离 > 100 且 垂直 > 水平
      if (Math.abs(dy2) > 100 && Math.abs(dy2) > Math.abs(dx2) * 1.3) {
        // 上划：dy2 < 0（手指从下往上）
        if (dy2 < 0) {
          clearTestPoemData()
          if (typeof wx !== 'undefined' && wx.setStorageSync) {
            wx.removeStorageSync('rebirth')
          }
          return { scene: 'entry' }
        }
      }
      // 左右划：|dx| > 100
      if (Math.abs(dx2) > 100) {
        var direction = dx2 > 0 ? -1 : +1
        var mainIdxX = Math.round(cameraX)
        targetCameraX = mainIdxX + direction
        return null
      }
    }
    // v3.0.0: tap 检测——点中周围 3×3 邻域的墓碑就切换（用 swapToFarStone(col, row)）
    var l = layout
    if (l.farStones && !swapAnimating) {
      for (var fi = 0; fi < l.farStones.length; fi++) {
        var fs = l.farStones[fi]
        if (!fs) continue
        if (x >= fs.x && x <= fs.x + fs.w && y >= fs.y && y <= fs.y + fs.h + 16) {
          swapToFarStone(fs.col, fs.row)
          return null
        }
      }
    }
    return null
  }
  return null
}

// v2.5.3: 自然划动（不 swap 数据·主碑永远画 floor(camX + 0.5)）
// 划动连续·主碑内容随 camX 实时切换
var swapAnimating = false

// v3.0.0: 二维切换（点击某格 → cameraX/Y 平滑滑到目标）
function swapToFarStone(targetCol, targetRow) {
  if (swapAnimating) return
  targetCameraX = targetCol
  targetCameraY = targetRow
  swapAnimating = true
}

// ═══════════════════════════════════════════════════════════════
// render
// ═══════════════════════════════════════════════════════════════
function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 缓动 cameraX / cameraY
  // v3.0.2: 缓动系数 0.10 → 0.20（更跟手·顺滑）
  cameraX += (targetCameraX - cameraX) * 0.20
  cameraY += (targetCameraY - cameraY) * 0.20
  // v3.0.16: 圆环相接——cameraX 可以无限增长·mainIdxX 不卡边界
  // wrap 范围从 ±COLS/2 改为 ±COLS*100（实际上不限·只防止数值过大）
  while (cameraX > COLS * 100) cameraX -= COLS
  while (cameraX < -COLS * 100) cameraX += COLS
  while (targetCameraX > COLS * 100) targetCameraX -= COLS
  while (targetCameraX < -COLS * 100) targetCameraX += COLS
  // v3.0.2: 松手后 momentum 衰减（每帧 velocity *= 0.92）
  if (!isUserSwiping) {
    velocityX *= 0.92
    velocityY *= 0.92
    if (Math.abs(velocityX) < 0.001) velocityX = 0
    if (Math.abs(velocityY) < 0.001) velocityY = 0
  }

  // 1. 天空
  drawSky(ctx, w, h, l.horizonY)
  // 2. 远山
  drawMountains(ctx, w, h, l.horizonY)
  // 3. 草地
  drawGround(ctx, w, l.horizonY, h)

  // 4. 远景小墓（剪影·陪墓）
  var farOp = anims.farStones.update(now)
  if (farOp > 0) {
    drawFarStones(ctx, l, farOp)
  }

  // 5. 主墓（中央·最大·3D 写实）
  var mainOp = anims.mainStone.update(now)
  if (mainOp > 0) {
    drawMainStone(ctx, l, mainOp)
  }

  // v3.0.21: 主碑前祭祀台（香炉+鲜花+蜡烛）·互动位置预留
  if (mainOp > 0 && otherStones[0] && otherStones[0][((Math.round(cameraX) % COLS) + COLS) % COLS]) {
    drawAltar(ctx, l, mainOp)
  }

  // 测试模式
  if (testPoemLoading) { drawTestPoemSkeleton(ctx); return }
  if (testPoemError) drawTestPoemSkeleton(ctx)

  // v3.0.56: 先生 01:10 反馈——主碑碑文布局和第一排其它碑石要完全一致
  // 删 drawMainText——主碑碑文由 drawMainStone 内的 drawFarStoneText(scale=1.0) 渲染
  // v3.0.20: 顶标删除（灵动岛挡）
  // v3.0.34: 提示挪到 drawMainStone 内部（画在铭结束后·不固定 y=600）
  // 删 drawSwipeHintSimple 调用
}

// ═══════════════════════════════════════════════════════════════
// 天空
// ═══════════════════════════════════════════════════════════════
function drawSky(ctx, w, h, horizonY) {
  var skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY)
  skyGrad.addColorStop(0, STONE.skyTop)
  skyGrad.addColorStop(1, STONE.skyBottom)
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, horizonY)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.beginPath()
  ctx.ellipse(w * 0.7, h * 0.12, 40, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(w * 0.3, h * 0.08, 50, 14, 0, 0, Math.PI * 2)
  ctx.fill()
}

// ═══════════════════════════════════════════════════════════════
// 远山
// ═══════════════════════════════════════════════════════════════
function drawMountains(ctx, w, h, horizonY) {
  var mh = Math.floor(h * 0.18)
  ctx.fillStyle = STONE.mountainLight
  ctx.beginPath()
  ctx.moveTo(0, horizonY)
  ctx.lineTo(w * 0.15, horizonY - mh * 0.6)
  ctx.lineTo(w * 0.35, horizonY - mh * 0.4)
  ctx.lineTo(w * 0.55, horizonY - mh * 0.7)
  ctx.lineTo(w * 0.75, horizonY - mh * 0.5)
  ctx.lineTo(w, horizonY - mh * 0.65)
  ctx.lineTo(w, horizonY)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = STONE.mountain
  ctx.beginPath()
  ctx.moveTo(0, horizonY)
  ctx.lineTo(w * 0.2, horizonY - mh * 0.4)
  ctx.lineTo(w * 0.45, horizonY - mh * 0.55)
  ctx.lineTo(w * 0.7, horizonY - mh * 0.35)
  ctx.lineTo(w, horizonY - mh * 0.5)
  ctx.lineTo(w, horizonY)
  ctx.closePath()
  ctx.fill()
}

// ═══════════════════════════════════════════════════════════════
// 草地
// ═══════════════════════════════════════════════════════════════
function drawGround(ctx, w, horizonY, h) {
  var groundGrad = ctx.createLinearGradient(0, horizonY, 0, h)
  groundGrad.addColorStop(0, STONE.groundFar)
  groundGrad.addColorStop(0.3, STONE.ground)
  groundGrad.addColorStop(1, STONE.groundNear)
  ctx.fillStyle = groundGrad
  ctx.fillRect(0, horizonY, w, h - horizonY)
  // 草丛
  ctx.fillStyle = STONE.grass
  for (var i = 0; i < 20; i++) {
    var gx = (i * 47 + 13) % w
    var gy = horizonY + 8 + (i * 23) % (h - horizonY - 16)
    ctx.beginPath()
    ctx.ellipse(gx, gy, 8, 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ═══════════════════════════════════════════════════════════════
// 远景小墓（v3.0.2: 行列式无限延伸·同排等大·跨排衰减·主碑=前排中心）
// ═══════════════════════════════════════════════════════════════
// v3.0.2 设计：
// - 数据网格 otherStones[row][col]·row=0 前排最大·row 越大越远越小
// - 同排 col 不同的碑·大小一样（先生 05:46 要求）
// - 跨排衰减 40%（row=0=1.0·row=1=0.6·row=2=0.36·row=3=0.22·row=4=0.13）
// - 主碑 = 前排中心（row=0, col=centerCol）·视觉放大 1.3 倍 + Y 上移 10%
// - 渲染 5 行 × 7 列邻域（前后各 2 排·左右各 3 列）·视觉无限延伸
// - 主碑位置 = camera 指向·其他按 (dcol, drow) 浮点偏移
function drawFarStones(ctx, l, op) {
  if (!otherStones || otherStones.length < ROWS || !otherStones[0] || otherStones[0].length < COLS) return
  ctx.save()
  ctx.globalAlpha = op
  if (!l.farStones) l.farStones = []

  var mainIdxX = Math.round(cameraX)
  var mainIdxY = ((Math.round(cameraY) % ROWS) + ROWS) % ROWS
  var floatX = cameraX - mainIdxX
  var floatY = cameraY - mainIdxY

  // v3.0.9: 2.5D 透视布局·按 drow 索引（+2=最远, 0=主碑, -2=最近前排）
  // 草地占屏幕 3/4（horizonY = h × 0.25）
  // 主碑高度 = h × 0.375 = 草地 × 1/2

  // v3.0.32: 先生 15:56 要求——"后排距离再拉开+铺满整个草地"
// 距离基准 240→280（d/高差 ≈ 1.8-2.5），5 排累加 ≈ 596px（铺满草地 500px + 部分天空）
  var drowConfig = [
    // v3.0.10: 先生 22:56 反馈——v3.0.9 越远间隔越大（56px > 37px）
    // 修法：所有排的 slotW 按墓碑宽度 + 20% 间隙 = scale × mainW × 1.20
    //   drow=0: 183 × 1.20 = 220 (间隙 37)
    //   drow=1: 100 × 1.20 = 120 (间隙 20)
    //   drow=2:  58 × 1.20 =  70 (间隙 12)
    //   drow=3:  32 × 1.20 =  38 (间隙  6)
    //   drow=4:  18 × 1.20 =  22 (间隙  4)
    { scale: 1.00, yFrac: 0.95, slotW: l.mainW * 1.00 * 1.20 },  // drow=0 主碑
    { scale: 0.55, yFrac: 0.95 - 280 / l.h, slotW: l.mainW * 0.55 * 1.20 },  // drow=1
    { scale: 0.32, yFrac: 0.95 - (280 + 154) / l.h, slotW: l.mainW * 0.32 * 1.20 },  // drow=2
    { scale: 0.18, yFrac: 0.95 - (280 + 154 + 90) / l.h, slotW: l.mainW * 0.18 * 1.20 },  // drow=3
    { scale: 0.10, yFrac: 0.95 - (280 + 154 + 90 + 50) / l.h, slotW: l.mainW * 0.10 * 1.20 },  // drow=4
  ]

  // 渲染 5 行 × 9 列邻域（drow 0 ~ +4, dcol -4 ~ +4）
  // v3.0.17: 主碑 drow=0 dcol=0 跳过·由 drawMainStone 独立渲染（避免和远景叠绘）
  // 画顺序：从最远 drow=+4 → drow=0（远的先画被近的覆盖）
  for (var drow = 4; drow >= 0; drow--) {  // v3.0.32: 5 排（距离加大·铺满草地+部分天空）
    // v3.0.55: 先生 01:05 反馈——左右不对等 + 只有第一排延展
    // 修法：centerDcol = Math.round(cameraX - mainIdxX)——保留 wrap 前后偏移
    // 测试：cameraX=15 mainIdxX=4 → centerDcol=11（+11 槽向右延展）✓
    //       cameraX=-5 mainIdxX=6 → centerDcol=-11（-11 槽向左延展）✓
    var centerDcol = Math.round(cameraX - mainIdxX)
    for (var dcol = centerDcol - 14; dcol <= centerDcol + 14; dcol++) {
      // v3.0.17 关键修复: 跳过主碑本身（drow=0 dcol=0 由 drawMainStone 渲染）
      if (drow === 0 && dcol === 0) continue
      var realCol = ((mainIdxX + dcol) % COLS + COLS) % COLS
      var realRow = ((mainIdxY + drow) % ROWS + ROWS) % ROWS
      var stone = otherStones[realRow] && otherStones[realRow][realCol]
      if (!stone || !stone.name) continue

      var cfg = drowConfig[drow]
      var scale = cfg.scale
      var pW = Math.max(12, Math.floor(l.mainW * scale))
      var pH = Math.max(14, Math.floor(l.mainH * scale))

      // Y 位置 = 屏幕高度 × yFrac
      var pY_base = l.h * cfg.yFrac

      // X 位置 = 屏幕中央 + dcol × 每排槽宽 + (-floatX × 主碑槽宽)
      var pX_base = l.cx + dcol * cfg.slotW - floatX * drowConfig[0].slotW

      // v3.0.13: 主碑不再特殊处理·按 drow=0 标准渲染（普通前排墓碑）
      var isMainStone = (drow === 0 && dcol === 0)
      // 主碑位置/尺寸完全按 drowConfig[0]·不需要特殊处理
      // 但仍用 l.mainW × l.mainH 全尺寸（因为 drowConfig[0].scale=1.00 = mainW）
      // 实际上 pW = mainW × 1.0 = mainW 已经对了

      var pX = pX_base - pW / 2
      var pY = pY_base - pH

      // v3.0.5: 先生 21:53 反馈——某些位置只剩两排且全灰
      // 根因：stoneOp = op * max(0.15, 1 - distFromMain * 0.18)
      //   distFromMain = sqrt(dcol² + drow²) 含 dcol → 前排最远端（dcol=±14）clamp 到 0.15 = 几乎透明
      // 修法：只按 drow 衰减（不按 dcol）·前排 1.0·后排按 row 衰减
      //   drow=0: 1.0   drow=1: 0.85   drow=2: 0.70   drow=3: 0.55   drow=4: 0.40
      var drowOpacity = [1.0, 0.85, 0.70, 0.55, 0.40]
      var stoneOp = op * drowOpacity[drow]

      // v3.0.6: 放宽屏外剪裁·允许 ±3 个墓碑宽的边距（防止尽头墓碑被误剪）
      if (pX_base > -pW * 3 && pX_base < l.w + pW * 3 && pY_base > -pH * 1.5 && pY_base < l.h + pH * 1.5) {
        // 主碑不缓存到 farStones（避免 tap 检测重复触发）
        if (!isMainStone && Math.abs(dcol) <= 2 && Math.abs(drow) <= 1) {
          var cacheIdx = (drow + 1) * 5 + (dcol + 2)
          l.farStones[cacheIdx] = {
            stone: stone,
            x: pX, y: pY, w: pW, h: pH,
            row: realRow, col: realCol,
          }
        }
        // v3.0.14: 所有墓碑都用 3D 渲染（庑殿顶+碑身+底座）·和主碑一致
        // v3.0.47: 先生 22:07 要求——第一排是一整排墓碑·所有 drow=0 都画 3D
        drawStone3D(ctx, pX, pY, pW, pH, stone, stoneOp, l.baseH, l.capH)
        // v3.0.38: 远景墓碑也画碑文·v3.0.50 删 pX_clamp——碑文 X 跟随墓碑（即使超出屏幕）
        drawFarStoneText(ctx, stone, pX, pY, pW, pH, scale, stoneOp)
      }
    }
  }
  ctx.restore()
}

// 单块墓（远景简版）

// ═══════════════════════════════════════════════════════════════
// 碑身 3D 渐变（v2.4.1 修复：从 v2.2.0 备份加回来）
// ═══════════════════════════════════════════════════════════════
function drawBody3D(ctx, x, y, w, h) {
  var bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0)
  bodyGrad.addColorStop(0, STONE.bodyShade)
  bodyGrad.addColorStop(0.3, STONE.bodyMid)
  bodyGrad.addColorStop(0.6, STONE.bodyMid)
  bodyGrad.addColorStop(1, STONE.bodyTop)
  ctx.fillStyle = bodyGrad
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = STONE.bodyEdge
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.fillStyle = 'rgba(255,255,250,0.15)'
  ctx.fillRect(x, y, w, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(x, y + h - 2, w, 2)
}

// ═══════════════════════════════════════════════════════════════
// 庑殿顶（v2.4.1 修复：从 v2.2.0 备份加回来）
// ═══════════════════════════════════════════════════════════════
function drawCap(ctx, x, y, w, h) {
  // v3.0.21: 去掉左右飞檐·改平整梯形顶
  // v3.0.30: expand 按 sw 等比缩（远景庑殿顶不超界）
  var capY = y - h
  var refMainW = layout.mainW || 165
  var scaleRatio = w / refMainW
  var expand = Math.max(1, 4 * scaleRatio)

  // 顶部小三角（中央）
  ctx.fillStyle = STONE.capTop
  ctx.beginPath()
  ctx.moveTo(x + w / 2, capY)
  ctx.lineTo(x + w / 2 - 8, capY + 4)
  ctx.lineTo(x + w / 2 + 8, capY + 4)
  ctx.closePath()
  ctx.fill()

  // 主体庑殿顶（梯形·无飞檐）
  var capGrad = ctx.createLinearGradient(0, capY, 0, y)
  capGrad.addColorStop(0, STONE.capTop)
  capGrad.addColorStop(1, STONE.capShade)
  ctx.fillStyle = capGrad
  ctx.beginPath()
  // v3.0.21: 去掉左右飞檐·用矩形 + 微微斜边
  ctx.moveTo(x + w / 2 - 10, capY + 4)
  ctx.lineTo(x + w / 2 + 10, capY + 4)
  ctx.lineTo(x + w + expand, y)
  ctx.lineTo(x - expand, y)
  ctx.closePath()
  ctx.fill()

  // v3.0.21: 去掉左右两个上翘角（lineTo x-expand-4 和 x+w+expand+4 那两段）

  // 顶部高光
  ctx.strokeStyle = 'rgba(255,255,250,0.3)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(x + w / 2, capY)
  ctx.lineTo(x - expand, y)
  ctx.moveTo(x + w / 2, capY)
  ctx.lineTo(x + w + expand, y)
  ctx.stroke()
}

// v2.5.4: 远景碑完整渲染（和主碑一样的设计样式·只是缩放小+无文字）
function drawSingleStoneSimple(ctx, x, y, w, h, life, scale) {
  // 阴影
  ctx.fillStyle = STONE.shadow
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h + 4, w * 0.6, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  // 须弥座（缩放）
  var baseH = Math.max(4, Math.floor(8 * scale))
  drawBase(ctx, x, y + h, w, baseH)
  // 碑身
  drawBody3D(ctx, x, y, w, h)
  // 庑殿顶
  var capH = Math.max(3, Math.floor(8 * scale))
  drawCap(ctx, x, y, w, capH)
  // 苔藓+裂纹（按 stone.seed）
  if (life.seed) {
    drawStoneDetails(ctx, x, y, w, h, life.seed)
  }
  // 小印章
  if (life.name) {
    var sealSize = Math.max(5, Math.floor(8 * scale))
    var sealX = x + w - sealSize - 2
    var sealY = y + h - sealSize - 6
    ctx.fillStyle = STONE.seal
    ctx.fillRect(sealX, sealY, sealSize, sealSize)
    drawText(ctx, life.name.substring(0, 1) + '印', sealX + sealSize / 2, sealY + sealSize / 2, {
      fontSize: Math.max(4, Math.floor(6 * scale)),
      color: '#f0e8d4',
      align: 'center', baseline: 'middle',
      bold: true,
    })
  }
  // 碑文（v2.5.5: 远景也有碑文·字号小+内容精简）
  if (life.name) {
    var titleFs = Math.max(6, Math.floor(10 * scale))
    drawText(ctx, life.name, x + w / 2, y + capH + 4 + titleFs / 2, {
      fontSize: titleFs,
      color: STONE.carveDark,
      align: 'center', baseline: 'middle',
      bold: true,
      letterSpacing: 1,
      opacity: 0.85,
    })
    var metaFs = Math.max(5, Math.floor(7 * scale))
    var metaY = y + capH + 4 + titleFs + 6
    var metaParts = []
    if (life.dynasty) metaParts.push(life.dynasty)
    if (life.age) metaParts.push('享年' + life.age + '岁')
    if (metaParts.length) {
      drawText(ctx, metaParts.join('·'), x + w / 2, metaY, {
        fontSize: metaFs,
        color: STONE.carveDark,
        align: 'center', baseline: 'middle',
        opacity: 0.7,
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 主墓（白圆顶+灰色花岗岩碑+3D 写实）
// ═══════════════════════════════════════════════════════════════
// v2.5.3: 主碑按 camX 实时切换（不 swap 数据）
// v2.5.7: 循环 mainIdx（mod N·允许划出边界）
// v3.0.14: 通用 3D 墓碑渲染（庑殿顶+碑身+底座+苔藓+花）·所有墓碑都用
function drawStone3D(ctx, sx, sy, sw, sh, stone, op, baseHRef, capHRef) {
  ctx.save()
  // v3.0.29: 墓碑不透明·保证看不到后排
  // 不再用 ctx.globalAlpha = op（那会让后面的碑透出来）
  // 改用 ctx.fillStyle 实色·确保碑身/底座/庑殿顶都是不透明实色
  var refMainW = layout.mainW || 165
  var scaleRatio = sw / refMainW
  var baseH = scaleRatio >= 0.7 ? baseHRef : Math.max(4, baseHRef * scaleRatio * 0.6)
  var capH = scaleRatio >= 0.7 ? capHRef : Math.max(3, capHRef * scaleRatio * 0.6)

  // v3.0.29: 去掉墓碑底部光影（先生 15:47 要求）

  // 2. 须弥座（3D）·实色填充
  drawBase(ctx, sx, sy + sh, sw, baseH)

  // 3. 碑身（青灰·实色填充·不透明）
  drawBody3D(ctx, sx, sy, sw, sh)

  // 4. 庑殿顶（青灰·实色填充）
  drawCap(ctx, sx, sy, sw, capH)

  // v3.0.22: 去掉青苔+划痕

  // 6. 草/花（小墓碑跳过细节装饰）
  if (sw > refMainW * 0.6) {
    drawFlowers(ctx, sx, sy, sw, sh)
  }

  ctx.restore()
}

function drawMainStone(ctx, l, op) {
  // v3.0.14: 主碑 = 前排 drow=0 中央·3D 渲染（和远景墓碑一致设计）
  if (!otherStones || otherStones.length < ROWS || !otherStones[0] || otherStones[0].length < COLS) return
  var mainIdxX = Math.round(cameraX)
  var mainRealCol = ((mainIdxX % COLS) + COLS) % COLS  // v3.0.9: mod wrap 避免负索引
  var stone = otherStones[0] && otherStones[0][mainRealCol]
  if (!stone || !stone.name) return

  // v3.0.43: 先生 21:56 反馈——主碑跑右下角
  // 真因：drawMainStone 用 slotW=0.90·drawFarStones 用 slotW=1.20·不一致
  // 修法：用和 drawFarStones 一致的 slotW = mainW × 1.20
  var slotW = l.mainW * 1.20
  var floatX = cameraX - mainIdxX
  var pX_base = l.cx - floatX * slotW
  var pY_base = l.h * 0.95

  var sw = l.mainW
  var sh = l.mainH
  var sx = pX_base - sw / 2
  var sy = pY_base - sh

  var mainOp = op * Math.max(0.5, 1 - Math.abs(floatX) * 0.4)
  drawStone3D(ctx, sx, sy, sw, sh, stone, mainOp, l.baseH, l.capH)
  // v3.0.56: 主碑碑文用 drawFarStoneText(scale=1.0) 渲染——和第一排其它碑石完全一致
  drawFarStoneText(ctx, stone, sx, sy, sw, sh, 1.0, mainOp)
  // v3.0.34: 提示画在主碑底部·确保在铭之后·距香炉至少 25px 间隙
  // 香炉顶 y = l.h*0.955 - 18·墓身底 sy+sh = l.h*0.95
  // 提示 y = sy + sh - 50·保证 50px 间隙（包含 11pt 字高 14px + 36px 间隙）
  var hintY = sy + sh - 50
  drawText(ctx, '左右划切换 · 上划返回', sx + sw / 2, hintY, {
    fontSize: 10,
    color: 'rgba(120,115,108,0.65)',  // 浅灰提示
    align: 'center', baseline: 'middle',
    letterSpacing: 0,  // 去掉字间距·看着紧凑
    opacity: mainOp,
    bold: false,  // 不加粗·提示性文字
  })
}

// ═══════════════════════════════════════════════════════════════
// 圆顶（白色·3D）
// ═══════════════════════════════════════════════════════════════
function drawDome(ctx, x, y, w, h) {
  // 圆顶（上半圆+底矩形）
  var domeR = w * 0.7
  var domeY = y + domeR * 0.3  // 圆顶中心 y
  // 圆顶渐变（左暗右亮）
  var domeGrad = ctx.createLinearGradient(x, 0, x + w, 0)
  domeGrad.addColorStop(0, STONE.domeShade)
  domeGrad.addColorStop(0.5, STONE.domeMid)
  domeGrad.addColorStop(1, STONE.domeLight)
  ctx.fillStyle = domeGrad
  // 圆顶主体
  ctx.beginPath()
  ctx.ellipse(x + w / 2, domeY, domeR, domeR * 0.85, 0, Math.PI, 0)
  // 圆顶下方矩形
  ctx.lineTo(x + w, y + h * 0.5)
  ctx.lineTo(x, y + h * 0.5)
  ctx.closePath()
  ctx.fill()
  // 圆顶底边线
  ctx.strokeStyle = STONE.domeEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + h * 0.5)
  ctx.lineTo(x + w, y + h * 0.5)
  ctx.stroke()
  // 圆顶高光（左上一道弧）
  ctx.fillStyle = 'rgba(255,255,250,0.5)'
  ctx.beginPath()
  ctx.ellipse(x + w / 2 - domeR * 0.2, domeY - domeR * 0.2, domeR * 0.5, domeR * 0.4, 0, Math.PI, 0)
  ctx.fill()
  // 圆顶顶部小尖
  ctx.fillStyle = STONE.domeShade
  ctx.beginPath()
  ctx.moveTo(x + w / 2, domeY - domeR)
  ctx.lineTo(x + w / 2 - 4, domeY - domeR + 8)
  ctx.lineTo(x + w / 2 + 4, domeY - domeR + 8)
  ctx.closePath()
  ctx.fill()
}

// ═══════════════════════════════════════════════════════════════
// 灰色花岗岩墓碑（立在圆顶墓前·3D 写实）
// ═══════════════════════════════════════════════════════════════
function drawTablet3D(ctx, x, y, w, h) {
  // 墓碑位置（圆顶墓前面·下半中央）
  var tabW = w * 0.55
  var tabH = h * 0.55
  var tabX = x + (w - tabW) / 2
  var tabY = y + h * 0.45  // 圆顶下半中央

  // 阴影
  ctx.fillStyle = STONE.shadow
  ctx.beginPath()
  ctx.ellipse(tabX + tabW / 2, tabY + tabH + 4, tabW * 0.5, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // 碑身（青灰·3D 渐变）
  var bodyGrad = ctx.createLinearGradient(tabX, 0, tabX + tabW, 0)
  bodyGrad.addColorStop(0, STONE.bodyShade)
  bodyGrad.addColorStop(0.3, STONE.bodyMid)
  bodyGrad.addColorStop(0.6, STONE.bodyMid)
  bodyGrad.addColorStop(1, STONE.bodyTop)
  ctx.fillStyle = bodyGrad
  ctx.fillRect(tabX, tabY, tabW, tabH)
  // 边线
  ctx.strokeStyle = STONE.bodyEdge
  ctx.lineWidth = 1
  ctx.strokeRect(tabX + 0.5, tabY + 0.5, tabW - 1, tabH - 1)
  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,250,0.2)'
  ctx.fillRect(tabX, tabY, tabW, 2)

  // 庑殿顶（小）
  var capH = 8
  var capExpand = 4
  ctx.fillStyle = STONE.capTop
  ctx.beginPath()
  ctx.moveTo(tabX + tabW / 2 - 6, tabY - capH + 3)
  ctx.lineTo(tabX + tabW / 2 + 6, tabY - capH + 3)
  ctx.lineTo(tabX + tabW + capExpand, tabY)
  ctx.lineTo(tabX - capExpand, tabY)
  ctx.closePath()
  ctx.fill()

  // 须弥座（短）
  var baseH = 5
  ctx.fillStyle = STONE.baseShade
  ctx.fillRect(tabX - 2, tabY + tabH, tabW + 4, baseH)
}

// ═══════════════════════════════════════════════════════════════
// 须弥座（主墓·3D）
// ═══════════════════════════════════════════════════════════════
function drawBase(ctx, x, y, w, h) {
  // v3.0.30: 先生 15:50 要求底座间距按 sw 等比缩（避免后排底座挨在一起）
  // expand = 14 × scaleRatio（小墓碑底座也小）
  var refMainW = layout.mainW || 165
  var scaleRatio = w / refMainW
  var expand = Math.max(2, 14 * scaleRatio)
  // 上层
  var baseMid = y + h * 0.4
  ctx.fillStyle = STONE.baseTop
  ctx.beginPath()
  ctx.moveTo(x - expand + 4, y)
  ctx.lineTo(x + w + expand - 4, y)
  ctx.lineTo(x + w + expand - 6, baseMid)
  ctx.lineTo(x - expand + 6, baseMid)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(x - expand + 4, baseMid)
  ctx.lineTo(x + w + expand - 4, baseMid)
  ctx.stroke()
  // 下层
  var baseGrad = ctx.createLinearGradient(0, baseMid, 0, y + h)
  baseGrad.addColorStop(0, STONE.baseShade)
  baseGrad.addColorStop(1, STONE.bodyEdge)
  ctx.fillStyle = baseGrad
  ctx.beginPath()
  ctx.moveTo(x - expand + 6, baseMid)
  ctx.lineTo(x + w + expand - 6, baseMid)
  ctx.lineTo(x + w + expand - 10, y + h)
  ctx.lineTo(x - expand + 10, y + h)
  ctx.closePath()
  ctx.fill()
}

// ═══════════════════════════════════════════════════════════════
// 苔藓+裂纹
// ═══════════════════════════════════════════════════════════════
function drawStoneDetails(ctx, x, y, w, h, seed) {
  var tex = genStoneTexture(seed)
  for (var i = 0; i < tex.moss.length; i++) {
    var m = tex.moss[i]
    var mx = x + m.cx * w
    var my = y + h + 6 + m.cy * 0.1
    ctx.fillStyle = m.type === 'light' ? STONE.moss : STONE.mossDark
    ctx.beginPath()
    ctx.ellipse(mx, my, m.rx, m.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = STONE.crack
  ctx.lineWidth = 0.5
  for (var c = 0; c < tex.cracks.length; c++) {
    var crack = tex.cracks[c]
    if (crack.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(x + crack[0].x * w, y + crack[0].y * h)
    for (var cj = 1; cj < crack.length; cj++) {
      ctx.lineTo(x + crack[cj].x * w, y + crack[cj].y * h)
    }
    ctx.stroke()
  }
}

// ═══════════════════════════════════════════════════════════════
// 花草（点缀·主墓前）
// ═══════════════════════════════════════════════════════════════
// v2.5.2: 减量到 2 丛 + 透明（之前 3 丛太密）+ 移到更远（不被底座挡）
function drawFlowers(ctx, x, y, w, h) {
  var baseY = y + h + 18  // v2.5.2: 加 10px 距离底座
  // 2 丛花（之前 3 丛）
  var positions = [0.35, 0.65]
  for (var i = 0; i < positions.length; i++) {
    var fx = x + w * positions[i]
    var fy = baseY
    var fH = 5
    ctx.fillStyle = STONE.grass
    ctx.fillRect(fx, fy, 1.5, fH)
    // 小花
    if (i === 0) {
      ctx.fillStyle = STONE.flower
      ctx.beginPath()
      ctx.arc(fx + 0.75, fy - 1, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 主碑文字（v2.4.1 改：刻在碑身正面·不是花岗岩碑上）
// ═══════════════════════════════════════════════════════════════
// 祭祀台（主碑前·先生 13:52 要求预留互动空间）
// ═══════════════════════════════════════════════════════════════
// v3.0.22: 先生拍 B·古典红木风格（红木案 + 黄铜双耳香炉 + 双瓶青花瓷插花）
function drawAltar(ctx, l, op) {
  ctx.save()
  ctx.globalAlpha = op

  var mainIdxX = Math.round(cameraX)
  var floatX = cameraX - mainIdxX
  var slotW = l.mainW * 1.20
  var pX_base = l.cx - floatX * slotW
  var mainStoneCenterX = pX_base

  // 祭祀台尺寸
  var altarW = l.mainW * 1.7      // 比主碑宽 70%
  var altarTopY = l.h * 0.955     // 台面顶
  var altarBottomY = l.h * 0.99   // 台面底
  var altarH = altarBottomY - altarTopY  // 约 23px 高（红木案有厚度）
  var altarLeft = pX_base - altarW / 2

  // 1. 红木长案（有木纹渐变·暖棕色）
  var woodGrad = ctx.createLinearGradient(altarLeft, altarTopY, altarLeft, altarBottomY)
  woodGrad.addColorStop(0, '#5D3A1F')    // 顶面亮棕
  woodGrad.addColorStop(0.4, '#6B4423')  // 中棕
  woodGrad.addColorStop(1, '#3D2410')    // 底面深棕
  ctx.fillStyle = woodGrad
  ctx.fillRect(altarLeft, altarTopY, altarW, altarH)
  // 木纹（细横线）
  ctx.strokeStyle = 'rgba(30,15,5,0.4)'
  ctx.lineWidth = 0.5
  for (var wi = 0; wi < 5; wi++) {
    var wy = altarTopY + (altarH / 5) * (wi + 0.5)
    ctx.beginPath()
    ctx.moveTo(altarLeft + 2, wy)
    ctx.lineTo(altarLeft + altarW - 2, wy)
    ctx.stroke()
  }
  // 台面边（金色描边）
  ctx.strokeStyle = '#8B6914'
  ctx.lineWidth = 1.2
  ctx.strokeRect(altarLeft + 0.5, altarTopY + 0.5, altarW - 1, altarH - 1)
  // 台面四脚（简化的方足）
  ctx.fillStyle = '#3D2410'
  ctx.fillRect(altarLeft + 2, altarBottomY, 4, 4)
  ctx.fillRect(altarLeft + altarW - 6, altarBottomY, 4, 4)
  ctx.fillRect(pX_base - 2, altarBottomY, 4, 4)

  // 2. 中央·传统三足鼎香炉（v3.0.25 重设计·先生 15:33 说像蟑螂·改成三足鼎）
  var censerCX = mainStoneCenterX
  var censerBaseY = altarTopY          // 鼎足底部 = 台面顶
  var censerW = 26                     // 鼎口宽
  var censerBellyW = 30                // 鼎腹宽（最鼓处）
  var censerTopY = censerBaseY - 18    // 鼎口 Y
  var censerBellyY = censerBaseY - 9   // 鼎腹 Y（最大宽度处）

  // 2a. 三只鼎足（圆锥形·从鼎底向下伸出）
  ctx.fillStyle = '#6B4F0A'
  for (var fi = -1; fi <= 1; fi++) {
    var footX = censerCX + fi * 9
    // 足是锥形（上宽下窄）
    ctx.beginPath()
    ctx.moveTo(footX - 2.5, censerBaseY)
    ctx.lineTo(footX + 2.5, censerBaseY)
    ctx.lineTo(footX + 1.5, censerBaseY + 6)
    ctx.lineTo(footX - 1.5, censerBaseY + 6)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#3D2410'
    ctx.lineWidth = 0.6
    ctx.stroke()
  }

  // 2b. 鼎身（圆鼓腹·上窄下宽微收）
  var censerGrad = ctx.createLinearGradient(censerCX - censerBellyW / 2, 0, censerCX + censerBellyW / 2, 0)
  censerGrad.addColorStop(0, '#8B6914')
  censerGrad.addColorStop(0.3, '#D4A82A')
  censerGrad.addColorStop(0.7, '#D4A82A')
  censerGrad.addColorStop(1, '#6B4F0A')
  ctx.fillStyle = censerGrad
  ctx.beginPath()
  // 鼎身轮廓：从鼎口到鼎底，腹部最鼓
  ctx.moveTo(censerCX - censerW / 2, censerTopY)
  ctx.lineTo(censerCX + censerW / 2, censerTopY)               // 鼎口
  ctx.lineTo(censerCX + censerBellyW / 2, censerBellyY)        // 鼓出到腹部
  ctx.lineTo(censerCX + censerW / 2 + 1, censerBaseY - 1)      // 收到底部
  ctx.lineTo(censerCX - censerW / 2 - 1, censerBaseY - 1)
  ctx.lineTo(censerCX - censerBellyW / 2, censerBellyY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#3D2410'
  ctx.lineWidth = 1
  ctx.stroke()

  // 2c. 鼎口横向回纹装饰带（区分上下）
  ctx.strokeStyle = '#3D2410'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(censerCX - censerW / 2 + 1, censerTopY + 3)
  ctx.lineTo(censerCX + censerW / 2 - 1, censerTopY + 3)
  ctx.stroke()

  // 2d. 鼎耳（两个竖直方耳立在鼎口·不是蟑螂触角圆环）
  ctx.fillStyle = '#A07818'
  ctx.strokeStyle = '#3D2410'
  ctx.lineWidth = 0.8
  // 左耳
  ctx.fillRect(censerCX - censerW / 2 - 3, censerTopY - 5, 4, 8)
  ctx.strokeRect(censerCX - censerW / 2 - 3, censerTopY - 5, 4, 8)
  // 右耳
  ctx.fillRect(censerCX + censerW / 2 - 1, censerTopY - 5, 4, 8)
  ctx.strokeRect(censerCX + censerW / 2 - 1, censerTopY - 5, 4, 8)

  // 2e. 鼎盖（弧形宝顶·不是蟑螂背）
  ctx.fillStyle = '#A07818'
  ctx.beginPath()
  // 宝顶：从鼎口向左上鼓出
  ctx.moveTo(censerCX - censerW / 2 + 2, censerTopY)
  ctx.quadraticCurveTo(censerCX - 4, censerTopY - 7, censerCX, censerTopY - 8)
  ctx.quadraticCurveTo(censerCX + 4, censerTopY - 7, censerCX + censerW / 2 - 2, censerTopY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#3D2410'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // 2f. 鼎盖上的小宝珠
  ctx.fillStyle = '#D4A82A'
  ctx.beginPath()
  ctx.arc(censerCX, censerTopY - 9, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3D2410'
  ctx.lineWidth = 0.5
  ctx.stroke()

  // 2g. 三根香从鼎盖穿出（细烟·不是蟑螂腿）
  for (var si = 0; si < 3; si++) {
    var sx = censerCX - 5 + si * 5
    // 香（细线）
    ctx.strokeStyle = '#8B4513'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(sx, censerTopY - 8)
    ctx.lineTo(sx, censerTopY - 16)
    ctx.stroke()
    // 香尖红点
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath()
    ctx.arc(sx, censerTopY - 16, 1, 0, Math.PI * 2)
    ctx.fill()
  }
  // 2h. 淡烟（极细弧线·几乎看不见）
  ctx.strokeStyle = 'rgba(200,200,200,0.25)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(censerCX, censerTopY - 18)
  ctx.quadraticCurveTo(censerCX - 2, censerTopY - 22, censerCX, censerTopY - 26)
  ctx.stroke()

  // 3. 左侧·青花瓷瓶（插花）
  drawAltarPorcelainVase(ctx, mainStoneCenterX - altarW * 0.32, altarTopY, op, true)

  // 4. 右侧·青花瓷瓶（插花）
  drawAltarPorcelainVase(ctx, mainStoneCenterX + altarW * 0.32, altarTopY, op, false)
}

// v3.0.22: 青花瓷瓶（梅花/桃花插花）
function drawAltarPorcelainVase(ctx, vx, altarTopY, op, isLeft) {
  var vaseH = 20
  var vaseW = 12
  var vaseBaseY = altarTopY  // 瓶底 = 台面顶
  var vaseTopY = vaseBaseY - vaseH

  // 瓶身（白瓷·青花纹）
  ctx.fillStyle = '#F8F4E8'  // 米白瓷
  ctx.strokeStyle = '#1A3A6B'  // 青花蓝
  ctx.lineWidth = 1

  // 瓶身轮廓（束腰·喇叭口）
  ctx.beginPath()
  ctx.moveTo(vx - vaseW / 2, vaseBaseY)         // 瓶底左
  ctx.lineTo(vx - vaseW / 2, vaseTopY + 8)      // 瓶身直
  ctx.quadraticCurveTo(vx - 2, vaseTopY + 6, vx - 3, vaseTopY + 4)  // 束腰
  ctx.quadraticCurveTo(vx - vaseW / 2 + 1, vaseTopY + 2, vx - vaseW / 2 + 1, vaseTopY)  // 瓶口左
  ctx.lineTo(vx + vaseW / 2 - 1, vaseTopY)      // 瓶口右
  ctx.quadraticCurveTo(vx + vaseW / 2 - 1, vaseTopY + 2, vx + 3, vaseTopY + 4)
  ctx.quadraticCurveTo(vx + 2, vaseTopY + 6, vx + vaseW / 2, vaseTopY + 8)
  ctx.lineTo(vx + vaseW / 2, vaseBaseY)         // 瓶底右
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // 青花纹（简化梅花图案·5 瓣×2 朵）
  ctx.fillStyle = '#1A3A6B'
  // 上花
  for (var pi = 0; pi < 5; pi++) {
    var angle = pi * (Math.PI * 2 / 5) - Math.PI / 2
    var px = vx + Math.cos(angle) * 2.5
    var py = vaseTopY + 11 + Math.sin(angle) * 2.5
    ctx.beginPath()
    ctx.arc(px, py, 1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#FFD700'  // 花心金黄
  ctx.beginPath()
  ctx.arc(vx, vaseTopY + 11, 0.8, 0, Math.PI * 2)
  ctx.fill()

  // 下花
  ctx.fillStyle = '#1A3A6B'
  for (var pi2 = 0; pi2 < 5; pi2++) {
    var angle2 = pi2 * (Math.PI * 2 / 5) - Math.PI / 2
    var px2 = vx + Math.cos(angle2) * 2.5
    var py2 = vaseBaseY - 6 + Math.sin(angle2) * 2.5
    ctx.beginPath()
    ctx.arc(px2, py2, 1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#FFD700'
  ctx.beginPath()
  ctx.arc(vx, vaseBaseY - 6, 0.8, 0, Math.PI * 2)
  ctx.fill()

  // 5. 花枝（3 朵粉色梅花从瓶口伸出）
  var branchColors = ['#FFB7C5', '#FF8FA3', '#FFB7C5']  // 粉红/玫红
  for (var bi = 0; bi < 3; bi++) {
    var bAngle = -Math.PI / 2 + (bi - 1) * 0.5  // 向上散开
    var bLen = 14
    var bx = vx + Math.cos(bAngle) * bLen
    var by = vaseTopY - 2 + Math.sin(bAngle) * bLen * 0.6
    // 枝干
    ctx.strokeStyle = '#5D3A1F'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(vx, vaseTopY - 2)
    ctx.quadraticCurveTo(vx + Math.cos(bAngle) * bLen * 0.5, vaseTopY - 6, bx, by)
    ctx.stroke()
    // 花朵
    ctx.fillStyle = branchColors[bi]
    ctx.beginPath()
    ctx.arc(bx, by, 3, 0, Math.PI * 2)
    ctx.fill()
    // 花心
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(bx, by, 1, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ═══════════════════════════════════════════════════════════════
// v2.5.3: 主碑内容跟 drawMainStone 同步（按 camX）
  // v2.5.5: 主碑内容跟 drawMainStone 同步
  // v3.0.21: 主碑内容跟 drawMainStone 同步
  // v3.0.7: 循环 mainIdx

// v3.0.40: 先生 21:43 要求——所有远景碑都完整 6 段（不分级）·字号按 scale 缩放可以很小
function drawFarStoneText(ctx, stone, pX, pY, pW, pH, scale, op) {
  if (!stone || !stone.name) return
  ctx.save()
  ctx.globalAlpha = op
  // v3.0.30: 先生 02:00 反馈——字号再大一点
  //   碑额 18→22pt (主标题更突出)·副标题 10→13pt·志 11→14pt·铭 10→12pt
  var titleSize = Math.max(2, Math.floor(22 * scale))
  var subSize = Math.max(2, Math.floor(13 * scale))
  var bodySize = Math.max(2, Math.floor(14 * scale))
  var mingSize = Math.max(2, Math.floor(12 * scale))
  var sealSize = Math.max(2, Math.floor(10 * scale))
  var cx = pX + pW / 2
  var padX = Math.max(1, pW * 0.10)
  var tabW = pW - padX * 2

  // 1. 碑额"X之墓"
  // v3.0.28: 紧凑——0.10/0.18/0.27·每段间距约 25px（合理）
  var titleY = pY + pH * 0.10
  drawCarvedText(ctx, stone.name + '之墓', cx, titleY, titleSize, op, {
    bold: true, letterSpacing: Math.max(0, Math.floor(2 * scale)),
    color: 'rgba(180,140,60,0.95)',
  })

  // 2. 副标题"朝代 · 职业 · 享年X岁"
  var subY = pY + pH * 0.18
  var subParts = []
  if (stone.dynasty) subParts.push(stone.dynasty)
  if (stone.occupation) subParts.push(stone.occupation)
  if (stone.age != null) subParts.push('享年' + stone.age + '岁')
  if (subParts.length) {
    drawCarvedText(ctx, subParts.join(' · '), cx, subY, subSize, op, {
      color: 'rgba(80,75,70,0.85)', letterSpacing: Math.max(0, Math.floor(1 * scale)),
    })
  }

  // 3. 志（epRecord 小传·主碑多少行·远景也多少行·字号缩小）
  // v3.0.28: 起始 0.27·合理间距
  var bodyStartY = pY + pH * 0.27
  var bodyLineH = bodySize + 6  // 17px 行距 (11pt 字号)
  var currentY = bodyStartY
  var zhiText = stone.epRecord || ''
  if (!zhiText && stone.epitaph) zhiText = stone.epitaph
  if (zhiText) {
    // 远景碑字号小·tabW 小·每行字数少·自动换行多·但保留完整内容
    var zhiLines = splitText(zhiText, tabW - 2, bodySize)
    for (var zli = 0; zli < zhiLines.length; zli++) {
      drawCarvedText(ctx, zhiLines[zli], cx, currentY, bodySize, op, {
        color: 'rgba(70,65,60,0.92)', letterSpacing: 0,
      })
      currentY += bodyLineH
    }
  }

  // 4. 铭（epitaph 韵语结句·接志末尾·先生要求视觉区分）
  // v3.0.28: 空行隔开 + 居中偏移 0 + 加粗 + 浅金色（和志明显不同）
  if (stone.epRecord && stone.epitaph) {
    currentY += bodyLineH * 1.0  // 空一行隔开
    var mingLines = splitText(stone.epitaph, tabW - 2, mingSize)
    for (var mli = 0; mli < mingLines.length; mli++) {
      drawCarvedText(ctx, mingLines[mli], cx, currentY, mingSize, op, {
        bold: true,
        color: 'rgba(140,110,60,0.95)',  // 浅金·和碑额呼应
        letterSpacing: 2,
      })
      currentY += bodyLineH
    }
  }

  // v3.0.58: 先生 01:19 反馈——印章很丑·全部去掉
  // （保留墓额+副标题+志+铭 4 段布局）

  ctx.restore()
}

// v3.0.34: 先生 16:11 微调
//   1. 副标题顺序：朝代 + 职业 + 享年（不再重复·不再"享年"在职业前）
//   2. 志最多 6 行（避免截断）
//   3. 去掉死因独立显示（死因已在志里描述）
//   4. 铭字号 12pt（和志一样·不抢眼）·接在志末尾作为韵语结句
// 视觉布局：
//   1. 碑额"X之墓"（18pt 金色·4% 顶部）
//   2. 副标题"朝代 · 职业 · 享年X岁"（10pt 浅灰·13% 偏上）
//   3. 志 + 铭（连续·12pt 浅灰·志 4-5 行 + 铭 1-2 行韵语结句·22%-78% 主体）
//   4. 印章（右下角）

// 刻字
function drawCarvedText(ctx, text, x, y, fontSize, op, opts) {
  if (!opts) opts = {}
  ctx.save()
  ctx.globalAlpha = op
  var bold = opts.bold ? 'bold ' : ''
  ctx.font = bold + fontSize + 'px ' + ui.getFontStack()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = STONE.carveDark
  ctx.fillText(text, x + 0.5, y + 0.5)
  ctx.fillStyle = opts.color || 'rgba(50,50,46,0.95)'
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ═══════════════════════════════════════════════════════════════
// v3.0.20: 顶标删除（被灵动岛挡住）·位置信息挪到主碑底部"第 N / 55"小字
function drawSwipeHint(ctx, l, op) {
  drawText(ctx, '← 划动查看其他墓碑 →', l.cx, l.h - 60, {
    fontSize: l.fs.pagerHint,
    color: 'rgba(80,80,76,0.5)',
    align: 'center', baseline: 'middle',
    letterSpacing: 0,
    opacity: op * 0.7,
  })
}

// v3.0.19: 划动提示（先生 01:19 反馈——文案优化 + 位置上移到顶标下方·避开祭台）
function drawSwipeHintSimple(ctx, l, op) {
  // v3.0.33: 先生 02:15 让自查·怀疑 drawSwipeHintSimple 没真的渲染
  // 修法：加红色调试背景确保看见 + 缩短文案
  var text = '左右划切换 · 上划返回'
  var y = 600  // 墓身下半部·距香炉 (619) 还有 19px
  // 调试：半透红色背景确认位置
  ctx.save()
  ctx.fillStyle = 'rgba(255,0,0,0.15)'
  ctx.fillRect(l.cx - 100, y - 12, 200, 24)
  ctx.restore()
  drawText(ctx, text, l.cx, y, {
    fontSize: 11,
    color: 'rgba(40,30,20,1)',  // 黑·最强对比
    align: 'center', baseline: 'middle',
    letterSpacing: 1,
    opacity: op,
    bold: true,
  })
}

// 简易文字拆行
function splitText(text, maxWidth, fontSize) {
  if (!text) return ['']
  var maxChars = Math.floor(maxWidth / fontSize) || 12
  var lines = []
  var cur = ''
  var segs = text.split(/([，。；！？、])/)
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i]
    if (!seg) continue
    if ((cur + seg).length <= maxChars) {
      cur += seg
    } else {
      if (cur) lines.push(cur)
      if (seg.length > maxChars) {
        for (var j = 0; j < seg.length; j += maxChars) {
          lines.push(seg.substring(j, j + maxChars))
        }
        cur = ''
      } else {
        cur = seg
      }
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

// 测试模式
function drawTestPoemSkeleton(ctx) {
  var l = layout
  // v2.5.0: loading 旋转环跟主碑（中央）
  var cx = Math.floor(l.w / 2) + cameraX * l.w * 0.1
  var cy = l.mainY + l.mainH / 2
  ctx.save()
  ctx.translate(cx, cy - 30)
  ctx.rotate(testPoemLoadingStartTime > 0 ? (Date.now() - testPoemLoadingStartTime) / 500 : 0)
  ctx.strokeStyle = 'rgba(58,58,54,0.7)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 14, 0, Math.PI * 1.4)
  ctx.stroke()
  ctx.restore()
  if (testPoemError) {
    drawText(ctx, '生成失败', cx, cy + 8, {
      fontSize: 13, color: 'rgba(168,58,48,0.9)', align: 'center', baseline: 'middle',
    })
  } else {
    drawText(ctx, '史官落笔中…', cx, cy + 8, {
      fontSize: 13, color: 'rgba(40,40,38,0.9)', align: 'center', baseline: 'middle',
    })
  }
}

function triggerTestPoemCloud() {
  if (testPoemLoading) return
  if (!testPoemCase) return
  testPoemLoading = true
  testPoemError = null
  testPoemLoadingStartTime = Date.now()
  var tc = testPoemCase
  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.callFunction({
      name: 'ai_write_death',
      data: {
        state: {
          name: tc.name, gender: tc.gender, age: tc.age,
          occupation: tc.occupation, socialClass: tc.socialClass,
          dynasty: tc.dynasty, city: tc.city, year: tc.year,
          life_number: tc.life_number, lifespan: tc.lifespan,
        },
        narrativeHistory: tc.narrativeHistory,
        deathType: tc.deathType,
      },
      success: function(res) {
        testPoemLoading = false
        if (res && res.result && res.result.success) {
          setTestPoemData({
            name: tc.name, dynasty: tc.dynasty, deathType: tc.deathType,
            deathCause: res.result.deathCause,
            epRecord: res.result.epRecord,
            epitaph: res.result.epitaph,
            highestAchievement: null,
            _deathState: {
              name: tc.name, dynasty: tc.dynasty, city: tc.city,
              eraDisplay: tc.year + '年', age: tc.age,
              life_number: tc.life_number, historical_shelter: 0,
              epitaph: res.result.epitaph,
            },
          })
          var testLife = {
            life_number: tc.life_number,
            name: tc.name, age: tc.age,
            dynasty: tc.dynasty, city: tc.city,
            occupation: tc.occupation, socialClass: tc.socialClass,
            epitaph: res.result.epitaph,
            epRecord: res.result.epRecord,
            deathCause: res.result.deathCause,
            deathType: tc.deathType,
            _isTest: true, _isMain: true,
            createdAt: Date.now(),
          }
          playerLives.push(testLife)
          // 重建群碑
          otherStones = buildOtherStones(testLife)
          ready = true
        } else {
          testPoemError = (res && res.result && res.result.error) || '未知错误'
        }
      },
      fail: function(err) {
        testPoemLoading = false
        testPoemError = (err && err.errMsg) || '调用失败'
        ready = true
      },
    })
  } else {
    testPoemLoading = false
    testPoemError = '微信环境不可用'
  }
}

module.exports = { init: init, render: render, onTouch: onTouch, autoNext: null }
