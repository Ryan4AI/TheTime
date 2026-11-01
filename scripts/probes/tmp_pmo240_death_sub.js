// 验证 death.js 副标题/碑额在真实屏宽下是否溢出碑面
let canvas
try { canvas = require('/home/admin/workspace/TheTime/node_modules/@napi-rs/canvas') } catch(e) {
  try { canvas = require('/home/admin/.openclaw/workspace/node_modules/@napi-rs/canvas') } catch(e2) { canvas = null }
}
const { createCanvas, GlobalFonts } = canvas || {}
let ctx
if (canvas) {
  GlobalFonts.registerFromPath('/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', 'CJK')
  ctx = createCanvas(400, 100).getContext('2d')
}
const sub = '北宋 · 女医 · 享年28岁'
const title = '沈青禾之墓'
const ming = '埋骨一生·南柯一梦'
function w(t, size, ls) {
  if (!ctx) return t.length * size + (t.length-1)*ls
  ctx.font = `${size}px CJK`
  const m = ctx.measureText(t).width
  return m + (t.length - 1) * ls
}
console.log('font source:', canvas ? 'napi canvas' : 'approx 1em/char')
for (const [sw, sh] of [[320,480],[375,667],[390,844],[414,896]]) {
  const mainH = Math.floor(sh*0.5), mainW = Math.floor(mainH*0.55)
  const padX = Math.max(1, mainW*0.10), tabW = mainW - padX*2
  const titleSize = 22, subSize = 13
  console.log(`\n屏 ${sw}x${sh}: 主碑 ${mainW}x${mainH} · tabW=${tabW.toFixed(1)} · 碑身半宽=${(mainW/2).toFixed(1)}`)
  for (const [name, t, size, ls] of [['碑额', title, titleSize, 2], ['副标题', sub, subSize, 1], ['铭(2行)', ming, 12, 2]]) {
    const wid = w(t, size, 0)
    const overTab = wid - tabW
    const overStone = wid - mainW
    console.log(`  ${name} "${t}" ${size}px 实测宽=${wid.toFixed(1)} | 超碑面(tabW) ${overTab>0?'+':''}${overTab.toFixed(1)}px | 超碑身 ${overStone>0?'+':''}${overStone.toFixed(1)}px`)
  }
}
