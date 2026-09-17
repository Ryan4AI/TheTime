// P-155 顶栏 + 榜单目标条 文本几何检查（PMO 2026-09-15 155 期巡检新增）
//  此前 144-154 期审过：选项区 / 底栏(命格·物品格·飘字) / 物品清单浮窗 / 死亡结算 / 榜单弹窗 / 属性详情 /
//  叙事区高度回归。**顶栏（drawSealTopBar）+ 榜单目标条（drawBoardTarget）从未单独审过** → 本期补。
//  查三件事：
//   ① 顶栏两行文字（朝代·年月 / 姓名·年龄·居所·身份·阶层）会不会超出屏幕右缘被裁
//   ② 目标条左侧「🏆榜名」与居中「还差N分超越X」会不会重叠
//   ③ 顶栏不透明背景高度是否覆盖住目标条（否则内容上移会从缝里透出）
const fs = require('fs'); const path = require('path'); const Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const WIDTH = parseInt(process.env.P_W || '375', 10);
const wx = { getSystemInfoSync:()=>({windowWidth:WIDTH,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}}),
  onTouchStart(){},onTouchEnd(){},onTouchMove(){},offKeyboardHeightChange(){},onKeyboardHeightChange(){},
  cloud:{init(){},callFunction:()=>{}},setStorageSync(){},getStorageSync:()=>null,showToast(){},request(){},
  getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44}}),
  getDeviceInfo:()=>({}),getAppBaseInfo:()=>({}),getSystemSetting:()=>({}),onWindowResize(){},offWindowResize(){},
  getMenuButtonBoundingClientRect:()=>({top:44,height:32,width:87,right:322}),createInnerAudioContext:()=>({}),
  hideKeyboard(){},getFileSystemManager:()=>({}) };
global.wx = wx;
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
const HOOK = `
module.exports.__t = {
  initLayout,
  render: (cv)=>render(cv.getContext('2d')),
  setState: s => { state = s },
  setNarrative: n => { narrative = n; displayStartTime = 0; displayedChars = (narrative||'').length },
  setBoard: b => { closestBoardInfo = b },
  getLayout: () => layout,
};
`;
const m = new Module('game-probe', null);
m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
global.createCanvas = createCanvas;
m._compile(fs.readFileSync(SRC,'utf8') + HOOK, SRC);
const T = m.exports.__t;
T.initLayout();
T.setNarrative('测试。');
const cv = createCanvas(WIDTH, 812);
const ctx = cv.getContext('2d');

const SEASON = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
const KAI = '"STKaiti", "KaiTi", "楷体", sans-serif';

function run(state, board, tag) {
  T.setState(Object.assign({ dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, items:[], round:5 }, state));
  T.setBoard(board);
  T.render(cv);
  const L = T.getLayout();
  const padding = L.padding, safeTop = L.safeTop || 0, topH = L.topBarH;
  const sealCenterX = padding + 14, textX = sealCenterX + 32;
  const sealCenterY = safeTop + topH / 2;

  // 顶栏上行：bold 13px
  ctx.save();
  ctx.font = 'bold 13px ' + KAI;
  const line1 = (state.eraDisplay || (state.dynasty + ' ' + state.year + '年')) + ' · ' + SEASON[(state.month||1)-1];
  const w1 = ctx.measureText(line1).width;
  // 顶栏下行：11px
  ctx.font = '11px ' + KAI;
  const addInfo = [state.city_name || state.city || '', state.occupation || '', state.social_class || ''].filter(Boolean).join(' · ');
  const line2 = state.name + ' · ' + state.age + '岁' + (addInfo ? ' · ' + addInfo : '');
  const w2 = ctx.measureText(line2).width;

  // 目标条：左 10px bold / 中 9px（居中）
  const bt = L._boardTargetArea;
  const bw = bt.w, bcx = bt.x + bw / 2;
  ctx.font = 'bold 10px ' + KAI;
  const leftTxt = '🏆 ' + board.name;
  const wl = ctx.measureText(leftTxt).width;
  ctx.font = '9px ' + KAI;
  let midTxt;
  midTxt = board.on ? '已上榜 · 点击查看排名'
    : (board.targetPerson ? '还差' + board.diff + '分超越' + board.targetPerson + '，登上' + board.name
                          : '还差' + board.diff + '分登上' + board.name);
  const wm = ctx.measureText(midTxt).width;
  ctx.restore();

  const r1 = textX + w1, r2 = textX + w2;
  const leftRight = bt.x + 6 + wl, midLeft = bcx - wm / 2, midRight = bcx + wm / 2;
  const bgBottom = safeTop + topH + (L.boardTargetH || 0) + 4;
  return {
    tag: tag,
    W: L.windowW,
    l1: { text: line1, right: +r1.toFixed(1), over: +(r1 - L.windowW).toFixed(1) },
    l2: { text: line2, right: +r2.toFixed(1), over: +(r2 - L.windowW).toFixed(1) },
    board: { leftRight: +leftRight.toFixed(1), midLeft: +midLeft.toFixed(1), midRight: +midRight.toFixed(1),
             gap: +(midLeft - leftRight).toFixed(1), midOver: +(midRight - (bt.x + bw)).toFixed(1) },
    bgBottom: +bgBottom.toFixed(1), targetBottom: +(bt.y + bt.h).toFixed(1),
    bgCoversTarget: bgBottom >= bt.y + bt.h,
  };
}

