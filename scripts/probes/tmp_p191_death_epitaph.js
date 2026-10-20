// P-191 probe: 死亡页碑文是否会写出碑外 / 压到「上划返回」提示
// 载入真实 death.js（不复制常量）：init → _calcLayout → _mainStoneBox → _drawFarStoneText
// 用 stub ctx 记录每次 fillText 的 y（drawCarvedText 无 transform，y 均绝对坐标）
const path = require('path')

const cases = [
  { w: 320, h: 568, label: '窄屏 320x568' },
  { w: 375, h: 667, label: '常规 375x667' },
  { w: 375, h: 812, label: '长屏 375x812' },
  { w: 414, h: 896, label: '大屏 414x896' },
]

const LONG_ZHI = '你生于江南一个没落的书香门第，父亲早亡，母亲靠替人抄书度日。十六岁那年你中了秀才，却因不肯贿赂主考而屡试不第，此后二十年你在县学教书为生，教出了三十多个学生。四十岁那年遇到一场大水，你带着学生在堤上守了七天七夜，堤保住了，你却落下了病根。晚年你把家中旧书全数捐给了县学，自己搬到城外一间草屋里住。'
const SHORT_MING = '一生清白，两袖清风。'
const HUGE_ZHI = LONG_ZHI + LONG_ZHI + LONG_ZHI  // 极端长文，测截断兜底

function makeCtx() {
  const rec = { maxY: 0, minY: Infinity, texts: [], sizes: [] }
  const noop = () => {}
  const ctx = {
    _rec: rec,
    save: noop, restore: noop, beginPath: noop, closePath: noop, fill: noop,
    stroke: noop, fillRect: noop, strokeRect: noop, ellipse: noop, moveTo: noop,
    lineTo: noop, arc: noop, translate: noop, scale: noop, rotate: noop,
    setLineDash: noop, clearRect: noop, createLinearGradient: () => ({ addColorStop: noop }),
    measureText: t => ({ width: String(t).length * 12 }),
    fillText: (t, x, y) => {
      rec.texts.push(String(t))
      rec.maxY = Math.max(rec.maxY, y)
      rec.minY = Math.min(rec.minY, y)
      const m = /(\d+)px/.exec(ctx.font || '')
      if (m) rec.sizes.push(parseInt(m[1], 10))
    },
    strokeText: noop,
  }
  return ctx
}

function runCase(w, h, label, zhi, ming) {
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] })
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2 }),
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  }
  const death = require(path.join(__dirname, '../../minigame/scenes/death.js'))
  death.init([], {
    life_number: 1, name: '测试', gender: 'male', age: 62, dynasty: '明',
    occupation: '塾师', epitaph: ming, epRecord: zhi, deathType: '疾终',
  }, 'male')

  const l = death._calcLayout()
  const box = death._mainStoneBox(l)
  const ctx = makeCtx()
  death._drawFarStoneText(ctx, box.stone, box.sx, box.sy, box.sw, box.sh, 1.0, 1, 40)

  const stoneBottom = box.sy + box.sh
  const hintTop = box.sy + box.sh - 50 - 5   // 提示 10px·middle 基线 → 上沿 -5
  // drawCarvedText 用 middle 基线：字底 = y + size/2；取实测最大字号的一半当保守字高
  const maxSize = Math.max.apply(null, ctx._rec.sizes.length ? ctx._rec.sizes : [12])
  const textBottom = ctx._rec.maxY + maxSize / 2
  const eps = 0.5
  const okStone = textBottom <= stoneBottom + eps
  const okHint = textBottom <= hintTop + eps
  const m = death._lastTextMetrics() || { lines: 0, truncated: false }
  const plan = { items: new Array(m.lines || 0), truncated: m.truncated }

  console.log(
    (okStone && okHint ? '✅' : '⛔') +
    ' ' + label +
    ' | 字底 ' + textBottom.toFixed(1) + ' / 碑底 ' + stoneBottom.toFixed(1) +
    ' / 提示上沿 ' + hintTop.toFixed(1) +
    ' | 行数 ' + (plan.items ? plan.items.length : 0) +
    ' | 字号 ' + maxSize +
    ' | 截断 ' + (plan.truncated ? '是' : '否') +
    (okStone ? '' : '  ← 写出碑外 ' + (textBottom - stoneBottom).toFixed(1) + 'px') +
    (okHint ? '' : '  ← 压提示 ' + (textBottom - hintTop).toFixed(1) + 'px')
  )
  return okStone && okHint
}

let allOk = true
console.log('— 100 字长志（先生实际长度上限） —')
cases.forEach(c => { allOk = runCase(c.w, c.h, c.label, LONG_ZHI, SHORT_MING) && allOk })
console.log('— 短志（3 字铭·回归不应变化） —')
cases.forEach(c => { allOk = runCase(c.w, c.h, c.label, '', '埋骨一生') && allOk })
console.log('— 极端 300 字（测截断兜底） —')
cases.forEach(c => { allOk = runCase(c.w, c.h, c.label, HUGE_ZHI, SHORT_MING) && allOk })
console.log(allOk ? '\n全部在碑面内 ✅' : '\n有越界 ⛔')
process.exit(allOk ? 0 : 1)
