// PMO 243 期：选项行数/字号实测（真 CJK 字体 + 复刻 adjustFluidLayout/drawOptions 算术）
const { createCanvas, GlobalFonts } = require('/opt/openclaw/node_modules/.pnpm/@napi-rs+canvas@0.1.95/node_modules/@napi-rs/canvas')
GlobalFonts.registerFromPath('/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', 'wqy')
const c = createCanvas(800, 400)
const ctx = c.getContext('2d')
const FAM = '"STKaiti","KaiTi","楷体",wqy'
const meas = (t, px) => { ctx.font = `${px}px ${FAM}`; return ctx.measureText(t).width }

const labels = require('/tmp/opts243.json')

function classify(label, w) {
  const optW = w - 28
  const textMaxW = optW - 24
  const charWidthSingle = 14
  const maxCharsSingleLine = Math.floor(textMaxW / charWidthSingle)
  const len = label.length
  const lines = len > maxCharsSingleLine ? 2 : 1
  const textMaxW2 = optW - 36
  const r = { w, len, lines, maxCharsSingleLine, textMaxW2, optW }
  if (lines === 1) {
    let fs = 15
    while (meas(label, fs) > textMaxW2 && fs > 12) fs--
    r.fontSize = fs
    r.textW = meas(label, fs)
    r.fits = r.textW <= textMaxW2
    r.needMin = meas(label, 12)
    r.h = 36
    r.emptyLine2 = false
  } else {
    const fs = 12
    const maxCharsPerLine = Math.floor(textMaxW2 / fs)
    const line1 = label.slice(0, maxCharsPerLine)
    const line2 = label.slice(maxCharsPerLine)
    r.fontSize = fs
    r.maxCharsPerLine = maxCharsPerLine
    r.line1W = meas(line1, fs)
    r.line2W = line2 ? meas(line2, fs) : 0
    r.emptyLine2 = line2.length === 0
    r.overflow = r.line2W > textMaxW2 || r.line1W > textMaxW2
    r.fitsAt12Single = meas(label, 12) <= textMaxW2
    r.h = 52
  }
  return r
}

const WIDTHS = [320, 375, 390, 414]
for (const w of WIDTHS) {
  const rows = labels.map(l => classify(l, w))
  const single = rows.filter(r => r.lines === 1)
  const dbl = rows.filter(r => r.lines === 2)
  const fsDist = {}
  for (const r of single) fsDist[r.fontSize] = (fsDist[r.fontSize] || 0) + 1
  const emptyL2 = dbl.filter(r => r.emptyLine2)
  const over = rows.filter(r => r.overflow)
  const wastedAsSingle = emptyL2.filter(r => r.fitsAt12Single)
  console.log(`\n=== 宽 ${w} (optW=${rows[0].optW}, 单行阈值=${rows[0].maxCharsSingleLine} 字) ===`)
  console.log(`  单行 ${single.length} / 双行 ${dbl.length} / 总 ${rows.length}`)
  console.log(`  单行字号分布 ${JSON.stringify(fsDist)}`)
  console.log(`  双行里第二行为空 ${emptyL2.length} 条（其中单行 12px 本可放下 ${wastedAsSingle.length} 条 → 白多 16px 高 + 文字上浮 4px）`)
  if (emptyL2.length) console.log(`    例: ${emptyL2.slice(0,5).map(r=>r.len+'字').join(' / ')}`)
  console.log(`  双行第二行横向溢出 ${over.length} 条` + (over.length ? `（最大 line2W=${Math.max(...over.map(r=>r.line2W)).toFixed(1)}px）` : ''))
  const wastePx = emptyL2.length * 16
  console.log(`  屏幕总浪费 = ${wastePx}px（按每屏 3 选项计，平均每屏 ~${(wastePx/rows.length*3).toFixed(1)}px）`)
}

// 具体样例
console.log('\n=== 样例明细（宽度 375） ===')
labels.forEach(l => {
  const r = classify(l, 375)
  if (r.lines === 2 || r.fontSize <= 13) console.log(`  ${r.lines}行 fs=${r.fontSize} len=${r.len} emptyL2=${r.emptyLine2||false} 12px宽=${r.fitsAt12Single!==undefined?r.fitsAt12Single:'-'} :: ${l}`)
})
