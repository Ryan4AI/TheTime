// P-188 probe: death.js 上划返回阈值是否随屏宽缩放
// 载入真实 death.js 模块（不复制常量），stub wx，模拟划动 → 看是否返回 { scene: 'entry' }
const path = require('path')

function runCase(w, h, swipePx, label) {
  // 每次重新 require（清缓存）
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] })
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2 }),
    getStorageSync: () => [],
    setStorageSync: () => {},
    removeStorageSync: () => {},
  }
  const death = require(path.join(__dirname, '../../minigame/scenes/death.js'))
  death.init([], { name: '测试', born: 1000, died: 1060 }, 'male')
  return new Promise(resolve => {
    setTimeout(() => {
      const x = Math.floor(w / 2)
      const y0 = Math.floor(h * 0.7)
      death.onTouch(x, y0, 'start')
      death.onTouch(x, y0 - swipePx, 'move')
      const r = death.onTouch(x, y0 - swipePx, 'end')
      resolve({ w, swipePx, label, result: r })
    }, 2600)
  })
}

;(async () => {
  const cases = [
    [320, 568, 60, '窄屏上划 60px（旧逻辑需 100）'],
    [375, 667, 60, '常规屏上划 60px'],
    [414, 896, 60, '大屏上划 60px'],
    [375, 667, 30, '常规屏上划 30px（应不触发）'],
  ]
  for (const [w, h, px, label] of cases) {
    const r = await runCase(w, h, px, label)
    const hit = r.result && r.result.scene === 'entry'
    console.log(
      (hit ? '✅ 触发返回' : '⛔ 未触发') +
      ' | ' + w + 'x' + h + ' | ' + px + 'px | ' + label +
      ' | 返回=' + JSON.stringify(r.result)
    )
  }
})()
