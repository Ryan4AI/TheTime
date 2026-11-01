// P-193 probe: 主叙事页（game.js）下半屏垂直分配在「选项数量 × 屏高」矩阵下是否压到物品栏
// 真实模块 + HOOK 暴露 initLayout/adjustFluidLayout（不复制常量）
const fs = require('fs'); const path = require('path'); const Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = path.join(__dirname, '../../minigame/scenes/game.js');

function load(w, h, safeTop, safeBottom) {
  Object.keys(require.cache).forEach(k => { if (k.includes('/minigame/')) delete require.cache[k] });
  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: safeTop, bottom: h - safeBottom } }),
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {}, hideKeyboard() {},
    getStorageSync: () => null, setStorageSync() {}, removeStorageSync() {},
    cloud: { init() {}, callFunction() {} }, showToast() {}, request() {},
  };
  const HOOK = `
module.exports.__t = {
  initLayout, adjustFluidLayout,
  setOptions: o => { options = o; optionsAppearTime = 0 },
  setNarrative: n => { narrative = n; displayedChars = n.length; displayStartTime = 0 },
  getLayout: () => layout,
};
`;
  const m = new Module('game-probe', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  global.createCanvas = createCanvas;
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}

const CASES = [
  { w: 320, h: 480, st: 0, sb: 0 },    // 安卓小屏（无安全区）
  { w: 320, h: 568, st: 20, sb: 0 },   // iPhone SE1 / 小屏
  { w: 360, h: 640, st: 24, sb: 0 },
  { w: 375, h: 667, st: 20, sb: 0 },   // iPhone SE2/8
  { w: 375, h: 812, st: 44, sb: 34 },  // iPhone X/12 mini
  { w: 390, h: 844, st: 47, sb: 34 },  // iPhone 14
  { w: 414, h: 896, st: 44, sb: 34 },  // iPhone 11 Pro Max
];

// 选项组合：n 个选项，其中第 2 个是 20 字长选项（走双行）
function mkOpts(n, long) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ label: (long === i ? '留下继续问赵姓脚夫那批货往西送了多少趟' : '选项' + i + '：上前搭话') });
  return out;
}

let bad = 0;
for (const c of CASES) {
  for (const n of [2, 3, 4, 5]) {
    for (const long of [0, 2]) {
      const T = load(c.w, c.h, c.st, c.sb);
      T.setNarrative('你站在汴京的街口，风里有炊烟的味道。'.repeat(6));
      T.setOptions(mkOpts(n, long));
      T.initLayout();
      T.adjustFluidLayout();
      const L = T.getLayout();
      const optBottom = L.optionY + n * 36 + (n - 1) * 4 + (long ? 16 : 0);
      const itemTop = L.itemBarY;
      const over = optBottom - (itemTop - 6);
      const floorHit = Math.abs(L.textH - 60) < 0.01;
      const flag = over > 0.5 ? '⛔压物品栏+' + over.toFixed(0) + 'px' : (floorHit ? '⚠️叙事压到60px下限' : '✅');
      if (over > 0.5) bad++;
      console.log(flag.padEnd(22) + ` | ${c.w}x${c.h} safe(${c.st}/${c.sb}) | ${n}选项${long ? '(含1个双行)' : ''} | 叙事textH=${L.textH.toFixed(0)} | 选项底=${optBottom.toFixed(0)} 物品栏顶=${itemTop} | 输入框y=${L.inputY.toFixed(0)}`);
    }
  }
}
console.log('\n⛔ 压物品栏用例 = ' + bad);
