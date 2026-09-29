// P-170 DBG 面板续审：llm_io tab(7) + 压缩 tab(8) 几何/边界审查
//   真实 game.js + CJK 垫片 + 五档屏 + mock 数据（含 error / 超长 raw_response / 长摘要）
//   承接 164(数据tab) / 169(共享底栏) → 本期补齐两个只读 tab 的可读性/越界检查
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
  initLayout, adjust: () => adjustFluidLayout(),
  setState: s => { state = s },
  openDbg: () => { debugOpen = true },
  setTab: t => { dbgActiveTab = t },
  setLlmIo: l => { dbgLlmIoList = l },
  setCompress: l => { dbgCompressList = l },
  drawLlmIo: () => drawDbgLlmIoTab(global.__ctx),
  drawCompress: () => drawDbgCompressTab(global.__ctx),
  getLayout: () => layout,
};
`;
function load(w, h) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p170-' + Math.random().toString(36).slice(2), null);
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
const LONG_RAW = '{"scene":"你在永安镇的药铺前停下，街角传来马蹄声……","options":["上前查看","转身回避","躲进巷子"]}'.repeat(3);
const MOCK_LLMIO = [
  { status: 'success', category: 'narrate', request_id: 'req-abc1234567890xyz', created_at: Date.now(),
    output: { raw_response: LONG_RAW, duration_ms: 1234 }, input: { model: 'hunyuan-turbox-2025' } },
  { status: 'error', category: 'score', request_id: 'req-err', created_at: Date.now(), error: 'timeout after 60000ms' },
  { status: 'pending', category: 'options', request_id: 'req-pen', created_at: Date.now() },
];
const MOCK_CMP = [
  { last_seq: 400, life_number: 1, compressed_at: Date.now(), text: '前情提要：'.repeat(1) + '李昌自幼随父学医，后逢乱世投义军……'.repeat(4) },
  { last_seq: 213, life_number: 1, compressed_at: Date.now(), text: '少年时代概述：' + '读书识字、随父出诊、结识邻家女童。'.repeat(3) },
];

function scan(label, T, w, h) {
  const texts = T._texts, rects = T._rects, L = T.getLayout();
  let over = [];
  for (const x of texts) {
    let right = x.align === 'right' ? x.x : (x.align === 'center' ? x.x + x.w / 2 : x.x + x.w);
    let left = x.align === 'left' ? x.x : (x.align === 'center' ? x.x - x.w / 2 : x.x - x.w);
    if (right > w + 0.5) over.push(`右越界(${right.toFixed(0)}>${w}) "${x.t.slice(0, 22)}"`);
    if (left < -0.5) over.push(`左越界(${left.toFixed(0)}<0) "${x.t.slice(0, 22)}"`);
  }
  const closeBtn = (L._dbgCloseBtn && L._dbgCloseBtn.x + L._dbgCloseBtn.w <= w);
  // 刷新按钮 + 状态文案水平间距
  const refBtn = label === 'llm_io' ? L._dbgLlmIoRefreshBtn : L._dbgCompressRefreshBtn;
  const st = texts.find(x => x.t.includes('条 · 倒序'));
  const gap = (refBtn && st) ? (st.x - (refBtn.x + refBtn.w)) : null;
  console.log(`  ${w}×${h}  越界=${over.length ? '❌ ' + over.slice(0, 3).join(' | ') : '✅0'} | 关闭钮在屏=${closeBtn ? '✅' : '❌'} | 刷新钮↔状态文案间距=${gap !== null ? gap.toFixed(0) + 'px' + (gap >= 4 ? ' ✅' : ' ❌重叠') : 'n/a'} | 列表项=${(L._dbgLlmIoItems || L._dbgCompressItems || []).length}`);
  return over.length === 0;
}

(async () => {
  for (const tab of ['llm_io', 'compress']) {
    console.log(`=== ${tab} tab ===`);
    for (const [w, h] of SCREENS) {
      const T = load(w, h); global.__ctx = createCanvas(w, h).getContext('2d');
      setup(T, w, h); T.openDbg(); T.setTab(tab === 'llm_io' ? 7 : 8);
      if (tab === 'llm_io') T.setLlmIo(MOCK_LLMIO); else T.setCompress(MOCK_CMP);
      const { texts, rects } = record(T, () => (tab === 'llm_io' ? T.drawLlmIo() : T.drawCompress()));
      T._texts = texts; T._rects = rects;
      scan(tab, T, w, h);
    }
  }
  // 边界：空数据文案是否居中不溢出
  console.log('=== 空数据态（320×480）===');
  for (const tab of ['llm_io', 'compress']) {
    const T = load(320, 480); global.__ctx = createCanvas(320, 480).getContext('2d');
    setup(T, 320, 480); T.openDbg(); T.setTab(tab === 'llm_io' ? 7 : 8);
    const { texts } = record(T, () => (tab === 'llm_io' ? T.drawLlmIo() : T.drawCompress()));
    const empty = texts.find(x => x.t.includes('暂无'));
    console.log(`  ${tab}: ${empty ? `"${empty.t}" 宽=${empty.w.toFixed(0)} 居中x=${empty.x} 右缘=${(empty.x + empty.w / 2).toFixed(0)}${empty.x + empty.w / 2 <= 320 ? ' ✅' : ' ❌'}` : '未渲染空态'}`);
  }
})().catch(e => console.error('ERR:', e.stack));
