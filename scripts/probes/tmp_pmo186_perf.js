// P-186「每帧重绘成本」量化（真实 game.js + 计数代理 ctx）
//   背景：188 期前的所有几何探针都在问「画得对不对」，没人问过「每帧画多少」。
//   game.js 的 render 是**全画重绘**（没有脏矩形/静态层缓存），
//   每帧从 drawBackground 一路画到 drawItemBar —— 低端机上有多少 canvas 调用，以前没数。
//   本探针用 Proxy 包住 ctx，统计**单帧**各类绘制调用次数 + 本地耗时量级。
// ⚠️ 本地 @napi-rs/canvas 的耗时不等于真机（无中文字体/软件光栅），
//    **可信的是「调用次数」**（与设备无关），耗时只作量级参考。
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {},
    createInput() {},
    showKeyboard: (o) => { if (o && o.success) setTimeout(() => o.success({}), 0) },
    hideKeyboard() {}, onKeyboardInput() {}, offKeyboardInput() {},
    onKeyboardConfirm() {}, offKeyboardConfirm() {}, onKeyboardComplete() {},
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: (k) => (k === 'lives' ? [] : 'probe-openid'),
    showToast() {}, cloud: { init() {}, callFunction() {} }, request() {},
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize() {}, offWindowResize() {},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}),
  };
}
const HOOK = `
module.exports.__t = {
  initLayout,
  render: () => render(global.__ctx),
  setState: s => { state = s },
  setItems: a => { currentItems = a },
  setNarrative: t => { narrative = t; displayStartTime = Date.now() - 60000 },
  setNarrativeTyping: t => { narrative = t; displayStartTime = Date.now(); displayedChars = 0 },
  setOptions: a => { options = a; optionsAppearTime = Date.now() - 5000 },
  setLoading: v => { loading = v },
  setAlive: v => { alive = v },
  setItemListOpen: v => { itemListOpen = v },
  touch: (x, y, t) => handleTouch(x, y, t || 'end'),
  getLayout: () => layout,
};
`;
function load(w, h) {
  global.wx = makeWx(w, h); global.createCanvas = createCanvas;
  const m = new Module('game-p186', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}

// ── 计数代理：统计绘制类调用，其余透传 ────────────────────────────────
const COUNTED = {
  draw: ['fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'clearRect',
    'beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fill', 'stroke', 'save', 'restore',
    'translate', 'rotate', 'scale', 'setTransform', 'setLineDash', 'clip', 'quadraticCurveTo',
    'bezierCurveTo', 'rect', 'ellipse', 'createLinearGradient', 'createRadialGradient', 'measureText'],
};
const ALL = new Set(COUNTED.draw);
function countingCtx(real) {
  const tally = {};
  for (const k of ALL) tally[k] = 0;
  tally.total = 0; tally.gradStops = 0; tally.grad = 0;
  const cache = new Map();
  const handler = {
    get(t, k) {
      if (typeof k === 'symbol') return () => {};
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (cache.has(k)) return cache.get(k);
      const f = function (...a) {
        if (ALL.has(k)) { tally[k]++; tally.total++; }
        const r = v.apply(t, a);
        if ((k === 'createLinearGradient' || k === 'createRadialGradient') && r && r.addColorStop) {
          tally.grad++;
          const orig = r.addColorStop.bind(r);
          Object.defineProperty(r, 'addColorStop', { value: (...x) => { tally.gradStops++; return orig(...x) } });
        }
        return r;
      };
      cache.set(k, f);
      return f;
    },
    set(t, k, v) { t[k] = v; return true },
  };
  const proxy = new Proxy(real, handler);
  return { ctx: proxy, tally };
}

// ── 真机语料（来自 narrate_history 真实 ai 叙事，取长度中位 338 字） ──
const NARR_MED = '暮色四合，汴京城外的营地升起零星炊烟。你披着半旧的甲，坐在辎重车旁擦拭柴刀，' +
  '刀刃映着火光，忽明忽暗。亲兵自帐外来报，说枢密院的差官已到了五里外的驿亭，随身只带了两个人。' +
  '你把刀收回鞘里，命人添柴。这些年你见过太多差官，有的来宣诏，有的来索命。' +
  '火堆噼啪作响，你想了想，还是决定先派人去驿亭探一探虚实——毕竟柴荣新丧，' +
  '京里的风向变得太快，谁也说不准明日的朝堂会是谁说了算。' +
  '远处传来更鼓声，三更了。帐外的值夜兵换了一班，脚步声压得很低。' +
  '你摸了摸怀里的密信，封蜡完好，上面是一个你从未见过的印记。'.repeat(2).slice(0, 338);
const NARR_LONG = NARR_MED.repeat(4).slice(0, 1278); // 观测到的最长真机叙事
const ITEMS11 = [
  { desc: '手电筒（耐久 85）', icon: '🔦', id: 'flashlight', name: '手电筒' },
  { desc: '生锈的柴刀', icon: 'hatchet', id: 'hatchet', name: '生锈柴刀' },
  { desc: '司南用的破布', icon: '布', id: 'cloth', name: '司南破布' },
  { desc: '够吃三天的干粮', icon: '📦', id: 'food', name: '干粮包' },
  { desc: '油纸包着的碎银', icon: '📦', id: 'silver', name: '油纸包' },
  { desc: '半卷抄本', icon: '📦', id: 'book', name: '竹简' },
  { desc: '旧帕子包的钱', icon: '💰', id: 'money', name: '帕子包钱' },
  { desc: '', icon: '🗡️', id: 'dagger', name: '匕首' },
  { desc: '', icon: '🪔', id: 'lamp', name: '油灯' },
  { desc: '', icon: '🧭', id: 'compass', name: '司南' },
  { desc: '', icon: '🩹', id: 'bandage', name: '伤药' },
];
const OPTS3 = ['拆开密信，看个究竟', '连夜派人去驿亭探虚实', '按兵不动，等天亮再说'];

const BASE = {
  dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, round: 21,
  name: '李昌', age: 39, city: '汴京', occupation: '义军指挥使', social_class: '庶民',
  coin: 1234, 声望: 2633, 财富: 1890, 学识: 977, 颜值: 1203, 医术: 61, 战功: 2405,
  文采: 0, 政绩: 0, 义行: 2180, items: ITEMS11, alive: true, lifespan: 62, epitaph: '', legacy: '',
};

function frame(T, cv, label) {
  const real = cv.getContext('2d');
  global.__ctx = real;
  T.render(); T.render();   // ← 预热 2 帧：displayedChars 追平 → typingDone=true（否则 drawOptions 不画）
  const { ctx, tally } = countingCtx(real);
  global.__ctx = ctx;
  T.render();                                   // ← 只计数这一帧
  // 单独量耗时：用真实 ctx（不计数），跑 20 帧取均值
  global.__ctx = real;
  const t0 = Date.now(); for (let i = 0; i < 20; i++) T.render(); const ms = (Date.now() - t0) / 20;
  const keys = Object.keys(tally).filter(k => !['total', 'grad', 'gradStops'].includes(k) && tally[k] > 0);
  keys.sort((a, b) => tally[b] - tally[a]);
  const top = keys.slice(0, 6).map(k => `${k}=${tally[k]}`).join(' ');
  console.log(`  ${label.padEnd(22)} 调用/帧=${String(tally.total).padStart(4)}  measureText=${String(tally.measureText).padStart(4)}  fillText=${String(tally.fillText).padStart(4)}  渐变=${tally.grad}(stop ${tally.gradStops})  本地 ${ms.toFixed(1)}ms/帧`);
  console.log(`     ${' '.repeat(22)} top: ${top}`);
  return tally.total;
}

console.log('=== P-186 每帧重绘成本（真实 game.js）===');
for (const [w, h] of [[375, 812], [320, 568]]) {
  console.log(`\n── ${w}x${h} ──`);
  const T = load(w, h);
  T.initLayout();
  const cv = createCanvas(w, h);
  T.setState({ ...BASE });
  T.setItems(ITEMS11);
  T.setAlive(true); T.setLoading(false);

  T.setNarrative(NARR_MED); T.setOptions(OPTS3);
  const r1 = frame(T, cv, '① 常态(338字+3选项)');

  T.setNarrative(NARR_LONG);
  frame(T, cv, '② 长叙事1278字');

  T.setNarrative(NARR_MED); T.setOptions([]);
  frame(T, cv, '③ 打字机期(无选项)');

  T.setOptions(OPTS3);
  T.setItemListOpen(true);
  const r4 = frame(T, cv, '④ 物品清单浮窗开');
  T.setItemListOpen(false);

  // ⑤ 空叙事：量「除正文外的一切固定装饰」多少钱 → 与①之差 = 叙事排版成本
  T.setNarrative('');
  const r5 = frame(T, cv, '⑤ 空叙事(仅固定件)');
  console.log(`     → 叙事排版占常态一帧的 ${(((r1 - r5) / r1) * 100).toFixed(0)}%（${r1} - ${r5} = ${r1 - r5} 次/帧）`);
}
console.log('\n注：调用次数与设备无关；本地耗时含软件光栅，真机通常更快，仅看数量级。');
