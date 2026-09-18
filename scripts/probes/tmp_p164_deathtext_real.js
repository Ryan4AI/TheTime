// P-164 死亡页碑文几何复核（真实模块 + 注入 HOOK，沿用先生 openflow 套路）
//   背景：P-161 用「复刻常量」跑出主碑志阈值（812 下 ~96 字压提示、160+ 才溢出碑外）→ 判定 🟠 次要。
//   但阈值随屏高急剧变化（容量 ∝ 屏高，且每行字数 ∝ 碑宽 ∝ 屏高）→ 短屏可能远低于 AI 上限 100 字。
//   本探针不再复刻常量，而是加载真实 death.js + 真实 canvas，render 后把 ctx.fillText 全部录下来，
//   直接读「主碑碑身范围内的文字」实际画到哪个 y，与碑底 / 提示 y 比。
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const BASE = '/home/admin/workspace/TheTime/minigame/scenes/';

function makeWx(w, h) {
  return {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    getWindowInfo: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: (k) => (k === 'lives' ? [] : 'test-openid'),
    removeStorageSync() {}, showToast() {}, hideKeyboard() {},
    cloud: { init() {}, callFunction() {} },
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize() {}, offWindowResize() {},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}), request() {},
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
  const m = new Module('death.js', null);
  m.filename = file; m.paths = Module._nodeModulePaths(BASE);
  m._compile(fs.readFileSync(file, 'utf8') + '\n' + HOOK, file);
  return m.exports;
}

const ZHI_SRC = '公姓李昌，后周汴京人也，少为渔夫，居庶民之籍，显德初穿越至此，救韩通于危难，得赵匡胤赏识，入军从戎，后封义军指挥使，深入芦芽山夺铁器闭邪门，屡陷死地而全身，北伐中伏突围南奔，终殁于乱军之中，尸骨无存，唯怀中铁器不知所终，后人以衣冠冢葬之，享年三十有九岁';
const SCREENS = [[375, 812], [390, 844], [360, 780], [375, 667], [320, 568], [320, 480]];
const ZHI_LENS = [56, 70, 100];   // 56 = 默认模板上限；100 = AI prompt 约束上限

for (const [w, h] of SCREENS) {
  console.log(`\n── ${w}x${h} ──`);
  for (const zn of ZHI_LENS) {
    let mod, L, texts = [];
    try {
      mod = loadDeath(w, h);
      mod.init([], {
        life_number: 1, name: '李昌', gender: '男', age: 39, dynasty: '后周', city: '汴京',
        occupation: '义军指挥使', socialClass: '庶民', eraDisplay: '后周·显德三年',
        epitaph: '一生如梦来去无痕', epRecord: ZHI_SRC.slice(0, zn), deathType: '寿终',
      }, '男');
      mod.__forceReady();
      L = mod.__L();
    } catch (e) { console.log(`  志${zn}字 init/load ERR ${e.message}`); continue; }

    const cv = createCanvas(w, h), ctx = cv.getContext('2d');
    const orig = ctx.fillText.bind(ctx);
    ctx.fillText = (t, x, y, ...r) => { texts.push({ t: String(t), x, y }); return orig(t, x, y, ...r); };
    try { mod.render(ctx); } catch (e) { console.log(`  志${zn}字 render ERR ${e.message}`); continue; }

    // 主碑碑身：death.js:861-865  sy = l.h*0.95 - mainH, sh = mainH, sw = mainW, sx = cx - sw/2
    const sy = L.h * 0.95 - L.mainH, sBot = sy + L.mainH;
    const sx = L.cx - L.mainW / 2, sRight = sx + L.mainW;
    const hintY = sBot - 50;                 // death.js:875 提示 y = sy + sh - 50
    // 归属：x 落在主碑横向范围内 且 y > 碑顶 的文字 = 主碑文字
    // 排除两类固定装饰元素（它们不随志长变化，会把 maxY 钉死成假阳性）：
    //   ① 提示「左右划切换 · 上划返回」（y = 碑底-50，本就是被比较对象）
    //   ② 碑底「第 N / 55」小字（v3.0.20 挪过来的位置信息，固定画在碑身下缘附近）
    const isFixed = t => /左右划|上划返回/.test(t.t) || /第\s*\d+\s*\/\s*\d+/.test(t.t);
    const main = texts.filter(t => t.x >= sx - 4 && t.x <= sRight + 4 && t.y >= sy && t.y <= L.h);
    const body = main.filter(t => !isFixed(t));
    const maxY = body.length ? Math.max(...body.map(t => t.y)) : -1;
    const flag = maxY > sBot ? '🔴 溢出碑外' : (maxY > hintY - 8 ? '🟠 压到提示' : '✅ 安全');
    const over = maxY > sBot ? ` (+${(maxY - sBot).toFixed(0)}px 出碑)` : (maxY > hintY - 8 ? ` (压提示 ${(maxY - (hintY - 8)).toFixed(0)}px)` : '');
    const tail = body.length ? body.reduce((a, b) => (b.y > a.y ? b : a)) : null;
    console.log(`  志=${String(zn).padStart(3)}字 → 碑文 ${body.length} 段，最低 y=${maxY.toFixed(0)}（末段「${tail ? tail.t.slice(0, 10) : '-'}」） | 碑身 ${sy.toFixed(0)}~${sBot.toFixed(0)} 提示y=${hintY.toFixed(0)} ${flag}${over}`);
  }
}
