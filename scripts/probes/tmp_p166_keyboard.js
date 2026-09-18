// P-166 键盘弹起态几何审查（真实 game.js + HOOK 注入 keyboardHeight）
//   背景：D088 修正 5/6/8/9 让「画像+叙事+输入框」在键盘弹起时整体上移（adjustFluidLayout:1818），
//   并隐藏选项区(:2278) 与自由输入按钮(:2390)。**这个高频场景（每次自由输入都触发）从未审过几何**。
//   审 3 件事：
//    ① 上移量 kbdShift 会不会把叙事区顶出屏幕上方（textY < 顶栏底 → 被顶栏不透明背景盖住）
//    ② 输入框 inputY 是否真的落在键盘顶之上（不被键盘吞）
//    ③ 触发条件 `keyboardHeight>0 && layout.optionFadeIn>0`：自由输入时 optionFadeIn 若=0 → 不上移 → 输入框被键盘盖
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 44, bottom: h - 34 } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {},
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
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
  render: () => render(global.__ctx),
  adjust: () => adjustFluidLayout(),
  setState: s => { state = s },
  setNarrative: n => { narrative = n; displayedChars = (narrative||'').length; typingDone = true },
  setKbd: v => { keyboardHeight = v },
  setOptFade: v => { if (layout) layout.optionFadeIn = v },
  getKbd: () => keyboardHeight,
  getLayout: () => layout,
};
`;

function load(w, h) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p166', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}

const SCREENS = [[375, 812], [360, 780], [320, 568], [320, 480]];
const KBDS = [291, 336, 380];   // 小屏 iOS / iPhone X 系中文键盘 / 安卓偏高值
const NARR = '显德五年，永安镇。你站在柴荣的中军帐外，手里攥着那半枚虎符，指节发白。'.repeat(6);

for (const [w, h] of SCREENS) {
  console.log(`\n── ${w}x${h} ──`);
  for (const kbd of KBDS) {
    const T = load(w, h);
    T.initLayout();
    const cv = createCanvas(w, h); global.__ctx = cv.getContext('2d');
    T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items: [], round: 5,
      name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
    T.setNarrative(NARR);
    // 先正常渲染一帧，让 optionFadeIn / inputY 等算出来
    T.setKbd(0); T.render();
    const L0 = T.getLayout();
    const base = { textY: L0.textY, textH: L0.textH, inputY: L0.inputY, optionY: L0.optionY, sceneY: L0.sceneY, fade: L0.optionFadeIn };
    // 再弹键盘
    T.setKbd(kbd);
    T.adjust();
    const L = T.getLayout();
    const kbdTop = h - kbd - (L.safeBottom || 0);
    const topBarBottom = (L.statusBarH || 44) + (L.topBarH || 0) || 122;
    const shift = (base.textY - L.textY);
    const covered = L.textY < topBarBottom;                 // 叙事区顶被顶栏盖住
    const inputUnderKbd = L.inputY > kbdTop;                // 输入框被键盘吞
    const sceneNeg = L.sceneY < 0;
    console.log(`  键盘${kbd}: kbdTop=${kbdTop} | 上移=${shift.toFixed(0)}px textY ${base.textY}→${L.textY} sceneY ${base.sceneY}→${L.sceneY.toFixed(0)} inputY ${base.inputY}→${L.inputY.toFixed(0)}`);
    console.log(`    叙事顶 vs 顶栏底(${topBarBottom}): ${covered ? `❌ 被盖 ${(topBarBottom - L.textY).toFixed(0)}px` : `✅ 余 ${(L.textY - topBarBottom).toFixed(0)}px`} | 输入框 vs 键盘顶: ${inputUnderKbd ? `❌ 被吞 ${(L.inputY - kbdTop).toFixed(0)}px` : `✅ 余 ${(kbdTop - L.inputY).toFixed(0)}px`}${sceneNeg ? ` | ❌ sceneY 负数 ${L.sceneY.toFixed(0)}` : ''}`);
    if (shift === 0) console.log(`    ⚠️ 上移量=0 → 条件 keyboardHeight>0 && optionFadeIn>0 未命中（optionFadeIn=${base.fade}）`);
  }
}
