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
// 注意：必须 3 个选项才撑得满（optBlockH 累加 3 个 _h），1-2 个不触发溢出
const T = (base)=>['甲','乙','丙'].map(p=>({label: p + base}));
const S2  = T('卖药');                       // 3×短
const S23 = T('去城南药市卖药材再买些米面回来');   // 3×~15字
const S45 = T('去城南药市把这几日晒好的药材全部卖掉再顺路买些米面回来');  // 3×~28字
const S90 = T('去城南药市把这几日晒好的药材全部卖掉再顺路买些米面回来然后去码头看看有没有南下的船顺便打听一下北边战事的消息'); // 3×~55字
const SEQ = [['短',S2],['中',S23],['长',S45],['超长',S90],['短',S2],['中',S23],['短',S2]];
function frame(opts){
  mod.__t.setOptions(opts);
  mod.__t.sRender();
  return Math.round(mod.__t.getLayout().textH);
}
const trace = SEQ.map(([n,o])=>`${n}=${frame(o)}`);
console.log(`${process.argv[3]||'?'} | textH 轨迹: ${trace.join(' → ')}`);
console.log(`   末帧(短选项) textH=${frame(S2)}`);
