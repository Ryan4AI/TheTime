// Intro scene — 穿越特效
// 时空隧道 + 命运轮盘：光圈旋转中朝代文字飞奔而过 → 减速定格
// 动画立刻开始，云函数异步拿身份数据，返回后定格显示真实结果

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText } = ui

var state = null
var layout = {}
var STAR_DUST = null
var FATE_DESTINATIONS = null

// 命运池 — 与数据库 era_cities + era_meta 保持一致的朝代·城市组合
// 数据来源：generate_identity 加权随机采样验证（2026-05-31）
var FATE_POOL = [
  '夏·阳城', '夏·斟鄩', '夏·安邑', '夏·亳', '夏·偃师商城', '商·殷', '商·朝歌', '西周·丰京',
  '西周·镐京', '西周·岐邑', '西周·成周', '春秋·洛邑（成周）', '春秋·新郑', '春秋·临淄', '春秋·郢都', '春秋·绛（翼）',
  '春秋·雍城', '春秋·商丘', '春秋·新郑（春秋）', '春秋·姑苏', '春秋·会稽', '战国·晋阳', '战国·安邑', '战国·平阳',
  '战国·大梁', '战国·邯郸', '战国·新郑', '战国·临淄', '战国·咸阳', '战国·栎阳', '战国·郢都', '战国·蓟',
  '战国·即墨', '战国·长平', '秦·咸阳', '秦·临洮', '秦·番禺', '秦·沙丘', '秦·大泽乡', '秦·沛县',
  '秦·吴', '秦·巨鹿', '西汉·长安', '西汉·洛阳', '西汉·陇西', '西汉·漠北', '东汉·洛阳', '东汉·邺',
  '东汉·疏勒', '东汉·燕然山', '东汉·巨鹿', '东汉·许昌', '东汉·成都', '东汉·建业', '三国·成都', '三国·建业',
  '三国·武昌', '三国·洛阳', '西晋·洛阳', '西晋·长安', '东晋·建康', '东晋·淝水', '南北朝·平城', '南北朝·洛阳',
  '南北朝·怀朔镇', '南北朝·建康', '南北朝·邺', '隋·大兴城', '隋·建康', '唐·长安', '唐·洛阳', '唐·神都',
  '唐·睢阳', '唐·开封', '五代十国·洛阳', '五代十国·开封', '北宋·开封', '北宋·江陵', '北宋·临安', '南宋·临安',
  '南宋·崖山', '元·大都', '元·上都', '元·濠州', '元·应天府', '元·凤阳', '明·京师', '清·京师',
  '清·广州', '清·南京', '中华民国·南京', '中华民国·重庆', '中华民国·北京',
]

// 持有命牌（抽中的真实结果）
var settledFate = null

