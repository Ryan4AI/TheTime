// PMO 242 期：identity.js 信息行排版实测（复刻 getLayout 算术 + 真 CJK 字体量宽）
const { createCanvas, GlobalFonts } = require('/opt/openclaw/node_modules/.pnpm/@napi-rs+canvas@0.1.95/node_modules/@napi-rs/canvas')
GlobalFonts.registerFromPath('/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', 'wqy')
const c = createCanvas(800, 400)
const ctx = c.getContext('2d')
const FAM = '"STKaiti","KaiTi","楷体",wqy'
const meas = (t, px) => { ctx.font = `${px}px ${FAM}`; return ctx.measureText(t).width }

function layout(w, h) {
  const cx = Math.floor(w / 2)
  const cardW = Math.floor(w * 0.88)
  const cardH = Math.min(Math.floor(Math.max(h * 0.62, h * 0.72 - 10)), Math.floor(h * 0.80))
  const cardX = Math.floor(cx - cardW / 2)
  const infoS = Math.min(14, Math.floor(w * 0.036))
  const compactInfo = h < 540
  return { w, h, cx, cardW, cardH, cardX, infoS, compactInfo }
}

const cases = [
  { name: '王顺', age: 28, occ: '江湖郎中', res: '开封府祥符县', gender: '男' },
  { name: '王顺', age: 28, occ: '货郎', res: '阳城', gender: '男' },
  { name: '李昭娘', age: 108, occ: '女医', res: '临安府钱塘县', gender: '女' },
  { name: '欧阳无咎', age: 88, occ: '翰林侍读学士', res: '河南府洛阳县', gender: '男' },
]

const devices = [[320, 480], [375, 667], [390, 844], [414, 896], [768, 1024]]

for (const d of cases) {
  console.log('\n=== ' + d.name + ' / ' + d.occ + ' / ' + d.res + ' ===')
  for (const [w, h] of devices) {
    const l = layout(w, h)
    const inner = l.cardW - 10           // 卡片内层宣纸留白 5px ×2
    const safe = l.cardW - 20            // 视觉安全边（留 10px 呼吸）
    if (l.compactInfo) {
      const label = d.gender === '女' ? '小字' : '姓名'
      const text = [`${label}：${d.name}`, `年齿：${d.age}岁`, d.occ, d.res].join(' · ')
      const tw = meas(text, l.infoS)
      console.log(`  ${w}x${h} 紧凑单行 ${l.infoS}px: 文本 ${tw.toFixed(1)}px / 卡片 ${l.cardW}px ` +
        `→ ${tw > inner ? '❌ 溢出卡片 ' + (tw - inner).toFixed(1) + 'px' : tw > safe ? '⚠️ 贴边 ' + (safe - tw).toFixed(1) : '✅ 余 ' + (safe - tw).toFixed(1)}  「${text}」`)
    } else {
      const halfW = Math.floor(l.cardW * 0.14)
      const label = d.gender === '女' ? '小字' : '姓名'
      const L1 = `${label}：${d.name}`, R1 = `年齿：${d.age}岁`
      const L2 = `身份：${d.occ}`, R2 = `居所：${d.res}`
      const lcx = l.cx - halfW, rcx = l.cx + halfW
      for (const [a, b, tag] of [[L1, R1, '行1'], [L2, R2, '行2']]) {
        const aw = meas(a, l.infoS), bw = meas(b, l.infoS)
        const aL = lcx - aw / 2, aR = lcx + aw / 2
        const bL = rcx - bw / 2, bR = rcx + bw / 2
        const gap = bL - aR
        console.log(`  ${w}x${h} 双行 ${tag} ${l.infoS}px: 左「${a}」${aw.toFixed(1)} [${aL.toFixed(0)},${aR.toFixed(0)}] ` +
          `右「${b}」${bw.toFixed(1)} [${bL.toFixed(0)},${bR.toFixed(0)}] → ${gap < 0 ? '❌ 重叠 ' + (-gap).toFixed(1) + 'px' : gap < 6 ? '⚠️ 挤 ' + gap.toFixed(1) : '✅ 间隙 ' + gap.toFixed(1)}`)
        if (aWarn(aL, bR, l)) {}
      }
      // 是否出卡片
      const over = Math.max(lcx + meas(L2, l.infoS) / 2, rcx + meas(R2, l.infoS) / 2)
      const out = over - (l.cardX + l.cardW - 5)
      console.log(`       出卡片右缘: ${out > 0 ? '❌ ' + out.toFixed(1) + 'px' : '✅ 余 ' + (-out).toFixed(1)}`)
    }
  }
}
function aWarn() {}
