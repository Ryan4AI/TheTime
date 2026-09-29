// P-168 选项区几何 + 热区审查（真实 game.js + CJK 垫片 + DB 真机选项语料）
//   往期已审：开局四页(P-161) / 死亡页(P-164b) / 身份页(P-162) / 榜单+序章(P-163)
//             / 等待态(P-164) / 物品清单(P-165) / 键盘态(P-166) / 物品命中区(P-167)
//   本期首次审：**选项交互区**（drawOptions 2262 / drawFreeInputButton 2380）——每轮必经、点击最密
//   语料：narrate_history 里 role=ai 的正文，抽 options 数组，统计真实长度分布后喂给几何检查
const fs = require('fs'), path = require('path'), Module = require('module'), https = require('https');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const RAW = fs.readFileSync(SRC, 'utf8');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json', 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b).access_token)); }).on('error', rej));
function dbQuery(query, isCount) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const o = { hostname: 'api.weixin.qq.com',
      path: `/tcb/${isCount ? 'databasecount' : 'databasequery'}?access_token=${TOKEN}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
    const rq = https.request(o, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try { const j = JSON.parse(d);
        if (Array.isArray(j.data)) j.data = j.data.map(s => { try { return JSON.parse(s) } catch (e) { return { __raw: s.slice(0, 120) } } });
        resolve(j);
      } catch (e) { resolve({ raw: d.slice(0, 300) }) } }); });
    rq.on('error', reject); rq.write(body); rq.end();
  });
}
const rows = r => (r && Array.isArray(r.data)) ? r.data : [];

// ── wx 桩 ──
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
  setOptions: a => { options = a },
  getOptions: () => options,
  setAppear: t => { optionsAppearTime = t },
  setNarr: (n, d) => { narrative = n; displayedChars = d },
  setFreeText: s => { freeInputText = s },
  drawOpts: () => drawOptions(global.__ctx),
  drawFree: () => drawFreeInputButton(global.__ctx),
  setState: s => { state = s },
  setItems: a => { currentItems = a },
  getLayout: () => layout,
};
`;
function load(w, h) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p168-' + Math.random().toString(36).slice(2), null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(RAW + HOOK, SRC);
  return m.exports.__t;
}

const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];

// 录制 fillText：拿到真实右缘（textAlign=left 时右缘 = x + width）
function recordText(T, fn) {
  const ctx = global.__ctx, orig = ctx.fillText.bind(ctx);
  const rec = [];
  ctx.fillText = function (t, x, y, ...r) {
    const w = ctx.measureText(String(t)).width;
    const align = ctx.textAlign;
    const left = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
    rec.push({ t: String(t), x, y, w, left, right: left + w, font: ctx.font });
    return orig(t, x, y, ...r);
  };
  fn();
  ctx.fillText = orig;
  return rec;
}

function setup(T, w, h) {
  T.initLayout();
  T.setNarr('测试叙事文本', 999);
  T.setState({ dynasty: '五代十国', eraDisplay: '显德五年', year: 960, month: 5, items: [], round: 5,
    name: '李昌', age: 39, city: '永安镇', occupation: '义军指挥使', social_class: '庶民' });
  T.setItems([]);
  T.setFreeText('');
  T.setAppear(Date.now() - 5000);
}

