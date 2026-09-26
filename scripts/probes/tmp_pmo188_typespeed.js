// P-188：#44「打字机自加速」先验（对照 HEAD vs 补丁副本）
//   只读方式验证：给一段给定长度的叙事，看**打完全部字数需要多久**、以及「点叙事区跳过」是否仍然一跳到位。
//   用法：P_SRC=<副本路径> node -r ./scripts/probes/_cjk_shim.js scripts/probes/tmp_pmo188_typespeed.js
const fs = require('fs'), path = require('path'), Module = require('module');
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');
const SRC = process.env.P_SRC || '/home/admin/workspace/TheTime/minigame/scenes/game.js';
function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  return { getSystemInfoSync: () => si, getWindowInfo: () => si, onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, createInput() {},
    showKeyboard: o => { o && o.success && setTimeout(() => o.success({}), 0) }, hideKeyboard() {}, onKeyboardInput() {}, offKeyboardInput() {},
    onKeyboardConfirm() {}, offKeyboardConfirm() {}, onKeyboardComplete() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: k => (k === 'lives' ? [] : 'probe-openid'), showToast() {}, cloud: { init() {}, callFunction() {} }, request() {},
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }), getFileSystemManager: () => ({}),
    onWindowResize() {}, offWindowResize() {}, getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}) };
}
const HOOK = `
module.exports.__t = {
  initLayout,
  render: () => render(global.__ctx),
  setState: s => { state = s },
  setItems: a => { currentItems = a },
  setAlive: v => { alive = v },
  setLoading: v => { loading = v },
  // 模拟"新叙事到达"：narrative + 起始时间（elapsed 由外部控制）
  arm: (txt, elapsedMs) => { narrative = txt; displayStartTime = Date.now() - elapsedMs },
  // 补丁版才有：按字数算这一轮的单字时长（真实链路里在 handleAIResponse 里调）
  setSpeedFor: typeof calcTypeMsPerChar === 'function' ? (n) => { typeMsPerChar = calcTypeMsPerChar(n) } : null,
  getDisplayed: () => displayedChars,
  getSpeedConst: () => TYPEWRITE_SPEED,
};`;
function load(w, h) {
  global.wx = makeWx(w, h); global.createCanvas = createCanvas;
  const m = new Module('g' + Date.now() + Math.random(), null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}
const LENS = [176, 297, 338, 420, 495, 1278];   // 真实叙事的 min / p25 / 中位 / p75 / p90 / max
const ITEMS1 = [{ desc: '', icon: '🔦', id: 'flashlight', name: '手电筒' }];

(async () => {
  const T = load(375, 812); T.initLayout();
  const cv = createCanvas(375, 812); global.__ctx = cv.getContext('2d');
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, round: 21, name: '李昌', age: 39, city: '汴京',
    occupation: '义军指挥使', social_class: '庶民', items: ITEMS1, 声望: 0, 财富: 0, 学识: 0, 颜值: 0, 医术: 0, 战功: 0, 文采: 0, 政绩: 0, 义行: 0 });
  T.setItems(ITEMS1); T.setAlive(true); T.setLoading(false);

  const patched = !!T.setSpeedFor;
  console.log(`=== P-188 打字机速度先验｜${SRC.includes('/tmp/') ? '补丁副本' : 'HEAD'}｜自加速=${patched ? '开' : '关'} ===`);
  console.log('字数    单字时长   打完需     4 秒时已显示    备注');
  for (const len of LENS) {
    const txt = '叙事内容测试文字'.repeat(Math.ceil(len / 8)).slice(0, len);
    if (patched) T.setSpeedFor(len);
    // 二分找"刚好打完"的时间点（真实链路靠 rAF 逐帧推进，这里直接算）
    let lo = 0, hi = 60000, need = 0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      T.arm(txt, mid); T.render();
      if (T.getDisplayed() >= len) { need = mid; hi = mid } else lo = mid;
    }
    T.arm(txt, 4000); T.render();
    const at4 = T.getDisplayed();
    const perChar = patched ? Math.min(15, Math.max(6, 4000 / len)) : 15;
    console.log(`${String(len).padStart(4)}  ${perChar.toFixed(2).padStart(6)}ms  ${(need / 1000).toFixed(2).padStart(6)}s  ` +
      `${String(at4).padStart(6)}/${len} ${at4 >= len ? '✅ 已打完' : '（还在打）'}  ${len <= 267 ? '↖ 短文本（规则不变）' : ''}`);
  }
})();
