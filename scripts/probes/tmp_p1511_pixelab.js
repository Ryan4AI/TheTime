// P-151-1 像素级 A/B：死亡淡出遮罩是否可见
// 做法：同一 layout 下渲染 fadeOut=null 与 fadeOut p=0.5 两帧，数差异像素
//   修复前：遮罩画在 drawBackground 之前 → 被全屏不透明渐变盖掉 → 差异≈0（淡出不可见）
//   修复后：遮罩画在末尾 → 全屏压暗 → 差异≈全屏
const fs = require('fs'); const Module = require('module');
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
function load(file){
  const m = new Module('game-probe', null);
  m.filename = file; m.paths = Module._nodeModulePaths(require('path').dirname(file));
  m._compile(fs.readFileSync(file,'utf8') + '\nmodule.exports.__t={initLayout,setState:s=>{state=s},setNarrative:n=>{narrative=n;displayStartTime=0;},setFade:f=>{fadeOut=f},getAutoNext:()=>module.exports.autoNext};\n', SRC);
  return m.exports;
}
function shoot(mod, fade){
  const cv = createCanvas(375, 812); const ctx = cv.getContext('2d');
  mod.__t.initLayout();
  mod.__t.setState({ name:'测试', gender:'男', age:37, dynasty:'后周', eraDisplay:'显德五年', year:960, month:5, coin:1000,
    '声望':10,'财富':20,'学识':15,'颜值':12,'医术':8,'战功':5,'文采':9,'政绩':6,'义行':11, items:[], round:5 });
  mod.__t.setNarrative('这是一段测试叙事文本，用于像素级 A/B 验证淡出遮罩是否可见。');
  mod.__t.setFade(fade);
  try { mod.render(ctx); } catch(e){ return {err:e.message}; }
  return { data: ctx.getImageData(0,0,375,812).data, buf: Buffer.from(ctx.getImageData(0,0,375,812).data) };
}
function diff(a,b){ if(!a||!b||a.err||b.err) return -1; let n=0; for(let i=0;i<a.data.length;i+=4){ if(Math.abs(a.data[i]-b.data[i])>2||Math.abs(a.data[i+1]-b.data[i+1])>2||Math.abs(a.data[i+2]-b.data[i+2])>2) n++; } return n; }
const target = process.argv[2] || SRC;
const mod = load(target);
const A = shoot(mod, null);
const OFF = parseInt(process.argv[4]||'750',10);
const B = shoot(mod, { start: Date.now()-OFF, duration: 1500 }); // p=OFF/1500
if (A.err||B.err) { console.log('RENDER ERR:', (A.err||B.err).slice(0,300)); process.exit(1); }
const d = diff(A,B);
console.log(`${process.argv[3]||'?'} | 差异像素 ${d} / ${375*812} (${(d/(375*812)*100).toFixed(1)}%) | autoNext=${JSON.stringify(mod.__t.getAutoNext())?.slice(0,40)}`);
