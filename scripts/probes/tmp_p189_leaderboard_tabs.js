// P-189 probe: leaderboard tab 栏是否在窄屏出屏（真实模块 + 暴露的 _tabMetrics）
const path = require('path')
const LP = path.join(__dirname, '../../minigame/scenes/leaderboard.js')

function runCase(w, h) {
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] })
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2 }),
    getStorageSync: () => null, setStorageSync: () => {}, removeStorageSync: () => {},
  }
  const lb = require(LP)
  lb.init()
  const tm = lb._tabMetrics()
  const rightMost = tm.startX + 4 * (tm.tabW + tm.tabGap) + tm.tabW
  const pad = 12
  const overflow = Math.round((rightMost - (w - pad)) * 10) / 10
  return { w, tabW: tm.tabW, rightMost, limit: w - pad, overflow }
}

for (const [w, h] of [[320, 568], [375, 667], [414, 896], [768, 1024]]) {
  const r = runCase(w, h)
  const ok = r.overflow <= 0 && r.tabW >= 44
  console.log((ok ? '✅ 无出屏' : '⛔ 出屏') +
    ' | ' + w + 'x' + h +
    ' | tabW=' + r.tabW +
    ' | 最右=' + r.rightMost + ' 上限=' + r.limit +
    ' | 溢出=' + r.overflow + 'px')
}
