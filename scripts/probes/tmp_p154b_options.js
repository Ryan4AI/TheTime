// P-154b 选项区命中区几何检查（PMO 2026-09-15 巡检新增）
//  与 P-154（底栏）配套：把「选项按钮 + 自由输入按钮」的真实 bounds 打出来，
//  查三件事：① 选项之间/与自由输入按钮是否重叠 ② 选项是否被挤出屏幕（底部被物品栏/输入框吞掉）
//  ③ 长选项（>23 字换行）→ 短选项轮回后，选项区是否回到原位（P-151-2 回归）
const fs = require('fs'); const path = require('path'); const Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const wx = { getSystemInfoSync:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:44,bottom:778}}),
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
  setOptions: o => { options = o; optionsAppearTime = 0 },
  setItems: i => { currentItems = i },
  getOptions: () => options,
  getLayout: () => layout,
};
`;
const m = new Module('game-probe', null);
m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
global.createCanvas = createCanvas;
m._compile(fs.readFileSync(SRC,'utf8') + HOOK, SRC);
const T = m.exports.__t;
T.initLayout();
T.setState({ name:'测试', gender:'男', age:37, dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, coin:1000,
  '声望':10,'财富':20,'学识':15,'颜值':12,'医术':8,'战功':5,'文采':9,'政绩':6,'义行':11, items:[], round:5 });
T.setNarrative('测试叙事。');
T.setItems([]);
const cv = createCanvas(375, 812);

const LONG = '你决定先跟着这支商队在镇上盘桓几日，顺便打听清楚梅岭隘口的盘查到底有多严，再决定是翻山还是走水路';
const SETS = {
  '3 短': ['跟他走', '回客栈', '去茶摊'],
  '3 长': [LONG, LONG.slice(0, 40), LONG.slice(0, 45)],
  '2 短 1 长': ['跟他走', '回客栈', LONG],
};

function draw(labels) {
  T.setOptions(labels.map((l, i) => ({ key: 'k' + i, label: l, bounds: null })));
  T.render(cv);
  return T.getOptions();
}
function report(name, opts) {
  const L = T.getLayout();
  const free = L._freeInputBtn;
  const bottomLimit = L.windowH - L.itemBarH;   // 物品栏顶边：选项不应越过这里
  const rows = opts.map((o, i) => {
    const b = o.bounds;
    if (!b) return `     选项${i}: 无 bounds（未绘制？）`;
    return `     选项${i} y=${b.y.toFixed(0)}..${(b.y + b.h).toFixed(0)} x=${b.x.toFixed(0)}..${(b.x + b.w).toFixed(0)} h=${b.h.toFixed(0)} 「${(o.label || '').slice(0, 12)}…」`;
  });
  const issues = [];
  for (let i = 0; i < opts.length; i++) {
    const a = opts[i].bounds; if (!a) continue;
    if (a.y + a.h > bottomLimit + 1) issues.push(`选项${i} 底部 ${(a.y + a.h).toFixed(0)} 越过物品栏顶边 ${bottomLimit.toFixed(0)}（被吞 ${(a.y + a.h - bottomLimit).toFixed(0)}px）`);
    for (let j = i + 1; j < opts.length; j++) {
      const b = opts[j].bounds; if (!b) continue;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        issues.push(`选项${i} 与 选项${j} 重叠`);
    }
    if (free && a.x < free.x + free.w && free.x < a.x + a.w && a.y < free.y + free.h && free.y < a.y + a.h)
      issues.push(`选项${i} 与 自由输入按钮 重叠`);
  }
  console.log(`\n  【${name}】optionY=${L.optionY.toFixed(0)} textH=${L.textH.toFixed(0)} 输入框/自由按钮 y=${free ? free.y.toFixed(0) + '..' + (free.y + free.h).toFixed(0) : '无'}`);
  rows.forEach(r => console.log(r));
  console.log(issues.length ? '     ⚠️ ' + issues.join('；') : '     ✅ 无重叠、未被吞');
  return opts.map(o => o.bounds && o.bounds.y);
}

console.log('【P-154b 选项区命中区几何检查】375×812 / 物品栏顶边 =', (T.getLayout().windowH - T.getLayout().itemBarH).toFixed(0));
const first = report('3 短', draw(SETS['3 短']));
report('3 长', draw(SETS['3 长']));
const back = report('回到 3 短（P-151-2 回归）', draw(SETS['3 短']));
report('2 短 1 长', draw(SETS['2 短 1 长']));

const same = first.length === back.length && first.every((v, i) => v != null && back[i] != null && Math.abs(v - back[i]) < 1);
console.log(`\nP-151-2 回归：长选项轮回后选项区 y ${same ? '完全恢复 ✅' : '未恢复 ⚠️（' + JSON.stringify(first) + ' → ' + JSON.stringify(back) + '）'}`);
