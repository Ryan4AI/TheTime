// P-151-2 布局退化复现：选项区溢出压缩 textH 后，短选项轮次能否恢复
// 预期：修前 → 长选项轮把 textH 砍掉后永久回不来（只减不增）
//       修后 → 每帧先恢复 _textH0，短选项轮 textH 回到初始值
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
const HOOK = '\nmodule.exports.__t={initLayout,sRender:()=>{const cv=createCanvas(375,812);render(cv.getContext("2d"))},setState:s=>{state=s},setNarrative:n=>{narrative=n;displayStartTime=0;displayedChars=(narrative||"").length;},setOptions:o=>{options=o;optionsAppearTime=0;},getLayout:()=>layout};\n';
function load(file){
  const m = new Module('game-probe', null);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  global.createCanvas = createCanvas;
  m._compile(fs.readFileSync(file,'utf8') + HOOK, SRC);
  return m.exports;
}
const target = process.argv[2] || SRC;
const mod = load(target);
const cv = createCanvas(375, 812);
mod.__t.initLayout ? mod.__t.initLayout() : 0;
mod.__t.setState({ name:'测试', gender:'男', age:37, dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, coin:1000,
  '声望':10,'财富':20,'学识':15,'颜值':12,'医术':8,'战功':5,'文采':9,'政绩':6,'义行':11, items:[], round:5 });
mod.__t.setNarrative('测试叙事。');
const LONG = ['去城南药市把这几日晒好的药材全部卖掉再顺路买些米面回来','留在何郎中家里把那部医书剩下的部分抄完','出门去州桥看看有没有什么新的机会'].map(t=>({label:t}));
const SHORT = ['卖药','抄书','出门'].map(t=>({label:t}));
function frame(opts){
  mod.__t.setOptions(opts);
  mod.__t.sRender();
  const L = mod.__t.getLayout();
  return { textH: Math.round(L.textH), optionY: Math.round(L.optionY), itemBarY: L.itemBarY, sceneVisible: L.sceneVisible };
}
const f1 = frame(SHORT);
const f2 = frame(LONG);
const f3 = frame(SHORT);
const f4 = frame(LONG);
const f5 = frame(LONG);
console.log(`${process.argv[3]||'?'} | textH: 短${f1.textH} → 长${f2.textH} → 短${f3.textH} → 长${f4.textH} → 长${f5.textH}`);
console.log(`   选项区 optionY: 短${f1.optionY} / 长${f2.optionY} / 短${f3.optionY}   物品栏顶 ${f1.itemBarY}`);
