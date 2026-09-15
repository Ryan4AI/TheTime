// P-154 命中区地图扫描（PMO 2026-09-15 巡检新增）
//  目的：不预设结论，把物品栏 + 命格区按 x 逐点（step 2px）扫一遍，
//  看"手指落在哪 → 实际发生什么"是否与视觉一致。P-150~153 都是命中区错位/残留，
//  用这个扫描一次性把整条底栏的归属画出来，比逐个猜 bug 快。
//  判据：物品格 → 该格物品详情；第 10 格（>10 件）→ 物品列表浮窗；命格区 → 切数值详情；其余 → 无反应
const fs = require('fs'); const path = require('path'); const Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const wx = { getSystemInfoSync:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}}),
  onTouchStart(){},onTouchEnd(){},onTouchMove(){},offKeyboardHeightChange(){},onKeyboardHeightChange(){},
  cloud:{init(){},callFunction:()=>{}},setStorageSync(){},getStorageSync:()=>null,showToast(){},request(){},
  getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44}}),
  getDeviceInfo:()=>({}),getAppBaseInfo:()=>({}),getSystemSetting:()=>({}),onWindowResize(){},offWindowResize(){},
  getMenuButtonBoundingClientRect:()=>({top:44,height:32,width:87,right:322}),createInnerAudioContext:()=>({}),
  hideKeyboard(){},getFileSystemManager:()=>({}) };
global.wx = wx;
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const HOOK = `
module.exports.__t = {
  initLayout,
  render: (cv)=>render(cv.getContext('2d')),
  setState: s => { state = s },
  setNarrative: n => { narrative = n; displayStartTime = 0; displayedChars = (narrative||'').length },
  setOptions: o => { options = o; optionsAppearTime = 0 },
  setItems: i => { currentItems = i },
  getItems: () => currentItems,
  getLayout: () => layout,
  getDetail: () => itemDetail,
  getListOpen: () => itemListOpen,
  getFate: () => showFateDetail,
  setFate: v => { showFateDetail = v },
  resetPopups: () => { itemDetail = null; itemListOpen = false },
};
`;
const m = new Module('game-probe', null);
m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
global.createCanvas = createCanvas;
m._compile(fs.readFileSync(SRC,'utf8') + HOOK, SRC);
const T = m.exports.__t;
T.initLayout();
T.setState({ name:'测试', gender:'男', age:37, dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, coin:1000,
  '声望':10,'财富':20,'学识':15,'颜值':12,'医术':8,'战功':5,'文采':9,'政绩':6,'义行':11, items:[], round:5 });
T.setNarrative('测试叙事。');
T.setOptions([]);
const cv = createCanvas(375, 812);

const N = Number(process.argv[2] || 11);
const pool = [];
for (let i = 0; i < N; i++) pool.push({ id:'it'+i, name:'物品'+i, desc:'测试' });
T.setItems(pool); T.resetPopups(); T.setFate(false); T.render(cv);

const L = T.getLayout();
const over = pool.find(it => it._overflowBounds);
// 期望归属：把本帧真实绘制的命中区收集起来（x 区间 → 标签）
const zones = [];
if (L.fateArea) zones.push({ x0: L.fateArea.x, x1: L.fateArea.x + L.fateArea.w, y0: L.fateArea.y, y1: L.fateArea.y + L.fateArea.h, tag: 'FATE(命格)' });
pool.forEach(it => {
  const b = it._overflowBounds;
  if (b) zones.push({ x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, tag: 'LIST(+N)' });
  const c = it._bounds;
  if (c) zones.push({ x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h, tag: 'D:' + it.name });
});

function probe(x, y) {
  T.resetPopups(); T.setFate(false);
  m.exports.onTouch(x, y, "end");
  const d = T.getDetail();
  if (d) return 'D:' + (d.item && d.item.name);
  if (T.getListOpen()) return 'LIST(+N)';
  if (T.getFate()) return 'FATE(命格)';
  return '.';
}
function expectAt(x, y) {
  const z = zones.filter(z => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  if (!z.length) return '.';
  // 同一点上多个区重叠 → 真 bug（点一次会命中数组里靠前的那个，另一个永远点不到）
  return z.length > 1 ? ('重叠:' + z.map(v => v.tag).join('|')) : z[0].tag;
}

console.log(`【P-154 命中区地图】物品 ${N} 件 | +N 在: ${over ? over.name : '无'} | 物品栏 y=${L.itemBarY}..${L.itemBarY + L.itemBarH} | 命格区 x=${L.fateArea.x}..${L.fateArea.x + L.fateArea.w}`);
// 扫描行：把所有真实绘制过的 y 区间中心 + 命格区中心都扫一遍（去重）
const ySeen = [];
zones.forEach(z => {
  const yc = (z.y0 + z.y1) / 2;
  if (!ySeen.some(v => Math.abs(v - yc) < 1)) ySeen.push(yc);
});
ySeen.sort((a, b) => a - b);
const rows = ySeen.map((y, i) => ({ label: '行' + (i + 1), y }));

let bad = 0;
for (const r of rows) {
  const segs = [];
  for (let x = 0; x <= 375; x += 2) {
    const got = probe(x, r.y);
    const exp = expectAt(x, r.y);
    const tag = (got === exp) ? got : ('⚠️' + got + '(应' + exp + ')');
    if (got !== exp) bad++;
    if (segs.length && segs[segs.length - 1].tag === tag && segs[segs.length - 1].x1 === x - 2) segs[segs.length - 1].x1 = x;
    else segs.push({ x0: x, x1: x, tag });
  }
  console.log(`\n  ${r.label} y=${r.y.toFixed(0)}:`);
  for (const s of segs) if (s.tag !== '.') console.log(`     x ${s.x0}..${s.x1} → ${s.tag}`);
}
console.log(`\n结论：${bad === 0 ? '全部归属正确 ✅' : bad + ' 个采样点归属异常 ⚠️'}`);
