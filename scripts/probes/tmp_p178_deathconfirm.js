// P-178 死亡确认覆盖层几何审查（真实 game.js + CJK 垫片）
//   背景：drawDeathConfirm（game.js:1573）是 v3.0.37/P-150-1 才真正可见的「新出现」层，
//   从未审过几何。它的语义是「先看临终叙事，再点封笔」→ 那么它就**不该盖住叙事文字**。
//   审 4 件事：
//    ① 标题「— 你死了 —」/ 副题「此生已终」/ 「封 笔」按钮，有没有压到叙事正文行
//    ② 标题 32px 在 320 宽会不会撑出屏
//    ③ 按钮是否完整在屏内（0.7h + 48）
//    ④ 按钮是否压住底栏物品栏/自由输入框（视觉遮挡）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } };
  return {
    getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: (k) => (k === 'lives' ? [] : 'probe-openid'),
    showToast() {}, hideKeyboard() {}, cloud: { init() {}, callFunction() {} }, request() {},
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
  setDeath: v => { deathConfirmPending = v; alive = !v },
  getLayout: () => layout,
};
`;

// 真机口吻的临终叙事（AI 通常 200~300 字；短档 60 字对照）
const NARR_LONG = '显德七年春，北汉军压境，你率三百骑断后，退至芦芽山口。箭矢尽，刀刃卷，身边的老卒一个接一个倒下。'
  + '你想起汴京的雨，想起王婆塞进怀里的那张粗粮饼，想起翠姑在城门口回头看的那一眼。'
  + '暮色压下来，你把半枚虎符塞进衣襟，提起最后一口气冲进敌阵。'
  + '此后史书只写一行：义军指挥使李某，殁于高平之役，尸骨无存。';
const NARR_SHORT = '你在北伐途中中伏，突围南奔，终殁于乱军之中。';

const ITEMS = [
  { desc: '手电筒（耐久 85）', icon: '🔦', id: 'flashlight', name: '手电筒' },
  { desc: '柴荣赠送的旧帕子，里面包着几吊铜钱', durability: 60, icon: '🧣', name: '旧帕子包钱' },
  { desc: '从黑衣人身上搜来的短刃', durability: 85, icon: '🗡️', name: '匕首' },
];

const SCREENS = [[375, 812], [390, 844], [360, 780], [375, 667], [320, 568], [320, 480]];

function run(w, h, narr, tag) {
  global.wx = makeWx(w, h); global.createCanvas = createCanvas;
  const m = new Module('game-p178', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  const T = m.exports.__t;
  T.initLayout();
  const cv = createCanvas(w, h), ctx = cv.getContext('2d'); global.__ctx = ctx;
  T.setState({ dynasty: '五代十国', eraDisplay: '显德七年', year: 960, month: 3, items: ITEMS, round: 21,
    name: '李昌', age: 39, city: '汴京', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems(ITEMS); T.setNarrative(narr); T.setDeath(true);

  const recs = [];
  const orig = ctx.fillText.bind(ctx);
  ctx.fillText = (t, x, y, ...r) => {
    const str = String(t);
    const tw = ctx.measureText(str).width, a = ctx.textAlign || 'left';
    const left = a === 'center' ? x - tw / 2 : (a === 'right' ? x - tw : x);
    recs.push({ t: str, x, y, w: tw, left, right: left + tw, font: ctx.font });
    return orig(t, x, y, ...r);
  };
  T.render();
  ctx.fillText = orig;

  const L = T.getLayout();
  const titleY = h * 0.35, subY = titleY + 40;
  const btn = L._deathConfirmBtn;

  // 叙事正文行：排除已知的固定元素（标题/副题/封笔/UI）
  const skip = /你死了|此生已终|封 笔|还差|超越|登上/;
  const narrLines = recs.filter(r => r.t.length > 1 && !skip.test(r.t) && r.y > 40 && r.y < (L.itemBarY != null ? L.itemBarY : h - 60));

  const inSpan = (y, top, bot) => y >= top && y <= bot;
  const hitCount = (top, bot) => narrLines.filter(r => inSpan(r.y, top, bot) || inSpan(r.y + 8, top, bot) || inSpan(r.y - 8, top, bot)).length;

  const titleRec = recs.find(r => /你死了/.test(r.t));
  const subRec = recs.find(r => /此生已终/.test(r.t));

  const overflow = titleRec ? (titleRec.right > w || titleRec.left < 0) : false;
  const btnOut = btn ? (btn.y + btn.h > h || btn.x < 0 || btn.x + btn.w > w) : true;

  // 按钮是否压住底栏（物品栏顶 / 自由输入框）
  const barTop = L.itemBarY != null ? L.itemBarY : null;
  const freeInput = L._freeInputBtn || null;
  const barHit = barTop != null && btn && (btn.y + btn.h > barTop);
  const fiHit = freeInput && btn && !(btn.y + btn.h < freeInput.y || btn.y > freeInput.y + freeInput.h);

  console.log(`\n── ${w}x${h} · ${tag}（叙事 ${narr.length} 字 / 渲染行 ${narrLines.length} 行）──`);
  console.log(`   标题 y=${titleY.toFixed(0)} 宽=${titleRec ? titleRec.w.toFixed(0) : '-'}px 左=${titleRec ? titleRec.left.toFixed(0) : '-'} 右=${titleRec ? titleRec.right.toFixed(0) : '-'} vs 屏宽 ${w} → ${overflow ? '❌ 出屏' : '✅'}`);
  console.log(`   按钮 ${btn ? `${btn.x.toFixed(0)},${btn.y.toFixed(0)} ${btn.w}x${btn.h} 底=${(btn.y + btn.h).toFixed(0)}` : '未生成'} vs 屏高 ${h} → ${btnOut ? '❌ 出屏' : '✅'}；压物品栏=${barHit ? '❌' : '否 ✅'} 压输入框=${fiHit ? '❌' : '否 ✅'}`);
  const tHit = hitCount(titleY - 18, titleY + 18);
  const sHit = hitCount(subY - 10, subY + 10);
  const bHit = btn ? hitCount(btn.y - 6, btn.y + btn.h + 6) : 0;
  console.log(`   压住叙事行：标题 ${tHit} 行 / 副题 ${sHit} 行 / 按钮 ${bHit} 行  → ${(tHit + sHit + bHit) === 0 ? '✅ 全不压' : '🟠 有遮挡'}`);
  if (narrLines.length) {
    const ys = narrLines.map(r => r.y);
    console.log(`   叙事 y 范围 ${Math.min(...ys).toFixed(0)}~${Math.max(...ys).toFixed(0)}（${narrLines.length} 行）| 标题 ${titleY.toFixed(0)} / 按钮 ${btn ? btn.y.toFixed(0) + '~' + (btn.y + btn.h).toFixed(0) : '-'}`);
    if (process.env.P178_DUMP) {
      for (const r of narrLines) console.log(`      y=${r.y.toFixed(0)} 「${r.t.slice(0, 18)}」`);
    }
  }
}

function pad(n) { let s = ''; while (s.length < n) s += NARR_LONG; return s.slice(0, n); }

const LENS = (process.env.P178_LENS ? process.env.P178_LENS.split(',').map(Number) : [60, 145, 200, 260, 300, 360]);

for (const [w, h] of SCREENS) {
  for (const n of LENS) run(w, h, pad(n), `叙事${n}字`);
}
