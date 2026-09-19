// P-167 物品栏命中区 A/B 验证（真实 game.js + 真机 11 件）
//   背景：先生工作树里躺着一处**未提交**的修复 P-152-2（160 期巡检漏报）：
//     物品 >10 件时，「+N 件」格点了弹出的是最旧物品详情，完整物品列表浮窗永远打不开
//     （真机已达成：李昌 current_items=11）。修法 = 每帧绘制前清空所有 _bounds/_overflowBounds
//     + 溢出件数改为 items.length - visibleCount + 1（原来少算 1 件）。
//   本期做 3 件事：
//    ① A/B：同一份 11 件数据，跑「修复后 SRC」vs「回退 SRC」，看点击溢出格分别开什么
//    ② 修复后：9 个可见格逐个点击，命中的是不是倒序后对应的那个物品（全员对得上才算过）
//    ③ 溢出件数 N 是不是真等于「看不见的件数」（四档屏各算一次）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const RAW = fs.readFileSync(SRC, 'utf8');

// 真机数据：李昌 current_items（2026-09-18 从 DB 直读，与 P-165 同源）
const REAL = [
  { desc: '手电筒（耐久 85）', icon: '🔦', id: 'flashlight', name: '手电筒' },
  { desc: '一副完整的扑克牌', icon: '🃏', id: 'playingcards', name: '扑克牌' },
  { desc: '一副入耳式耳机，音质不错', icon: '🎧', id: 'headphones', name: '有线耳机' },
  { desc: '柴荣赠送的旧帕子，里面包着几吊铜钱', durability: 60, icon: '🧣', name: '旧帕子包钱' },
  { desc: '王婆塞的粗粮饼和杂粮', durability: 80, icon: '📦', name: '干粮包' },
  { desc: '张令铎转交：碎银一块、路引一张、高平之战半枚虎符', durability: 100, icon: '📦', name: '油纸包' },
  { desc: '铁质农具，刀刃已生锈', durability: 45, icon: 'hatchet', name: '生锈柴刀' },
  { desc: '翠姑父亲遗留，绣有司南会图案', durability: 100, icon: '布', name: '司南破布' },
  { desc: '一件未知的物品。', durability: 100, icon: '📦', name: '竹简' },
  { desc: '王朴给的出营凭证', durability: 100, icon: '🪙', name: '令牌' },
  { desc: '从黑衣人身上搜来的短刃', durability: 85, icon: '🗡️', name: '匕首' },
];

// 回退版：去掉清空行 + 溢出数改回旧公式（模拟修复前）
const RESET_LINE = "    items.forEach(it => { it._bounds = null; it._overflowBounds = null })";
const NEW_N = "    const overflowN = items.length > visibleCount ? items.length - visibleCount + 1 : 0";
const OLD_N = "    const overflowN = items.length - visibleCount";
if (!RAW.includes(RESET_LINE) || !RAW.includes(NEW_N)) { console.error('锚点没命中，P-152-2 改动可能已被提交或改形'); process.exit(1); }
let OLD_SRC = RAW.replace(RESET_LINE, '').replace(NEW_N, OLD_N);

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
  drawBar: () => drawItemBar(global.__ctx),
  setState: s => { state = s },
  setItems: a => { currentItems = a },
  closeList: () => { itemListOpen = false; itemDetail = null },
  touch: (x,y) => handleTouch(x, y, 'end'),
  getOpen: () => ({ list: itemListOpen, detail: itemDetail && itemDetail.item ? itemDetail.item.name : null }),
  getLayout: () => layout,
};
`;

function load(w, h, src) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p167-' + Math.random().toString(36).slice(2), null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(src + HOOK, SRC);
  return m.exports.__t;
}

function freshItems() { return REAL.map(o => Object.assign({}, o)); }

const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];

console.log('=== ① A/B：11 件时点「+N」格，开什么？ ===');
for (const [w, h] of SCREENS) {
  const line = [];
  for (const [tag, src] of [['修复后', RAW], ['修复前', OLD_SRC]]) {
    const T = load(w, h, src);
    T.initLayout(); T.adjust();
    const ctx = createCanvas(w, h).getContext('2d'); global.__ctx = ctx;
    const items = freshItems();
    T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items, round: 5,
      name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
    T.setItems(items);
    // 模拟「先 10 件画过一帧，再拿到第 11 件」——旧 bug 只在增量帧出现
    // （必须是同一批对象：真机物品数组是持久的，新增只在尾部追加）
    const first10 = items.slice(0, 10);
    T.setItems(first10); T.drawBar();
    T.setItems(items); T.drawBar();
    const ov = items.find(it => it._overflowBounds);
    if (!ov) { line.push(`${tag}: 无溢出格`); continue; }
    const b = ov._overflowBounds;
    T.closeList();
    T.touch(b.x + b.w / 2, b.y + b.h / 2);
    const r = T.getOpen();
    line.push(`${tag}: list=${r.list} detail=${r.detail}`);
  }
  console.log(`  ${w}×${h}  ${line.join('   |   ')}`);
}

console.log('\n=== ② 修复后：9 个可见格逐个点，命中对不对 ===');
for (const [w, h] of SCREENS.slice(0, 4)) {
  const T = load(w, h, RAW);
  T.initLayout(); T.adjust();
  global.__ctx = createCanvas(w, h).getContext('2d');
  const items = freshItems();
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items, round: 5,
    name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems(items); T.drawBar();
  const expect = items.slice().reverse(); // 倒序渲染：reversed[0] 在左上第一格
  let bad = 0, checked = 0;
  items.forEach((it, i) => {
    if (!it._bounds) return;
    checked++;
    T.closeList();
    T.touch(it._bounds.x + it._bounds.w / 2, it._bounds.y + it._bounds.h / 2);
    const got = T.getOpen().detail;
    const want = it.name;
    if (got !== want) { bad++; console.log(`    ✗ ${w}×${h} 点「${want}」格 → 开到「${got}」`); }
  });
  console.log(`  ${w}×${h}  可见物品格 ${checked} 个，错配 ${bad} 个 ${bad === 0 ? '✅' : '❌'}（倒序首件=${expect[0].name}）`);
}

console.log('\n=== ③ 溢出件数 N vs 真实看不见件数 ===');
for (const [w, h] of SCREENS) {
  const T = load(w, h, RAW);
  T.initLayout(); T.adjust();
  global.__ctx = createCanvas(w, h).getContext('2d');
  const items = freshItems();
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items, round: 5,
    name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems(items); T.drawBar();
  const drawn = items.filter(it => it._bounds).length;
  const hidden = items.length - drawn;
  const texts = [];
  const ctx = global.__ctx; const orig = ctx.fillText.bind(ctx);
  ctx.fillText = (t, x, y, ...r) => { texts.push(String(t)); return orig(t, x, y, ...r); };
  T.drawBar();
  ctx.fillText = orig;
  const plusN = texts.find(t => /^\+\d+件$/.test(t));
  const n = plusN ? parseInt(plusN.slice(1)) : null;
  console.log(`  ${w}×${h}  画出的物品 ${drawn} 件 / 隐藏 ${hidden} 件 / 徽标「${plusN}」 ${n === hidden ? '✅' : '❌ 少算 ' + (hidden - n) + ' 件'}`);
}
