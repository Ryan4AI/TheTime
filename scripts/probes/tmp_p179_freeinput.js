// P-179 「自由输入框命中区残留」核查（真实 game.js）
//   背景：P-152-2（物品格 _bounds）+ #36（清单 _listBounds）同族 bug 各咬过一次 —— 根因相同：
//   「命中区写在条件渲染分支里，条件不满足时不画 → 也不清 → 旧坐标继续命中」。
//   layout._freeInputBtn（:2432）同样是条件渲染产物（render:1669 `options.length > 0`），
//   但 handleTouch:4832 读它时**没有任何 options/loading 之外的条件** → 本探针验证是否第三次中招。
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  let kbCb = null;
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {},
    createInput() {},
    showKeyboard: (o) => { if (o && o.success) setTimeout(() => o.success({}), 0) },
    hideKeyboard() {}, onKeyboardInput(cb) { kbCb = cb }, offKeyboardInput() {},
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
  touch: (x, y, t) => handleTouch(x, y, t || 'end'),
  getLayout: () => layout,
  getFreeInputActive: () => freeInputActive,
  setFreeInputActive: v => { freeInputActive = v },
  getOptions: () => options,
};
`;

function load(w, h) {
  global.wx = makeWx(w, h); global.createCanvas = createCanvas;
  const m = new Module('game-p179', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}

const ITEMS = [{ desc: '手电筒（耐久 85）', icon: '🔦', id: 'flashlight', name: '手电筒' }];

for (const [w, h] of [[375, 812], [320, 568], [320, 480]]) {
  console.log(`\n── ${w}x${h} ──`);
  const T = load(w, h);
  T.initLayout();
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'); global.__ctx = ctx;
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items: ITEMS, round: 21,
    name: '李昌', age: 39, city: '汴京', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems(ITEMS);
  T.setNarrative('你在汴京城外扎营，柴荣派人送来一封密信。');
  T.setAlive(true);
  T.setLoading(false);

  // ── 阶段 A：有选项 → 输入框被画出来，bounds 生成
  T.setOptions(['拆开密信', '原样退回', '先去找王朴商量']);
  T.render(); T.render();  // 第 2 帧：displayedChars 已追平 → typingDone=true → optionFadeIn=1
  const L = T.getLayout();
  console.log('   layout 调试: textY=%s textH=%s inputY=%s optionY=%s optionFadeIn=%s _typeDone=%s', L.textY, L.textH, L.inputY, L.optionY, L.optionFadeIn, L._typeDone);
  const b1 = L._freeInputBtn;
  console.log(`  A. 有 3 个选项：_freeInputBtn = ${b1 ? `${b1.x.toFixed(0)},${b1.y.toFixed(0)} ${b1.w.toFixed(0)}x${b1.h.toFixed(0)}` : '未生成 ❌'}`);
  if (!b1) continue;

  // ── 阶段 B：选项清空 + 不在 loading（＝"AI 已返回但还没出新选项"或"error 且 options 空"这类窗口）
  T.setOptions([]);
  T.setLoading(false);
  T.render(); T.render();
  const b2 = T.getLayout()._freeInputBtn;
  console.log(`  B. 选项清空后再渲染：_freeInputBtn = ${b2 ? `仍存在(${b2.x.toFixed(0)},${b2.y.toFixed(0)})` : '已清空 ✅（无残留）'}`);

  // ── 阶段 C：在旧输入框中心点一下 → 会不会弹出键盘？
  T.setFreeInputActive(false);
  const cx = b1.x + b1.w / 2, cy = b1.y + b1.h / 2;
  let threw = null;
  try { T.touch(cx, cy, 'end') } catch (e) { threw = e.message }
  const active = T.getFreeInputActive();
  console.log(`  C. 点旧输入框中心 (${cx.toFixed(0)},${cy.toFixed(0)}) → freeInputActive=${active} ${threw ? '(异常: ' + threw + ')' : ''}`);
  console.log(`     ${active ? '🔴 中招：无选项时这里仍能弹出键盘（隐形热区）' : '✅ 未触发'}`);

  // ── 阶段 E：模拟"新一轮刚到、打字机还在跑"（optionFadeIn=0 → 输入框不画）→ 旧 bounds 是否仍活
  T.setFreeInputActive(false);
  T.setOptions(['新选项一', '新选项二']);          // 有选项（所以 thinking 时玩家会在这个区域附近点）
  T.setNarrativeTyping('夜色如墨，你策马出城，身后是渐远的灯火与更鼓声，前方是未知的乱世。');
  T.render();
  const bE = T.getLayout()._freeInputBtn, fadeE = T.getLayout().optionFadeIn;
  T.touch(cx, cy, 'end');
  console.log(`  E. 打字机期（optionFadeIn=${fadeE}，输入框未画）→ _freeInputBtn=${bE ? '仍残留' : '已清'}` +
    ` ｜ 点旧位置 → freeInputActive=${T.getFreeInputActive() ? '弹了 🔴' : '未弹 ✅'}`);

  // ── 对照：loading=true 时同样点一下（loading 分支在前面 return）
  T.setLoading(true);
  T.setFreeInputActive(false);
  try { T.touch(cx, cy, 'end') } catch (e) {}
  console.log(`  D. loading=true 状态下同一点 → freeInputActive=${T.getFreeInputActive() ? '弹了 🔴' : '未弹 ✅（被 loading 分支挡住）'}`);
}
