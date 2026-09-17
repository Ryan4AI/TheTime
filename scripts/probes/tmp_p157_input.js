// P-156b 「等待 / 反馈 / 输入」三区文本几何检查（PMO 2026-09-16 156 期巡检新增）
//  此前 144-155 期审过：选项区 / 底栏(命格·物品格·飘字) / 物品清单浮窗 / 死亡结算 / 榜单弹窗 /
//  属性详情 / 叙事区高度 / 顶栏 / 目标条。**这三块从未单独审过** → 本期补：
//   ① 自由输入框 drawFreeInputButton（2424 行）：用户输入的文本单行不换行不截断，
//      maxLength=100（4913 行）→ 长输入会不会冲出朱砂边框
//   ② Loading 提示条 drawLoading（3173 行）：13px 楷体单行，最长「史官正在落笔…（已等 N 秒）」
//   ③ 错误提示条 drawError（3220 行）：13px 居中单行（候选 #5 一直没实测过，本期给数据）
//  纯几何 + 真画布 measureText，不连 DB。
const fs = require('fs'); const path = require('path'); const Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const WIDTH = parseInt(process.env.P_W || '375', 10);
const wx = { getSystemInfoSync:()=>({windowWidth:WIDTH,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}}),
  onTouchStart(){},onTouchEnd(){},onTouchMove(){},offKeyboardHeightChange(){},onKeyboardHeightChange(){},
  cloud:{init(){},callFunction:()=>{}},setStorageSync(){},getStorageSync:()=>null,showToast(){},request(){},
  getWindowInfo:()=>({windowWidth:WIDTH,windowHeight:812,pixelRatio:2,safeArea:{top:44}}),
  getDeviceInfo:()=>({}),getAppBaseInfo:()=>({}),getSystemSetting:()=>({}),onWindowResize(){},offWindowResize(){},
  getMenuButtonBoundingClientRect:()=>({top:44,height:32,width:87,right:322}),createInnerAudioContext:()=>({}),
  hideKeyboard(){},getFileSystemManager:()=>({}) };
global.wx = wx;
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const HOOK = `
module.exports.__t = { initLayout, getLayout: () => layout };
`;
const m = new Module('game-probe', null);
m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
global.createCanvas = createCanvas;
m._compile(fs.readFileSync(SRC,'utf8') + HOOK, SRC);
const T = m.exports.__t;
T.initLayout();
const L = T.getLayout();
const cv = createCanvas(WIDTH, 812);
const ctx = cv.getContext('2d');
const KAI = '"STKaiti", "KaiTi", "楷体", sans-serif';
const W = L.windowW, P = L.padding;

console.log('=== P-156b 自由输入 / Loading / 错误条 文本几何 === 屏宽 ' + W + ' padding=' + P);

// ① 自由输入框：框 [P, W-P]，文字起点 P+16+18 = P+34，15px 楷体，左对齐
ctx.font = '15px ' + KAI;
const FI_START = P + 34, FI_RIGHT = W - P, FI_AVAIL = FI_RIGHT - FI_START;
console.log('\n① 自由输入框（框 ' + P + '→' + FI_RIGHT + '，文字起点 ' + FI_START + '，可用宽 ' + FI_AVAIL.toFixed(1) + '）');
const fiCases = [
  ['短 5 字', '我想去长安'],
  ['中 12 字', '我想去长安城找一份铁匠的活计'],
  ['长 22 字', '我要带着这把剑去洛阳城找当年那个救过我的老道士问清楚我的身世'],
  ['满 40 字', '我要带着这把剑一路往南走到洛阳城去找当年那个救过我的老道士问清楚我的身世到底是怎么回事然后再决定要不要回长安'],
];
let fiBad = 0;
for (const [tag, txt] of fiCases) {
  const w = ctx.measureText(txt).width;
  const over = w - FI_AVAIL;
  const ok = over <= 0;
  if (!ok) fiBad++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + tag + '（' + txt.length + '字）宽=' + w.toFixed(1)
    + ' 右缘=' + (FI_START + w).toFixed(1) + ' / 框右 ' + FI_RIGHT + '  溢出=' + over.toFixed(1));
}
// 反推：不溢出的最大字数（中文按 measureText 实测单字宽）
const cw15 = ctx.measureText('中').width;
console.log('  → 15px 楷体单字宽 ' + cw15.toFixed(2) + 'px，不溢出上限 ≈ ' + Math.floor(FI_AVAIL / cw15) + ' 字（maxLength 允许 100 字）');

// ② Loading 条：框 [P, W-P]，文字起点 P+18+28 = P+46，13px 楷体，左对齐
ctx.font = '13px ' + KAI;
const LD_START = P + 46, LD_AVAIL = (W - P) - LD_START;
console.log('\n② Loading 提示条（文字起点 ' + LD_START + '，可用宽 ' + LD_AVAIL.toFixed(1) + '）');
const ldCases = [
  ['基线', '史官正在落笔…'],
  ['已等 9 秒', '史官正在落笔…（已等 9 秒）'],
  ['已等 45 秒', '史官正在落笔…（已等 45 秒）'],
  ['已等 128 秒', '史官正在落笔…（已等 128 秒）'],
  ['结算中', '史官结算中…（已等 128 秒）'],
];
let ldBad = 0;
for (const [tag, txt] of ldCases) {
  const w = ctx.measureText(txt).width;
  const over = w - LD_AVAIL;
  const ok = over <= 0;
  if (!ok) ldBad++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + tag + ' "' + txt + '" 宽=' + w.toFixed(1) + '  溢出=' + over.toFixed(1));
}

// ③ 错误条：13px sans-serif，居中于 W/2，框 [P, W-P]
ctx.font = '13px sans-serif';
const ER_AVAIL = W - 2 * P;
console.log('\n③ 错误提示条（居中于 ' + (W / 2) + '，可用宽 ' + ER_AVAIL.toFixed(1) + '，单行不换行 barH=44）');
const erCases = [
  ['短', '网络似乎不太好'],
  ['典型云函数错误', '云函数 ai_narrate_worker 执行超时，请重试'],
  ['带英文', 'Error: errCode: -504003 timed out | cloud function execution timed out'],
  ['超长中文', '史官在推演时遇到了一点麻烦，可能是网络不太好，也可能是对话太长了，请稍后再试一次看看'],
];
let erBad = 0;
for (const [tag, txt] of erCases) {
  const w = ctx.measureText(txt).width;
  const over = w - ER_AVAIL;
  const ok = over <= 0;
  if (!ok) erBad++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + tag + '（' + txt.length + '字）宽=' + w.toFixed(1)
    + ' 左缘=' + (W / 2 - w / 2).toFixed(1) + '  溢出=' + over.toFixed(1));
}
const cw13 = ctx.measureText('中').width;
console.log('  → 13px 单字宽 ' + cw13.toFixed(2) + 'px，不溢出上限 ≈ ' + Math.floor(ER_AVAIL / cw13) + ' 中文字符');

console.log('\n=== 结论：① 自由输入 ' + (fiBad ? fiBad + ' 例溢出 ❌' : '全绿 ✅')
  + ' / ② Loading ' + (ldBad ? ldBad + ' 例溢出 ❌' : '全绿 ✅')
  + ' / ③ 错误条 ' + (erBad ? erBad + ' 例溢出 ❌' : '全绿 ✅') + ' ===');