const CASES = [
  // 基线（探针默认）
  { _tag:'① 基线（李昌 3 字名 / 短身份）',
    state:{ name:'李昌', age:32, city_name:'长安', occupation:'铁匠', social_class:'庶民', eraDisplay:'显德五年', month:5 },
    board:{ name:'名医榜', diff:148, on:false, targetPerson:'孙思邈' } },
  // 真机 11 件那局的极端：长身份 + 长居所
  { _tag:'② 长身份（翰林院侍讲学士 / 4 字名）',
    state:{ name:'欧阳玄机', age:47, city_name:'洛阳城西市', occupation:'翰林院侍讲学士', social_class:'士族', eraDisplay:'北宋 元丰八年', month:12 },
    board:{ name:'名医榜', diff:148, on:false, targetPerson:'孙思邈' } },
  // 目标条：长榜名 + 长目标人 + 4 位差分
  { _tag:'③ 目标条长文案（能臣榜 / 宇文成都 / 1483 分）',
    state:{ name:'李昌', age:32, city_name:'长安', occupation:'铁匠', social_class:'庶民', eraDisplay:'显德五年', month:5 },
    board:{ name:'能臣异士榜', diff:1483, on:false, targetPerson:'宇文成都' } },
  // 已上榜态
  { _tag:'④ 已上榜态',
    state:{ name:'李昌', age:32, city_name:'长安', occupation:'铁匠', social_class:'庶民', eraDisplay:'显德五年', month:5 },
    board:{ name:'名医榜', diff:0, on:true } },
];

console.log('=== P-155 顶栏 / 目标条 文本几何 === 屏宽 ' + WIDTH);
let bad = 0;
for (const c of CASES) {
  const r = run(c.state, c.board, c._tag);
  console.log('\n' + r.tag);
  console.log('  上行 13px  "' + r.l1.text + '"  右缘=' + r.l1.right + ' / 屏宽' + r.W + '  溢出=' + r.l1.over + (r.l1.over > 0 ? '  ❌ 被裁' : '  ✅'));
  console.log('  下行 11px  "' + r.l2.text + '"  右缘=' + r.l2.right + '  溢出=' + r.l2.over + (r.l2.over > 0 ? '  ❌ 被裁' : '  ✅'));
  console.log('  目标条  左文右缘=' + r.board.leftRight + '  中文左缘=' + r.board.midLeft + '  间隙=' + r.board.gap
    + (r.board.gap < 0 ? '  ❌ 重叠' : '  ✅') + '  中文右溢出=' + r.board.midOver + (r.board.midOver > 0 ? '  ❌' : '  ✅'));
  console.log('  顶栏背景底=' + r.bgBottom + '  目标条底=' + r.targetBottom + '  覆盖=' + (r.bgCoversTarget ? '✅' : '❌ 缝隙透出'));
  if (r.l1.over > 0 || r.l2.over > 0 || r.board.gap < 0 || r.board.midOver > 0 || !r.bgCoversTarget) bad++;
}
console.log('\n问题用例数 = ' + bad + ' / ' + CASES.length);
