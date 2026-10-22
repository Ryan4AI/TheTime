// P-192 probe: 选随身之物页在短屏上「卡片网格 / 性别条 / 确认按钮」是否互相压叠或出屏
// 真实模块 + 暴露的 _calcLayout/_getLayout（不复制常量）
const path = require('path')
const SP = path.join(__dirname, '../../minigame/scenes/selection.js')

function runCase(w, h) {
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] })
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2 }),
    getStorageSync: () => null, setStorageSync: () => {}, removeStorageSync: () => {},
  }
  const s = require(SP)
  s._calcLayout()
  const l = s._getLayout()

  const cards = l.cards
  const last = cards[cards.length - 1]
  const cardBottom = last.y + l.cardH
  const genderBottom = l.genderOptY + l.genderRowH
  const btnBottom = l.btnY + l.btnH
  const reserve = h >= 560 ? 36 : 22
  const hintBottom = l.showHint ? btnBottom + 30 + Math.min(9, w * 0.023) / 2 : -1
  const genderTotalW = l.genderPillW * 3 + l.genderPillGap * 2
  const genderRight = l.cx + genderTotalW / 2

  const errs = []
  if (cardBottom > l.genderOptY) errs.push('卡片压性别条 ' + (cardBottom - l.genderOptY) + 'px')
  if (genderBottom > l.btnY) errs.push('性别条压按钮 ' + (genderBottom - l.btnY) + 'px')
  if (btnBottom + reserve > h) errs.push('底部留白不足 ' + (btnBottom + reserve - h) + 'px')
  if (last.y + l.cardH > h) errs.push('卡片出屏 ' + (last.y + l.cardH - h) + 'px')
  if (l.cardH < 50) errs.push('卡片过矮 ' + l.cardH + 'px')
  if (l.cardW * 2 + l.gap * 3 > w) errs.push('卡片横向出屏')
  if (genderRight > w - 2) errs.push('性别条横向出屏 ' + (genderRight - (w - 2)) + 'px')
  if (l.gridTop < l.titleY + l.titleS + l.subS) errs.push('标题压卡片')
  if (l.showHint && hintBottom > h) errs.push('彩蛋提示出屏 ' + (hintBottom - h) + 'px')

  return {
    w, h, cardH: l.cardH, vGap: l.vGap, cardBottom, genderY: l.genderOptY,
    btnY: l.btnY, btnBottom, hint: l.showHint, errs,
  }
}

const screens = [[320, 480], [320, 568], [360, 640], [375, 667], [375, 812], [414, 896], [768, 1024]]
let bad = 0
for (const [w, h] of screens) {
  const r = runCase(w, h)
  if (r.errs.length) bad++
  console.log((r.errs.length ? '⛔ ' : '✅ ') + w + 'x' + h +
    ' | 卡高=' + r.cardH + ' 行距=' + r.vGap +
    ' | 卡底=' + r.cardBottom + ' 性别=' + r.genderY + ' 按钮=' + r.btnY + '-' + r.btnBottom +
    ' | 提示=' + (r.hint ? '显示' : '隐藏') +
    (r.errs.length ? ' | ' + r.errs.join('；') : ''))
}
console.log('\n' + (bad === 0 ? '🎉 ' + screens.length + '/' + screens.length + ' 档全绿' : '⛔ ' + bad + ' 档异常'))
process.exit(bad === 0 ? 0 : 1)
