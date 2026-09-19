// P-164 · 160 期 ②UX-A：主界面「等待态」几何审查（真实 game.js 模块 + 桩 wx）
//   此前 144-159 期审过：选项区/底栏/物品清单/死亡结算/榜单弹窗/属性详情/叙事区/顶栏/
//   开局四页/榜单页/序章/身份页/物品详情/命格详情/自由输入。
//   **等待态（drawNarrative 的 loading 分支，game.js:2098）从未单独审过** → 本期补。
//   查三件事：
//    ① 等待条 bar(x=padding, y=textY+30, h=40) 会不会压到输入框常驻区 / 物品栏
//    ② loadingText（最长「史官正在落笔…（已等 60 秒）」）13px 楷体是否冲出 bar 右缘
//    ③ 三态（正常/等待/错误）下 textY+textH 是否一致（等待态是否吃掉叙事区）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const KAI = '"STKaiti", "KaiTi", "楷体", sans-serif';
const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];

function makeWx(w, h) {
  const si = { windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 44, bottom: h - 34 } };
  return { getSystemInfoSync: () => si, getWindowInfo: () => si,
    onTouchStart(){}, onTouchEnd(){}, onTouchMove(){}, onKeyboardHeightChange(){}, offKeyboardHeightChange(){},
    createInnerAudioContext: () => ({ onEnded(){}, play(){}, stop(){}, destroy(){} }),
    setStorageSync(){}, getStorageSync: () => 'probe-openid', showToast(){}, hideKeyboard(){},
    cloud: { init(){}, callFunction(){} }, request(){},
    getMenuButtonBoundingClientRect: () => ({ top: 44, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize(){}, offWindowResize(){},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}) };
}

const HOOK = `
module.exports.__t = {
  initLayout,
  render: () => render(global.__ctx),
  setState: s => { state = s },
  setNarrative: n => { narrative = n; displayStartTime = 0; displayedChars = (narrative||'').length },
  setLoading: v => { loading = v; loadingStart = Date.now() - 45000; loadingText = '史官正在落笔…（已等 60 秒）' },
  setError: e => { errorMsg = e },
  getLayout: () => layout,
};
`;

for (const [w, h] of SCREENS) {
  global.wx = makeWx(w, h);
  global.createCanvas = createCanvas;
  const m = new Module('game-p164', null);
  m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
  m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
  const T = m.exports.__t;
  T.initLayout();
  const cv = createCanvas(w, h); global.__ctx = cv.getContext('2d');
  T.setState({ dynasty: '后周', eraDisplay: '显德五年', year: 960, month: 5, items: [], round: 5,
    name: '仆固怀恩', age: 24, city: '开封', occupation: '禁军', social_class: '军户' });
  const L0 = T.getLayout();

  // 等待态
  T.setNarrative('');
  T.setLoading(true);
  T.render();
  const L = T.getLayout();
  const pad = L.padding;
  const bar = { x: pad, y: L.textY + 30, w: L.windowW - pad * 2, h: 40 };
  const ctx = global.__ctx;
  ctx.save(); ctx.font = '13px ' + KAI;
  const tw = ctx.measureText('史官正在落笔…（已等 60 秒）').width;
  ctx.restore();
  const textEnd = pad + 46 + tw;
  const barRight = bar.x + bar.w;
  const inputTop = L.inputY;
  const itemTop = L.itemBarY;
  const barBottom = bar.y + bar.h;
  console.log(`【${w}x${h} 等待态】textY=${L.textY} textH=${L.textH} | bar=${bar.y}~${barBottom} (底距输入框顶=${inputTop - barBottom}, 距物品栏顶=${itemTop - barBottom})`);
  console.log(`   文案宽=${tw.toFixed(1)} 起点=${pad + 46} 终点=${textEnd.toFixed(1)} vs bar右缘=${barRight} → ${textEnd <= barRight - 4 ? '✅ 不溢出' : (textEnd <= barRight ? '🟠 贴边(<4px)' : '❌ 冲出 ' + (textEnd - barRight).toFixed(1) + 'px')}`);
  console.log(`   bar压输入框=${barBottom > inputTop ? '❌ 重叠 ' + (barBottom - inputTop) + 'px' : '✅'} | bar压物品栏=${barBottom > itemTop ? '❌ 重叠 ' + (barBottom - itemTop) + 'px' : '✅'}`);

  // 正常态对照
  T.setLoading(false);
  T.setNarrative('测试叙事。'.repeat(20));
  T.render();
  const L2 = T.getLayout();
  console.log(`   [对照 正常态] textH=${L2.textH} inputY=${L2.inputY} optionY=${L2.optionY} | 等待态vs正常态 textH 差=${L.textH - L2.textH}`);
}
