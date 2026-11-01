// P-193 probe: 榜单目标条（drawBoardTarget）文案是否与左侧榜名相撞 / 是否出框
// 用真实 game.js 里的 BOARD_TARGET_PERSON + 文案格式，按 drawBoardTarget 的绘制坐标复算
const fs = require('fs')
const path = require('path')
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas')
const src = fs.readFileSync(path.join(__dirname, '../../minigame/scenes/game.js'), 'utf8')

// 1) 抽 BOARD_TARGET_PERSON
const m = /const BOARD_TARGET_PERSON = \{([\s\S]*?)\}/.exec(src)
const TARGET = {}
for (const mm of m[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) TARGET[mm[1]] = mm[2]
const BOARDS = ['名医榜', '名将榜', '富商榜', '文豪榜', '能臣榜', '义士榜', '全能榜', '颜值榜']

const ctx = createCanvas(10, 10).getContext('2d')
const FAM = "PingFang SC, sans-serif"
const W = (t, fs_, bold) => { ctx.font = (bold ? 'bold ' : '') + fs_ + 'px ' + FAM; return ctx.measureText(t).width }

function caseOne(w, board, diff, on) {
  const padding = 14
  const barW = w - padding * 2
  const h = 22
  const leftTxt = '🏆 ' + board
  const leftX = padding + 6
  const leftEnd = leftX + W(leftTxt, 10, true)
  let centerTxt
  if (on) centerTxt = '已上榜 · 点击查看排名'
  else {
    const tp = TARGET[board]
    centerTxt = tp ? ('还差' + diff + '分超越' + tp + '，登上' + board) : ('还差' + diff + '分登上' + board)
  }
  const cw = W(centerTxt, 9, false)
  const cx = padding + barW / 2
  const cStart = cx - cw / 2, cEnd = cx + cw / 2
  return { w, board, on, leftEnd: +leftEnd.toFixed(1), cStart: +cStart.toFixed(1), cEnd: +cEnd.toFixed(1),
    barRight: +(padding + barW).toFixed(1), gap: +(cStart - leftEnd).toFixed(1), rightOver: +(cEnd - (padding + barW)).toFixed(1) }
}

let bad = 0
for (const w of [320, 360, 375, 414]) {
  console.log('\n=== 屏宽 ' + w + '（条宽 ' + (w - 28) + '，9px 中文=9px/字） ===')
  for (const b of BOARDS) {
    for (const on of [false, true]) {
      const r = caseOne(w, b, 148, on)
      const overlap = r.gap < 0
      const out = r.rightOver > 0
      if (overlap || out) bad++
      console.log(
        (overlap ? '⛔ 撞字' : out ? '⛔ 出框' : '✅ 正常') +
        ' | ' + b + (on ? '（已上榜）' : '（未上榜）') +
        ' | 榜名止=' + r.leftEnd + ' 中段起=' + r.cStart + ' 中段止=' + r.cEnd +
        ' | 间距=' + r.gap + (out ? ' | 右溢=' + r.rightOver : ''))
    }
  }
}
console.log('\n问题用例合计 = ' + bad)

// ===== 追加：真实分差范围扫描（分差位数会变，文案宽度随位数增长）=====
console.log('\n=== 分差位数扫描（320 宽最窄）===')
for (const diff of [148, 999, 1234, 4800, 12345]) {
  for (const b of ['名医榜', '义士榜', '名将榜']) {
    const r = caseOne(320, b, diff, false)
    console.log((r.gap < 0 || r.rightOver > 0 ? '⛔' : '✅') + ' 差=' + diff + ' | ' + b +
      ' | 榜名止=' + r.leftEnd + ' 中段起=' + r.cStart + ' 间距=' + r.gap + (r.rightOver > 0 ? ' 右溢=' + r.rightOver : ''))
  }
}