function shuffle(arr) {
  var a = arr.slice()
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

function calcCycleTimings(count, startMs, endMs) {
  var timings = []
  for (var i = 0; i < count; i++) {
    timings.push(startMs + (endMs - startMs) * i / Math.max(1, count - 1))
  }
  return timings
}

function generateStarDust(w, h) {
  var arr = []
  for (var i = 0; i < 80; i++) {
    arr.push({
      x: Math.random(), y: Math.random(),
      size: 0.5 + Math.random() * 1.5,
      alpha: 0.2 + Math.random() * 0.4,
      driftX: (Math.random() - 0.5) * 0.3,
      driftY: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,  // v0.1.67: 每个光点独立相位
    })
  }
  return arr
}

function calcLayout() {
  var sys = getSystemInfo()
  layout = {
    w: sys.width, h: sys.height,
    cx: Math.floor(sys.width / 2),
    cy: Math.floor(sys.height / 2),
  }
}

function init(items, identity, gender) {
  calcLayout()
  STAR_DUST = generateStarDust(layout.w, layout.h)
  settledFate = null

  var cycleTimings = calcCycleTimings(8, 80, 300)
  var cycleTimes = []
  var accum = 0
  for (var i = 0; i < cycleTimings.length; i++) {
    cycleTimes.push(accum)
    accum += cycleTimings[i]
  }

  // 从池子里随机取8个展示
  FATE_DESTINATIONS = shuffle(FATE_POOL).slice(0, 8)

  state = {
    startTime: Date.now(),
    duration: 2800,
    items: items || [],
    identity: null,
    cloudDone: false,
    cycleTimings: cycleTimings,
    cycleTimes: cycleTimes,
    totalCycleMs: accum,
    settled: false,
    touchSkip: false,
    genderPref: gender || null,
  }
  module.exports.autoNext = null

  // 异步生成身份（动画播放期间在后台跑）
  var params = {}
  if (state.genderPref) params.gender = state.genderPref
  wx.cloud.callFunction({
    name: 'generate_identity',
    data: params,
    success: function(res) {
      if (res.result && res.result.success && state) {
        state.identity = res.result.identity
        state.cloudDone = true
        // 准备定格显示的目的地文字
        settledFate = (res.result.identity.dynasty || '') + '·' + (res.result.identity.city || '')
      }
    },
    fail: function(err) {
      // v0.1.65 修复：失败时**不要**把 cloudDone 设成 true
      // 之前这行导致云函数失败时动画直接卡在静止状态，但 identity 没生成
      // 现在：失败时记录 error，动画继续转，玩家可以离开或重试
      if (state) {
        state.identityError = (err && (err.errMsg || err.message)) || '云函数调用失败'
        console.error('[intro] generate_identity 失败:', state.identityError)
      }
    }
  })
}

function onTouch() {
  if (state) {
    var elapsed = Date.now() - state.startTime
    // v0.1.65 修复：只有 identity 真的生成出来才允许跳过 intro
    // 之前 elapsed > 400 就能跳，但 cloudDone=true 后 identity 可能还是 null
    if (elapsed > 400 && state.cloudDone && state.identity) {
      module.exports.autoNext = { scene: 'identity', items: state.items, identity: state.identity }
    }
  }
  return null
}

function drawStarDust(ctx, p) {
  var w = layout.w, h = layout.h
  var now = Date.now()
  var t = now / 1000  // 持续秒数
  for (var i = 0; i < STAR_DUST.length; i++) {
    var s = STAR_DUST[i]
    // v0.1.68：加快漂移速度（先生 14:05 反馈太慢）
    var nx = s.x + s.driftX * p + Math.sin(t * 1.8 + s.phase) * 0.04
    var ny = s.y + s.driftY * p + Math.cos(t * 1.5 + s.phase * 1.3) * 0.04
    ctx.fillStyle = 'rgba(200,190,170,' + (s.alpha * (1 - p * 0.5)) + ')'
    ctx.beginPath()
    ctx.arc(w * nx, h * ny, s.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

function render(ctx) {
  var w = layout.w, h = layout.h, cx = layout.cx, cy = layout.cy
  var now = Date.now()
  var elapsed = now - state.startTime

  // ──── 渐入 ────
  var fadeIn = Math.min(1, elapsed / 400)
  if (fadeIn <= 0) return
  ctx.save()
  ctx.globalAlpha = fadeIn

  // 深空背景
  drawBackground(ctx, COLORS.darkBg)

  // ──── 星尘 ────
  drawStarDust(ctx, Math.min(1, elapsed / 800))

  // ──── 时空隧道（旋转光圈）────
  var tunnelP = Math.min(1, elapsed / 600)
  ctx.save()
  ctx.globalAlpha = tunnelP * (state.settled ? 0.5 : 1)
  for (var ri = 0; ri < 4; ri++) {
    var rs = 0.6 + ri * 0.12
    ctx.strokeStyle = 'rgba(200,168,124,' + ((1 - ri * 0.1) * 0.12) + ')'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.max(w, h) * 0.5 * rs, Math.max(w, h) * 0.5 * rs * 0.35, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // ──── 命运文字飞奔 ────
  var currentIdx = 0
  var prog = 0
  if (!state.settled) {
    // 循环动画：云函数回来之前一直转
    var cycleElapsed = elapsed % state.totalCycleMs
    for (var ci = state.cycleTimes.length - 1; ci >= 0; ci--) {
      if (cycleElapsed >= state.cycleTimes[ci]) {
        currentIdx = ci
        prog = (cycleElapsed - state.cycleTimes[ci]) / state.cycleTimings[ci]
        break
      }
    }
    if (currentIdx >= FATE_DESTINATIONS.length) currentIdx = FATE_DESTINATIONS.length - 1

    // 云函数返回 → 定格
    if (state.cloudDone) {
      state.settled = true
      state.settleStart = elapsed
    }

    // 命运文字
    if (currentIdx >= 0 && FATE_DESTINATIONS[currentIdx]) {
      var dest = FATE_DESTINATIONS[currentIdx]
      var toCenter = Math.abs(prog - 0.5) * 2
      var a = 1 - toCenter
      ctx.save()
      ctx.translate(cx, cy - 8)
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 0.9))
      drawText(ctx, dest, 0, 0, {
        fontSize: Math.min(20, w * 0.052),
        color: COLORS.paperDarker,
        align: 'center', baseline: 'middle',
      })
      ctx.restore()
    }

    // 名人彩蛋提示：闪烁
    var hintAlpha = 0.3 + Math.sin(elapsed * 0.003) * 0.15
    drawText(ctx, '✦ 长河漫漫，有些名字永不湮灭', cx, Math.floor(h * 0.30), {
      fontSize: Math.min(10, w * 0.026),
      color: COLORS.gold,
      align: 'center', baseline: 'middle',
      opacity: hintAlpha * 0.7,
    })
  }

  // ──── 定格 ────
  if (state.settled) {
    var settleP = Math.min(1, (elapsed - state.settleStart) / 500)
    var pulse = 1 + Math.sin(now * 0.004) * 0.015

    // 金色脉动光环
    var glowR2 = Math.min(140, w * 0.38) * pulse
    var glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR2)
    glowGrad.addColorStop(0, 'rgba(200,168,124,' + (0.12 * settleP) + ')')
    glowGrad.addColorStop(0.5, 'rgba(200,168,124,' + (0.04 * settleP) + ')')
    glowGrad.addColorStop(1, 'rgba(200,168,124,0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(cx, cy, glowR2, 0, Math.PI * 2)
    ctx.fill()

    // 展示真实命运（如果云函数已返回）
    ctx.save()
    ctx.globalAlpha = settleP

    if (settledFate) {
      var subAlpha = Math.max(0, Math.min(1, (settleP - 0.3) * 2))
      drawText(ctx, settledFate, cx, cy - 16, {
        fontSize: Math.min(22, w * 0.058),
        color: COLORS.goldLight,
        align: 'center', baseline: 'middle',
        opacity: subAlpha,
      })
      drawText(ctx, '═ 命运已定 ═', cx, cy + 20, {
        fontSize: Math.min(14, w * 0.036),
        color: COLORS.gold,
        align: 'center', baseline: 'middle',
        opacity: subAlpha * 0.7,
      })
    } else {
      // 云函数还没回来，显示加载态
      drawText(ctx, '═ 命运已定 ═', cx, cy, {
        fontSize: Math.min(16, w * 0.042),
        color: COLORS.gold,
        align: 'center', baseline: 'middle',
        opacity: settleP * 0.8,
      })
    }
    ctx.restore()
  }

  ctx.restore()

  // ──── 自动切换到身份卡 ────
  if (state.settled && state.settleStart) {
    var settleElapsed = elapsed - state.settleStart
    if (settleElapsed > 800) {
      module.exports.autoNext = { scene: 'identity', items: state.items, identity: state.identity }
    }
  }
}

module.exports = { init, render, onTouch }