(async () => {
  TOKEN = await getToken();

  // ── ① 语料：真机 AI 选项文案长度分布 ──
  console.log('=== ① DB 真机选项语料（narrate_history role=ai）===');
  const labels = [];
  for (let p = 0; p < 3; p++) {
    const r = await dbQuery(`db.collection('narrate_history').where({role:'ai'}).orderBy('seq','desc').skip(${p * 100}).limit(100).get()`);
    for (const x of rows(r)) {
      let opts = x.options;
      if (typeof opts === 'string') { try { opts = JSON.parse(opts) } catch (e) { opts = null } }
      if (!Array.isArray(opts) && typeof x.content === 'string') {
        const c = x.content;
        try { const j = JSON.parse(c); opts = j.options || (j.branch && j.branch.options) } catch (e) {
          const m = /"options"\s*:\s*\[([^\]]*)\]/.exec(c);
          if (m) { try { opts = JSON.parse('[' + m[1] + ']') } catch (e2) {} }
        }
      }
      if (Array.isArray(opts)) for (const o of opts) {
        const s = (typeof o === 'string') ? o : (o && (o.label || o.text));
        if (typeof s === 'string' && s.trim()) labels.push(s.trim());
      }
    }
  }
  const lens = labels.map(s => s.length).sort((a, b) => a - b);
  const pct = q => lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * q))] : 0;
  const max = lens.length ? lens[lens.length - 1] : 0;
  console.log(`  抽到选项 ${labels.length} 条 | 长度 中位数 ${pct(0.5)} / p90 ${pct(0.9)} / p99 ${pct(0.99)} / 最长 ${max}`);
  const buckets = [10, 15, 20, 25, 30, 40, 50];
  console.log('  超长占比：' + buckets.map(b => `>${b}字 ${(lens.filter(l => l > b).length)}条(${labels.length ? (lens.filter(l => l > b).length * 100 / labels.length).toFixed(1) : 0}%)`).join(' | '));
  const longest = labels.slice().sort((a, b) => b.length - a.length).slice(0, 3);
  longest.forEach(s => console.log(`  最长样本(${s.length}字)：${s}`));
  const MED = labels.length ? pct(0.5) : 12;
  const p99 = labels.length ? pct(0.99) : 30;

  // ── ② 三选项典型排布：垂直是否安全 ──
  console.log('\n=== ② 三选项垂直排布（中位长度文案 ×3）vs 底部物品栏 ===');
  const mkLabel = n => '选'.repeat(Math.max(1, Math.round(n)));
  for (const [w, h] of SCREENS) {
    const T = load(w, h);
    global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h);
    T.setOptions([{ label: mkLabel(MED) }, { label: mkLabel(MED) }, { label: mkLabel(MED) }]);
    T.adjust(); T.drawOpts();
    const L = T.getLayout();
    const opts = T.getOptions();
    const blockBottom = opts.length ? (opts[opts.length - 1].bounds ? opts[opts.length - 1].bounds.y + opts[opts.length - 1].bounds.h : L.optionY) : L.optionY;
    const gapToBar = (L.itemBarY != null ? L.itemBarY : h) - blockBottom;
    const gapToBottom = h - blockBottom;
    console.log(`  ${w}×${h}  optionY=${L.optionY ? Math.round(L.optionY) : '?'} fadeIn=${L.optionFadeIn} bounds=${JSON.stringify(opts.map(o => o.bounds ? [Math.round(o.bounds.y), Math.round(o.bounds.h)] : null))} 选项底=${Math.round(blockBottom)} 距物品栏=${Math.round(gapToBar)}px 距屏底=${Math.round(gapToBottom)}px ${gapToBar >= 0 ? '✅' : '❌ 压物品栏 ' + Math.round(-gapToBar) + 'px'}`);
  }

  // ── ②b 双行选项（真机 p90=21 字 / 320 屏 19 字即双行）三连击时的垂直兜底 ──
  console.log('\n=== ②b 三条「双行」选项时垂直兜底（压缩叙事区后还剩多少）===');
  for (const [w, h] of SCREENS) {
    const T = load(w, h);
    global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h);
    const P90 = labels.length ? pct(0.9) : 21;
    T.setOptions([{ label: mkLabel(P90) }, { label: mkLabel(P90) }, { label: mkLabel(P90) }]);
    T.adjust(); T.drawOpts();
    const L = T.getLayout();
    const opts = T.getOptions();
    const lines = opts.map(o => o._lines).join('/');
    const blockBottom = opts[opts.length - 1].bounds ? opts[opts.length - 1].bounds.y + opts[opts.length - 1].bounds.h : L.optionY;
    const gapToBar = (L.itemBarY != null ? L.itemBarY : h) - blockBottom;
    console.log(`  ${w}×${h}  ${P90}字 → 行数=${lines} textH=${Math.round(L.textH)} 选项底=${Math.round(blockBottom)} 距物品栏=${Math.round(gapToBar)}px ${gapToBar >= 0 ? '✅' : '❌ 压物品栏 ' + Math.round(-gapToBar) + 'px'}`);
  }

  // ── ③ 长文案：横向溢出 + 双行纵向溢出 ──
  console.log('\n=== ③ 长选项文案溢出（CJK 垫片实测）===');
  const CASES = [MED, 20, 25, 30, 40, 50, 60].filter((v, i, a) => a.indexOf(v) === i);
  for (const [w, h] of SCREENS) {
    const out = [];
    for (const n of CASES) {
      const T = load(w, h);
      global.__ctx = createCanvas(w, h).getContext('2d');
      setup(T, w, h);
      T.setOptions([{ label: mkLabel(n) }]);
      T.adjust();
      const rec = recordText(T, () => T.drawOpts());
      const L = T.getLayout();
      const rightLimit = L.padding + (L.windowW - L.padding * 2);
      // 只取选项文字（排除序号「一/二/三」）
      const optText = rec.filter(r => r.t === mkLabel(n) || r.t.startsWith('选'));
      const worst = optText.reduce((m, r) => Math.max(m, r.right - rightLimit), -9999);
      const opt = T.getOptions()[0];
      const bottomLimit = opt && opt.bounds ? opt.bounds.y + opt.bounds.h : null;
      const spillY = optText.length ? Math.max(...optText.map(r => r.y)) - bottomLimit : -9999;
      out.push(`${n}字:${worst > 0 ? '横溢' + Math.round(worst) : 'ok'}${spillY > 0 ? '/纵溢' + Math.round(spillY) : ''}`);
    }
    console.log(`  ${w}×${h}  ${out.join('  ')}`);
  }

  // ── ③b 真机最长文案复测 ──
  if (longest.length) {
    console.log('  -- 真机最长文案复测 --');
    for (const [w, h] of SCREENS) {
      const T = load(w, h);
      global.__ctx = createCanvas(w, h).getContext('2d');
      setup(T, w, h);
      T.setOptions([{ label: longest[0] }]);
      T.adjust();
      const rec = recordText(T, () => T.drawOpts());
      const L = T.getLayout();
      const rightLimit = L.padding + (L.windowW - L.padding * 2);
      const optText = rec.filter(r => r.t.length > 2);
      const worst = optText.reduce((m, r) => Math.max(m, r.right - rightLimit), -9999);
      console.log(`  ${w}×${h}  真机最长 ${longest[0].length} 字 → ${worst > 0 ? '❌ 横溢 ' + Math.round(worst) + 'px' : '✅ 不溢出（余 ' + Math.round(-worst) + 'px）'}`);
    }
  }

  // ── ④ 热区：选项 bounds 是否覆盖整行 / 相邻是否留缝 / 与输入框重叠 ──
  console.log('\n=== ④ 选项热区 ===');
  for (const [w, h] of SCREENS.slice(0, 4)) {
    const T = load(w, h);
    global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h);
    T.setOptions([{ label: mkLabel(MED) }, { label: mkLabel(MED) }, { label: mkLabel(MED) }]);
    T.adjust(); T.drawOpts(); T.drawFree();
    const L = T.getLayout();
    const opts = T.getOptions();
    const widths = opts.map(o => o.bounds ? Math.round(o.bounds.w) : null);
    const gaps = [];
    for (let i = 1; i < opts.length; i++) if (opts[i].bounds && opts[i - 1].bounds)
      gaps.push(Math.round(opts[i].bounds.y - (opts[i - 1].bounds.y + opts[i - 1].bounds.h)));
    const fb = L._freeInputBtn;
    const firstTop = opts[0].bounds ? opts[0].bounds.y : null;
    const overlapInput = (fb && firstTop != null) ? Math.round(fb.y + fb.h - firstTop) : null;
    console.log(`  ${w}×${h}  热区宽=${widths.join('/')} (屏宽${w}) 行间缝=${gaps.join('/')}px 与输入框重叠=${overlapInput}px ${overlapInput != null && overlapInput > 0 ? '❌' : '✅'}`);
  }

  // ── ⑤ 错峰淡入期间：后两个选项是否有热区 ──
  console.log('\n=== ⑤ 淡入错峰（optionsAppearTime=now）时各选项热区 ===');
  for (const [w, h] of SCREENS.slice(0, 2)) {
    const T = load(w, h);
    global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h);
    T.setOptions([{ label: mkLabel(MED) }, { label: mkLabel(MED) }, { label: mkLabel(MED) }]);
    T.setAppear(Date.now());
    T.adjust(); T.drawOpts();
    const opts = T.getOptions();
    console.log(`  ${w}×${h}  有热区的选项数 = ${opts.filter(o => o.bounds).length}/3  ${opts.filter(o => o.bounds).length < 3 ? '❌ 淡入前 0~200ms 点后面的选项无反应' : '✅'}`);
  }

  // ── ⑦ AI 给 4 个选项时（DB 有 3 轮真实存在）：切片不一致 → 会不会压物品栏 ──
  console.log('\n=== ⑦ 四选项垂直排布（代码两条路径切片不一致：partial slice(0,3) / 另一条不切）===');
  for (const [w, h] of SCREENS) {
    const T = load(w, h);
    global.__ctx = createCanvas(w, h).getContext('2d');
    setup(T, w, h);
    T.setOptions([0, 1, 2, 3].map(() => ({ label: mkLabel(MED) })));
    T.adjust(); T.drawOpts();
    const L = T.getLayout();
    const opts = T.getOptions();
    const drawn = opts.filter(o => o.bounds);
    const bottom = drawn.length ? drawn[drawn.length - 1].bounds.y + drawn[drawn.length - 1].bounds.h : L.optionY;
    const gap = (L.itemBarY != null ? L.itemBarY : h) - bottom;
    console.log(`  ${w}×${h}  画出的选项=${drawn.length} textH=${Math.round(L.textH)} 选项底=${Math.round(bottom)} 距物品栏=${Math.round(gap)}px ${gap >= 0 ? '✅' : '❌ 压物品栏 ' + Math.round(-gap) + 'px'}`);
  }

  // ── ⑥ 自由输入框长文本（候选 #14 复测，CJK 垫片）──
  console.log('\n=== ⑥ 自由输入长文本横向溢出 ===');
  for (const [w, h] of SCREENS) {
    const out = [];
    for (const n of [8, 16, 24, 32, 50]) {
      const T = load(w, h);
      global.__ctx = createCanvas(w, h).getContext('2d');
      setup(T, w, h);
      T.setOptions([{ label: mkLabel(MED) }]);
      T.setFreeText('做'.repeat(n));
      T.adjust();
      const rec = recordText(T, () => T.drawFree());
      const L = T.getLayout();
      const rightLimit = L.padding + (L.windowW - L.padding * 2);
      const body = rec.find(r => r.t.startsWith('做'));
      const over = body ? body.right - rightLimit : null;
      out.push(`${n}字:${over > 0 ? '溢' + Math.round(over) : 'ok'}`);
    }
    console.log(`  ${w}×${h}  ${out.join('  ')}`);
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
