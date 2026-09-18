// P-165 物品清单浮窗几何审查（真实 game.js + 真机 11 件数据 + CJK 垫片）
//   背景：P-152-2 修好「+N 件」入口后，这个浮窗才真正打得开 —— 但里面的几何**从未审过**。
//   P-153 只查了「滚动后点行会不会开错物品」（命中区归属，结论安全），没查文字溢出/重叠。
//   审 4 件事：
//    ① 面板是否出屏（pw=min(300,w-32), ph=min(420,h-120)，居中）
//    ② 行内「名称」无 maxWidth（game.js:4126）→ 撞不撞行尾「耐久」？真机/极端长度阈值多少
//    ③ 「简述」已截断 20 字（:4133）→ 9px 下会不会冲出面板
//    ④ 底部「↑ 滑动查看全部 ↓」提示 vs 列表区底 listBottom（只有 8px 间隙）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';

// 真机数据：李昌 current_items（2026-09-18 从 DB 直读）
const REAL_ITEMS = [
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
  render: () => render(global.__ctx),
  setState: s => { state = s },
  setItems: a => { currentItems = a },
  openList: v => { itemListOpen = v },
  setScroll: v => { itemListScroll = v },
  getLayout: () => layout,
};
`;

const SCREENS = [[375, 812], [360, 780], [320, 568], [320, 480]];

// 极端名称长度扫描（AI 通常 2~5 字，但名称无 maxWidth，找出撞「耐久」的阈值）
function withName(n) { return REAL_ITEMS.map((it, i) => (i === 0 ? Object.assign({}, it, { name: n }) : it)); }

for (const [w, h] of SCREENS) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p165', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  const T = m.exports.__t;
  T.initLayout();
  const cv = createCanvas(w, h), ctx = cv.getContext('2d');
  global.__ctx = ctx;
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items: REAL_ITEMS, round: 5,
    name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems(REAL_ITEMS);
  T.openList(true);
  T.setScroll(0);

  // 录所有 fillText，按 textAlign 还原左右缘
  const recs = [];
  const orig = ctx.fillText.bind(ctx);
  ctx.fillText = (t, x, y, ...r) => {
    const tw = ctx.measureText(String(t)).width, a = ctx.textAlign || 'left';
    const left = a === 'center' ? x - tw / 2 : (a === 'right' ? x - tw : x);
    recs.push({ t: String(t), x, y, w: tw, left, right: left + tw, align: a });
    return orig(t, x, y, ...r);
  };
  T.render();

  const L = T.getLayout();
  const pw = Math.min(300, w - 32), ph = Math.min(420, h - 120);
  const px = (w - pw) / 2, py = (h - ph) / 2;
  const listX = px + 14, listW = pw - 28, listTop = py + 44, listBottom = py + ph - 14, rowH = 46;

  // ① 面板出屏
  const out = (px < 0 || py < 0 || px + pw > w || py + ph > h) ? '❌ 出屏' : '✅';
  // 面板范围内的文本
  const inPanel = recs.filter(r => r.y >= py && r.y <= py + ph);
  // ③ 简述/名称右缘溢出面板
  const over = inPanel.filter(r => r.right > px + pw - 6);
  // ② 同行（y 差 <4）内 x 区间重叠 → 名称 vs 耐久
  let clash = [];
  for (let i = 0; i < inPanel.length; i++) for (let j = i + 1; j < inPanel.length; j++) {
    const a = inPanel[i], b = inPanel[j];
    if (Math.abs(a.y - b.y) < 4) {
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (ox > 0) clash.push({ a: a.t.slice(0, 8), b: b.t.slice(0, 8), ox: ox.toFixed(1), y: a.y.toFixed(0), inList: a.y <= listBottom && b.y <= listBottom });
    }
  }
  // ④ 滚动提示 vs 列表区底
  const hint = recs.find(r => /滑动查看全部/.test(r.t));
  const hintOver = hint ? (hint.y > listBottom ? 0 : Math.round(hint.y - listBottom)) : null;

  console.log(`── ${w}x${h} ── 面板 ${px.toFixed(0)},${py.toFixed(0)} ${pw}x${ph} ${out} | 可见行=${((listBottom - listTop) / rowH).toFixed(1)}/${REAL_ITEMS.length} 需滚动=${REAL_ITEMS.length * rowH > (listBottom - listTop) ? '是' : '否'}`);
  console.log(`   溢出面板文字 ${over.length} 条${over.length ? '：' + over.slice(0, 3).map(o => `「${o.t.slice(0, 10)}」+${(o.right - (px + pw)).toFixed(0)}px`).join(' ') : ' ✅'}`);
  const clashReal = clash.filter(c => c.inList);
  console.log(`   同行重叠 ${clash.length} 处${clash.length ? '：' + clash.slice(0, 4).map(c => `${c.a}×${c.b}(${c.ox}px @y=${c.y} ${c.inList ? '列表内' : '列表外-不计'})`).join(' ') : ' ✅'}${clash.length ? ` | 其中真·列表内重叠 ${clashReal.length} 处` : ''}`);
  console.log(`   滚动提示 y=${hint ? hint.y : '-'} vs 列表底=${listBottom.toFixed(0)} → ${hintOver == null ? '未显示' : (hintOver >= 0 ? '✅ 在列表下' : `🟠 压进列表 ${-hintOver}px`)}`);
}

// ── 名称长度阈值扫描（375x812，改「旧帕子包钱」= 有 durability 那行，量名称何时撞行尾「耐久」）──
console.log('\n── 名称长度阈值（375x812，行尾有「耐久60」）──');
{
  const [w, h] = [375, 812];
  for (const n of [5, 8, 12, 14, 16, 20, 24]) {
    global.wx = makeWx(w, h); global.createCanvas = createCanvas;
    const m = new Module('game-p165b', null);
    m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
    m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
    const T = m.exports.__t;
    T.initLayout();
    const cv = createCanvas(w, h), ctx = cv.getContext('2d'); global.__ctx = ctx;
    const items = REAL_ITEMS.map((it, i) => (i === 3 ? Object.assign({}, it, { name: '物'.repeat(n) }) : it));
    T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items, round: 5,
      name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
    T.setItems(items); T.openList(true); T.setScroll(0);
    const recs = []; const orig = ctx.fillText.bind(ctx);
    ctx.fillText = (t, x, y, ...r) => {
      const tw = ctx.measureText(String(t)).width, a = ctx.textAlign || 'left';
      const left = a === 'center' ? x - tw / 2 : (a === 'right' ? x - tw : x);
      recs.push({ t: String(t), y, left, right: left + tw });
      return orig(t, x, y, ...r);
    };
    T.render();
    const L = T.getLayout();
    const pw = Math.min(300, w - 32), ph = Math.min(420, h - 120);
    const px = (w - pw) / 2, py = (h - ph) / 2, listBottom = py + ph - 14;
    const nm = recs.find(r => r.t === '物'.repeat(n));
    const dur = recs.find(r => /^耐久/.test(r.t) && r.y === (nm ? nm.y : -1));
    const clash = (nm && dur) ? Math.round(nm.right - dur.left) : null;
    console.log(`  名称${String(n).padStart(2)}字：右缘=${nm ? nm.right.toFixed(0) : '-'} 耐久左缘=${dur ? dur.left.toFixed(0) : '-'} → ${clash == null ? '?' : (clash > 0 ? `❌ 撞上 ${clash}px` : `✅ 余 ${-clash}px`)} | 面板右缘=${(px + pw).toFixed(0)}${nm && nm.right > px + pw - 6 ? ' ❌ 溢出面板' : ''}`);
  }
}
