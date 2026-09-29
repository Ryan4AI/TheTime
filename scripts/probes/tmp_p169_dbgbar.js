// P-169 DBG 面板几何 + 数据分页按钮可达性审查
//   真实 game.js + CJK 垫片 + 五档屏
//   假设待验证：drawDebugPanel 顶部对 tab6/7/8 已 early-return 到独立渲染函数，
//   而「上一页/下一页」按钮画在 drawDebugPanel 内部 tab6 分支 → 可能永不可达（死代码）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const RAW = fs.readFileSync(SRC, 'utf8');

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 44, bottom: h - 34 } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: () => 'probe-openid', showToast() {}, hideKeyboard() {},
    cloud: { init() {}, callFunction() {} }, request() {},
    getMenuButtonBoundingClientRect: () => ({ top: 44, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize() {}, offWindowResize() {},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}),
  };
}
const HOOK = `
module.exports.__t = {
  initLayout,
  adjust: () => adjustFluidLayout(),
  setState: s => { state = s },
  openDbg: () => { debugOpen = true },
  setTab: t => { dbgActiveTab = t },
  drawPanel: () => drawDebugPanel(global.__ctx),
  drawData: () => drawDbgDataTab(global.__ctx),
  drawBottomBar: (w,h,bh,by) => drawDbgBottomBar(global.__ctx, w, h, bh, by),
  getLayout: () => layout,
};
`;
function load(w, h) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p169-' + Math.random().toString(36).slice(2), null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(RAW + HOOK, SRC);
  return m.exports.__t;
}
const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];
function record(T, fn) {
  const ctx = global.__ctx, of = ctx.fillText.bind(ctx), orf = ctx.fillRect.bind(ctx);
  const texts = [], rects = [];
  ctx.fillText = function (t, x, y, ...r) { const w = ctx.measureText(String(t)).width; texts.push({ t: String(t), x, y, w, align: ctx.textAlign }); return of(t, x, y, ...r) };
  ctx.fillRect = function (x, y, w, h) { rects.push({ x, y, w, h }); return orf(x, y, w, h) };
  fn();
  ctx.fillText = of; ctx.fillRect = orf;
  return { texts, rects };
}
function setup(T, w, h) {
  T.initLayout();
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items: [], round: 5,
    name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
}

(async () => {
  console.log('=== ① tab6「数据」渲染路径：分页按钮是否被画出来 ===');
  for (const [w, h] of SCREENS) {
    const T = load(w, h); global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h); T.openDbg(); T.setTab(6);
    const { texts } = record(T, () => T.drawPanel());
    const hasPrev = texts.some(x => x.t.includes('上一页'));
    const hasNext = texts.some(x => x.t.includes('下一页'));
    const hasTabs = texts.some(x => x.t.includes('数据')) && texts.some(x => x.t.includes('压缩'));
    const L = T.getLayout();
    console.log(`  ${w}×${h}  「◀上一页」${hasPrev ? '✅已渲染' : '❌未渲染'}  「下一页▶」${hasNext ? '✅' : '❌'}  tab 栏渲染=${hasTabs ? '✅' : '❌'}  _dbgDataPrevBtn=${L._dbgDataPrevBtn ? JSON.stringify(L._dbgDataPrevBtn) : 'undefined'}  _dbgDataNextBtn=${L._dbgDataNextBtn ? 'set' : 'undefined'}`);
  }

  console.log('\n=== ② 对照：单独调用 drawDbgDataTab（数据 tab 真实渲染入口）===');
  for (const [w, h] of SCREENS) {
    const T = load(w, h); global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h); T.openDbg(); T.setTab(6);
    const { texts } = record(T, () => T.drawData());
    const hasPrev = texts.some(x => x.t.includes('上一页'));
    const L = T.getLayout();
    console.log(`  ${w}×${h}  「◀上一页」${hasPrev ? '✅' : '❌未渲染'}  _dbgDataPrevBtn=${L._dbgDataPrevBtn ? 'set' : 'undefined'}`);
  }

  console.log('\n=== ③ drawDbgBottomBar 控制行几何（tab6/7/8 真实入口用）===');
  for (const [w, h] of SCREENS) {
    const T = load(w, h); global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h); T.openDbg(); T.setTab(0);
    const bottomBarH = 84, bottomBarY = h - bottomBarH - 34;
    T.drawBottomBar(w, h, bottomBarH, bottomBarY);
    const L = T.getLayout();
    const c = L._dbgCopyTabBtn, u = L._dbgUpBtn, d = L._dbgDownBtn;
    const ovl = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const gapCU = u ? (u.x - (c.x + c.w)) : 0;
    const tabsOk = L._dbgTabs.length === 9 && L._dbgTabs.every(t => t.x >= 0 && t.x + t.w <= w);
    const lastTab = L._dbgTabs[8];
    const tabsBottom = lastTab ? lastTab.y + lastTab.h : 0;
    console.log(`  ${w}×${h}  copy[${c.x}..${c.x + c.w}] up[${u.x}..${u.x + u.w}] down[${d.x}..${d.x + d.w}]  复制↔▲间距=${gapCU}px ${gapCU >= 0 ? '✅' : '❌重叠'}  重叠=${ovl(c, u) || ovl(u, d) || ovl(c, d)}  tab栏9格=${tabsOk ? '✅' : '❌'}  tab底=${Math.round(tabsBottom)} 控制行y=${Math.round(c.y)} 底栏底=${Math.round(bottomBarY + bottomBarH)}`);
  }

  console.log('\n=== ④ tab 文案宽度 vs 格宽（10px 字体）===');
  const LABELS = ['AI₁', 'AI₂', '对话流', 'POLL', '场景', 'System', '数据', 'llm_io', '压缩'];
  for (const [w, h] of SCREENS) {
    const T = load(w, h); global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h); T.openDbg(); T.setTab(0);
    const { texts } = record(T, () => T.drawPanel());
    const cell = Math.floor((w - 12) / 3) - 2;
    const row = texts.filter(x => LABELS.includes(x.t) || x.t.startsWith('llm_io'));
    const worst = row.reduce((m, x) => Math.max(m, x.w), 0);
    console.log(`  ${w}×${h}  格宽=${cell}px  最宽标签=${worst.toFixed(1)}px  余量=${(cell - worst).toFixed(1)}px ${cell - worst > 0 ? '✅' : '❌塞不下'}`);
  }
})().catch(e => console.error('ERR:', e && e.stack || e));
