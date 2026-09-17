// P-153-1 复现探针：物品清单浮窗「滚动后点行开错物品」
//   怀疑（与 P-152-2 同一根因族）：_listBounds 写在持久物品对象上，
//   被视口裁剪掉的旧行（`if (ry + rowH < listTop || ry > listBottom) return`）不会刷新 _listBounds，
//   上一帧残留坐标仍留在列表区内 → onTouch 按原数组顺序遍历 → 先撞上残留命中区 → 打开"看不见的那件"。
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
  openList: () => { itemListOpen = true; itemListScroll = 0 },
  setListScroll: v => { itemListScroll = v },
  resetPopups: () => { itemDetail = null; itemListOpen = false; itemListScroll = 0 },
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

const cv = createCanvas(375, 812);
const N = 11;                       // 真机「李昌」当前 11 件
const items = [];
for (let i = 1; i <= N; i++) items.push({ id: 'it' + i, name: '物品' + i, desc: '描述' + i });
T.setItems(items);

// 复刻 drawItemListOverlay 的几何（仅用于算"屏幕上这一行本该是谁"）
const L = T.getLayout();
const w = L.windowW, h = L.windowH;
const pw = Math.min(300, w - 32), ph = Math.min(420, h - 120);
const px = (w - pw) / 2, py = (h - ph) / 2;
const listTop = py + 44, listBottom = py + ph - 14, rowH = 46;
console.log(`面板 ${pw}x${ph} @(${px},${py})  列表区 y=${listTop}..${listBottom} (${listBottom-listTop}px ≈ ${((listBottom-listTop)/rowH).toFixed(1)} 行)  共 ${N} 件 → 必须滚动`);

function frame(scroll) { T.setListScroll(scroll); T.render(cv); }
function tapAt(x, y) { T.resetPopups(); T.openList(); T.setListScroll(arguments[2] || 0); mod.onTouch(x, y, 'start'); mod.onTouch(x, y, 'end'); return T.getDetail(); }

function run(scroll, label) {
  // 1) 先按真实顺序渲染两帧：scroll=0（首屏）→ scroll（玩家滑动后）
  T.resetPopups(); T.openList();
  frame(0);
  frame(scroll);
  // 2) 玩家在列表区中部点一行
  const y = listTop + 3 * rowH + 20;         // 第 4 个可见行内
  const x = px + pw / 2;
  // 期望：按屏幕上真正画出来的那一行 = 倒序第 floor((y-listTop-scroll)/rowH) 个
  const idx = Math.floor((y - listTop - scroll) / rowH);
  const expected = items[items.length - 1 - idx] && items[items.length - 1 - idx].name;
  const d = tapAt(x, y, scroll);
  frame(scroll);                              // tap 前再画一帧，保证 _listBounds 是当前滚动位置的
  const d2 = (function(){
    T.resetPopups(); T.openList(); T.setListScroll(scroll); T.render(cv);
    mod.onTouch(x, y, 'start'); mod.onTouch(x, y, 'end');
    return T.getDetail();
  })();
  const got = d2 && d2.item ? d2.item.name : (d2 ? '?' : 'null（未命中）');
  console.log(`${label} scroll=${scroll}  点 y=${y.toFixed(0)} → 实得【${got}】  期望【${expected}】  ${got === expected ? '✅' : '❌ 开错物品'}`);
  return got === expected;
}

console.log('\n【P-153-1】物品清单浮窗滚动后点行归属');
const maxScroll = Math.max(0, N * rowH - (listBottom - listTop));
console.log(`可滚动范围 0..-${maxScroll}\n`);
const ok0 = run(0, '未滚动 ');
const ok1 = run(-Math.round(maxScroll / 2), '下滑中 ');
const ok2 = run(-maxScroll, '滑到底 ');
console.log('\n结论：' + (ok0 && ok1 && ok2 ? '全部正确 ✅（无 bug）' : '存在「点 A 开 B」❌'));
