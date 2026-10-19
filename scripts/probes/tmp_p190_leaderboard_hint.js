// P-190 probe: 榜单底部提示是否压住末行（真实模块 + 暴露的 _contentMetrics）
const path = require('path')
const LP = path.join(__dirname, '../../minigame/scenes/leaderboard.js')

function runCase(w, h, n) {
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] })
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2 }),
    getStorageSync: () => null, setStorageSync: () => {}, removeStorageSync: () => {},
  }
  const lb = require(LP)
  lb.init()
  const cm = lb._contentMetrics(n)
  const shown = n > cm.maxRows
  const gap = shown ? cm.hintTop - cm.lastRowBottom : null // 提示显示时才需要间距
  return { w, h, n, maxRows: cm.maxRows, lastRowBottom: cm.lastRowBottom, hintTop: cm.hintTop, shown, gap }
}

for (const w of [320, 375, 414]) {
  const h = w === 320 ? 568 : w === 375 ? 667 : 896
  for (const n of [10, 100]) {
    const r = runCase(w, h, n)
    const ok = !r.shown ? true : r.gap > 0
    console.log((ok ? '✅ 不重叠' : '⛔ 重叠') +
      ' | ' + w + 'x' + h + ' | 数据 ' + n + ' 条 → 显示 ' + r.maxRows + ' 行' +
      ' | 末行底=' + r.lastRowBottom + ' 提示顶=' + r.hintTop +
      (r.shown ? ' | 间距=' + r.gap + 'px' : ' | 无提示'))
  }
}
