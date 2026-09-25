// P-183「如果 ai_write_death 失败/未部署，玩家到底看见什么」——把 #40 的危害量化
//   背景：前端 callWriteDeathAndGo 失败分支把 deathCause/epRecord/epitaph 全置空再跳碑页。
//   本探针用真实 death.js 跑三种输入，看主碑渲染出来是"有内容"还是"空壳/崩"。
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const BASE = '/home/admin/workspace/TheTime/minigame/scenes/';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: (k) => (k === 'lives' ? [] : 'test-openid'),
    removeStorageSync() {}, showToast() {}, hideKeyboard() {}, request() {},
    cloud: { init() {}, callFunction() {} },
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize() {}, offWindowResize() {},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}),
  };
}
global.createCanvas = createCanvas;

const HOOK = `
module.exports.__L = () => layout;
module.exports.__forceReady = () => {
  ready = true;
  const t = Date.now() - 10000;
  for (const k in anims) { const a = anims[k]; if (a && a.startTime != null) { a.startTime = t; a.delay = 0; } }
};
`;

function loadDeath(w, h) {
  global.wx = makeWx(w, h);
  const file = BASE + 'death.js';
  const m = new Module('death-p183', null);
  m.filename = file; m.paths = Module._nodeModulePaths(BASE);
  m._compile(fs.readFileSync(file, 'utf8') + '\n' + HOOK, file);
  return m.exports;
}

const REAL_ZHI = '公姓李昌，后周汴京人也，少为渔夫，居庶民之籍，显德初穿越至此，救韩通于危难，入军从戎，后封义军指挥使，深入芦芽山夺铁器闭邪门，屡陷死地而全身，殁于乱军之中，享年三十有九岁';

const CASES = [
  { tag: 'A 正常（AI 写了全套）', epRecord: REAL_ZHI, epitaph: '一生如梦来去无痕', deathCause: '北伐中伏' },
  { tag: 'B ai_write_death 失败（全空）', epRecord: '', epitaph: '', deathCause: '' },
  { tag: 'C 只有 epitaph 有值（旧世遗留）', epRecord: '', epitaph: '一生如梦来去无痕', deathCause: '' },
];

for (const [w, h] of [[375, 812], [320, 568]]) {
  console.log(`\n── ${w}x${h} ──`);
  for (const c of CASES) {
    let mod;
    try {
      mod = loadDeath(w, h);
      mod.init([], { life_number: 1, name: '李昌', gender: '男', age: 39, dynasty: '后周', city: '汴京',
        occupation: '义军指挥使', socialClass: '庶民', eraDisplay: '后周·显德三年',
        epitaph: c.epitaph, epRecord: c.epRecord, deathCause: c.deathCause, deathType: '意外' }, '男');
      mod.__forceReady();
    } catch (e) { console.log(`  ${c.tag} → init 崩了 ❌ ${e.message}`); continue; }

    const cv = createCanvas(w, h), ctx = cv.getContext('2d');
    const texts = [];
    const orig = ctx.fillText.bind(ctx);
    ctx.fillText = (t, x, y, ...r) => { texts.push({ t: String(t), x, y }); return orig(t, x, y, ...r); };
    let renderErr = null;
    try { mod.render(ctx) } catch (e) { renderErr = e.message }
    if (renderErr) { console.log(`  ${c.tag} → render 崩了 ❌ ${renderErr}`); continue; }

    const L = mod.__L();
    const sy = L.h * 0.95 - L.mainH, sBot = sy + L.mainH;
    const sx = L.cx - L.mainW / 2, sRight = sx + L.mainW;
    const isFixed = t => /左右划|上划返回/.test(t.t) || /第\s*\d+\s*\/\s*\d+/.test(t.t);
    const main = texts.filter(t => t.x >= sx - 4 && t.x <= sRight + 4 && t.y >= sy && t.y <= L.h && !isFixed(t));
    const total = main.reduce((s, t) => s + t.t.length, 0);
    console.log(`  ${c.tag.padEnd(28)} → 主碑碑文 ${main.length} 段 / ${total} 字` +
      (main.length ? ` ｜ 首段「${main[0].t.slice(0, 12)}」` : ' ｜ **碑上没字** ⬅'));
    if (process.env.P183_DUMP) console.log('       碑上全部内容：' + main.map(t => `「${t.t.slice(0, 20)}」`).join(' '));
  }
}
