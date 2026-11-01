// PMO 244 期：② UX-A 榜单目标条（drawBoardTarget）横向重叠实测
// 复刻 game.js:1999-2023 的绘制几何：左列 textAlign=left @ padding+6 (bold 10px)
// 中列 textAlign=center @ padding+w/2 (9px)，两列各自独立、从不 measureText
const { createCanvas, GlobalFonts } = require('/opt/openclaw/node_modules/.pnpm/@napi-rs+canvas@0.1.95/node_modules/@napi-rs/canvas')
GlobalFonts.registerFromPath('/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', 'CJK')
const c = createCanvas(10, 10), ctx = c.getContext('2d')
const FF = 'CJK'   // 真机为楷体，宽度略窄于微米黑 → 本测为「偏保守」估计

const BOARDS = {
  '名医榜': '孔伯华(民国)', '名将榜': '林冲(宋)', '富商榜': '伍崇曜(清)',
  '文豪榜': '黄景仁(清)', '能臣榜': '赵高(秦)', '义士榜': '王光兴(明末)',
  '全能榜': '关汉卿(元)', '颜值榜': '岳飞(南宋)',
}
const PAD = 14
const widths = [320, 375, 390, 414]

let worst = { ov: -1e9 }
let rows = 0, ovRows = 0
for (const W of widths) {
  const w = W - PAD * 2
  const cx = PAD + w / 2
  console.log(`\n=== ${W} 宽（条宽 ${w}px，中线 ${cx}）===`)
  for (const [name, person] of Object.entries(BOARDS)) {
    for (const diff of [12, 148, 1280, 19978]) {
      ctx.font = 'bold 10px ' + FF
      const leftW = ctx.measureText('🏆 ' + name).width
      const leftEnd = PAD + 6 + leftW
      ctx.font = '9px ' + FF
      const txt = `还差${diff}分超越${person}，登上${name}`
      const midW = ctx.measureText(txt).width
      const midStart = cx - midW / 2
      const ov = leftEnd - midStart      // >0 即重叠
      rows++
      if (ov > 0) ovRows++
      if (ov > worst.ov) worst = { ov, W, name, person, diff, leftEnd, midStart, midW }
      if (W === 320 || ov > 0) console.log(`  ${name} diff=${diff}: 左标签止于 ${leftEnd.toFixed(1)} / 中段起于 ${midStart.toFixed(1)} → 重叠 ${ov.toFixed(1)}px`)
    }
  }
}
console.log(`\n=== 汇总：${ovRows}/${rows} 组合重叠（${(ovRows / rows * 100).toFixed(1)}%）`)
console.log(`  最差：${worst.W} 宽 ${worst.name} diff=${worst.diff} 重叠 ${worst.ov.toFixed(1)}px（左止 ${worst.leftEnd.toFixed(1)}，中起 ${worst.midStart.toFixed(1)}）`)
