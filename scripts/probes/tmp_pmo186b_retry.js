// P-186b「AI 失败时的重试入口到底画没画」红线复核（真实 game.js）
//   红线（MEMORY.md）：「AI 输出失败禁止伪装成正常游戏内容，必须明确报错 + 重试入口」
//   代码看着是齐的：每条 error 分支都同时写了 errorMsg + options=[{label:'重试',key:'__retry__'}]
//   —— 但 drawOptions 有前置门 `layout.optionFadeIn <= 0 return`，
//      而 optionFadeIn = typingDone = `narrative && displayedChars >= narrative.length`
//      → **开局第一轮就失败（narrative 还是空串）时 typingDone 为假 → 重试按钮可能压根不画**
//      玩家只看到一条「…点此重试。」的提示条，却找不到可点的东西 = 红线被踩。
//   本探针验证：失败时到底有没有可见可点的重试入口。
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = process.env.P_SRC || '/home/admin/workspace/TheTime/minigame/scenes/game.js';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, createInput() {},
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
  setOptsSeq: (a, t) => { options = a; optionsAppearTime = t },
  setTyping: (n, chars, start) => { narrative = n; displayedChars = chars; displayStartTime = start },
  setLoading: v => { loading = v },
  setAlive: v => { alive = v },
  touch: (x, y, t) => handleTouch(x, y, t || 'end'),
  getLayout: () => layout,
  getOptions: () => options,
};
`;
function load(w, h) {
  global.wx = makeWx(w, h); global.createCanvas = createCanvas;
  const m = new Module('game-p186b', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  return m.exports.__t;
}

const ITEMS1 = [{ desc: '', icon: '🔦', id: 'flashlight', name: '手电筒' }];

// 记录 fillText：看这一帧到底画了哪些文字
function textsOf(T, cv) {
  const real = cv.getContext('2d');
  const hits = [];
  global.__ctx = new Proxy(real, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (k === 'fillText') return (s, x, y) => { hits.push({ s: String(s), x, y }); return v.call(t, s, x, y) };
      return v.bind(t);
    },
    set(t, k, v) { t[k] = v; return true },
  });
  T.render();
  global.__ctx = real;
  return hits;
}

console.log('=== P-186b 失败态「重试入口」红线复核 ===');
for (const [w, h] of [[375, 812], [320, 568]]) {
  const T = load(w, h);
  T.initLayout();
  const cv = createCanvas(w, h);
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, round: 0,
    name: '李昌', age: 20, city: '汴京', occupation: '庶民', social_class: '庶人', items: ITEMS1,
    声望: 0, 财富: 0, 学识: 0, 颜值: 0, 医术: 0, 战功: 0, 文采: 0, 政绩: 0, 义行: 0 });
  T.setItems(ITEMS1);
  T.setAlive(true); T.setLoading(false);

  const cases = [
    ['A 开局第一轮就失败（narrative 空）', '', 0, Date.now(), [{ label: '重试', key: '__retry__' }]],
    ['B 已有叙事时半路失败', '你在汴京城里睁开眼，四周是陌生的街巷。', 9999, Date.now() - 60000, [{ label: '重试', key: '__retry__' }]],
  ];
  for (const [label, narr, chars, start, opts] of cases) {
    T.setTyping(narr, chars, start);
    T.setOptsSeq(opts, Date.now() - 5000);
    T.render();                     // 让一遍内部状态 settle
    const hits = textsOf(T, cv);
    const L = T.getLayout();
    const hasBtn = hits.some(t => t.s === '重试');
    const errBar = hits.some(t => t.s.includes('史官落笔卡壳'));
    console.log(`\n  ${label}  @${w}x${h}`);
    console.log(`     optionFadeIn=${L.optionFadeIn} 叙事长度=${narr.length} displayedChars=${chars}`);
    console.log(`     重试按钮 ${hasBtn ? '✅ 已画' : '🔴 未渲染'}｜错误提示条 ${errBar ? '（有）' : '（无）'}`);
    if (hasBtn) {
      const bt = hits.find(t => t.s === '重试');
      console.log(`     「重试」画在 x=${bt.x.toFixed(0)} y=${bt.y.toFixed(0)}`);
      // 点它：会不会真的触发 __retry__ 分支
      let r = null; try { r = T.touch(bt.x + 5, bt.y - 6, 'end') } catch (e) { r = '异常:' + e.message }
      console.log(`     点它一下 → 返回 ${JSON.stringify(r)}`);
    } else {
      const all = hits.map(t => t.s).filter(s => s.length).slice(0, 12);
      console.log(`     本帧实际画出的文字：${JSON.stringify(all)}`);
    }
  }
}
console.log('\n注：若 A 档未渲染 → 开局首次 AI 失败时玩家没有任何可点的重试入口（红线）。');

// ── 附加：确认「重试」按钮的命中区真的存在且可点（点是不是会走 __retry__ 分支）
console.log('\n=== 附加：命中区与点击路径 ===');
{
  const T = loadW();
  T.initLayout();
  const cv = createCanvas(375, 812); global.__ctx = cv.getContext('2d');
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, round: 0,
    name: '李昌', age: 20, city: '汴京', occupation: '庶民', social_class: '庶人', items: ITEMS1,
    声望: 0, 财富: 0, 学识: 0, 颜值: 0, 医术: 0, 战功: 0, 文采: 0, 政绩: 0, 义行: 0 });
  T.setItems(ITEMS1); T.setAlive(true); T.setLoading(false);
  T.setTyping('', 0, Date.now());                       // 开局第一轮、叙事空
  T.setOptsSeq([{ label: '重试', key: '__retry__' }], Date.now() - 5000);
  T.render(); T.render();
  const o = T.getOptions()[0];
  console.log(`  选项 bounds = ${o && o.bounds ? `${o.bounds.x.toFixed(0)},${o.bounds.y.toFixed(0)} ${o.bounds.w.toFixed(0)}x${o.bounds.h.toFixed(0)}` : '🔴 无'}`);
}
function loadW() { return load(375, 812) }
