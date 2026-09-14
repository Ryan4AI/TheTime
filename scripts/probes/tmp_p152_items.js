// P-152-1 / P-152-2 复现探针
//  P-152-1：spawnFloater 的 fateCX 硬编码 layout.padding+45（D088 缩小雷达图前的旧值）
//           → 属性飘字起点 x 与真实雷达图中心 x 是否一致？
//  P-152-2：物品 >10 时「+N 件」格能否正确打开物品列表浮窗？
//           怀疑：未被绘制的旧物品残留 _bounds 指向同一格 → 抢先命中 → 弹出最旧物品详情
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
  spawnFloater,
  getFloaters: () => floaters,
  getDetail: () => itemDetail,
  getListOpen: () => itemListOpen,
  resetPopups: () => { itemDetail = null; itemListOpen = false },
};
`;
function load(file){
  const m = new Module('game-probe', null);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  global.createCanvas = createCanvas;
  m._compile(fs.readFileSync(file,'utf8') + HOOK, SRC);
  return m.exports;
}
const mod = load(SRC);
const T = mod.__t;
T.initLayout();
T.setState({ name:'测试', gender:'男', age:37, dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, coin:1000,
  '声望':10,'财富':20,'学识':15,'颜值':12,'医术':8,'战功':5,'文采':9,'政绩':6,'义行':11, items:[], round:5 });
T.setNarrative('测试叙事。');
T.setOptions([]);

// ── P-152-1 ──
T.spawnFloater('+15 医术');
const f = T.getFloaters()[0];
const L = T.getLayout();
const realCX = L.padding + (((15+4)*2+20) / 2);   // drawItemBar: fateCX = dividerX - fateW/2
console.log('【P-152-1】雷达图真实中心 x =', realCX, ' 飘字起点 x =', f.x, ' 偏移 =', (f.x-realCX).toFixed(1)+'px');

// ── P-152-2 ──
function mk(n){ const a=[]; for(let i=1;i<=n;i++) a.push({id:'it'+i, name:'物品'+i}); return a; }
const cv = createCanvas(375,812);
// 真实序列：物品对象是持久的（push 进同一数组），逐帧累积绘制 → 会残留 _bounds
let pool = [];
function drawN(n){
  while (pool.length < n) pool.push({ id:'it'+pool.length, name:'物品'+pool.length });
  pool.length = n;
  T.setItems(pool); T.resetPopups(); T.render(cv);
}
// 2026-09-15 修正：不要用「重算格子坐标」去点击——算出来的坐标与真实绘制差 1~2px 会漏报。
// 直接点绘制时写下的真实命中区（_overflowBounds / _bounds），才是玩家手指真正落的位置。
function tap(b){
  T.resetPopups();
  mod.onTouch(b.x + b.w/2, b.y + b.h/2, 'end');
  return { x: b.x + b.w/2, y: b.y + b.h/2 };
}

console.log('\n【P-152-2】物品格点击归属（cols=5, rows=2 → 可见 10 格，>10 时第 10 格 = "+N 件"）');
console.log('  注：点真实命中区；残留列 = 掉出可见区的旧物品是否还留着上一帧 _bounds（P-152-2 真因）');
for (const n of [8, 10, 11, 12]) {
  drawN(n);
  const items = T.getItems();
  const over = items.find(it => it._overflowBounds);
  // 未在本帧被绘制、但仍有 _bounds 的物品 = 残留（修复前应为最旧那件，坐标与 +N 格完全重合）
  const stale = items.filter(it => it._bounds && !it._overflowBounds &&
    !(over && it._bounds.x === over._overflowBounds.x && it._bounds.y === over._overflowBounds.y));
  const target = over ? over._overflowBounds : items[items.length - 1]._bounds;
  const p = tap(target);
  const d = T.getDetail(), lo = T.getListOpen();
  const got = d ? ('详情=' + (d.item && d.item.name)) : (lo ? '物品列表浮窗' : '无反应');
  const expect = over ? '物品列表浮窗' : ('详情=' + items[items.length - 1].name);
  console.log(`  物品 ${n} 个 | 点 (${p.x.toFixed(0)},${p.y.toFixed(0)}) | +N在: ${over?over.name:'无'} | 残留: ${stale.length?stale.map(s=>s.name).join(','):'无'} | 实际: ${got} | 期望: ${expect} | ${got===expect?'✅':'❌ 错位'}`);
}
