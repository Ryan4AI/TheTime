// 检查 #46 一行修法的**回归面**：加载中（narrative 被清成 ''，但上一轮 options 还在）会不会把旧选项画出来
const fs=require('fs'),path=require('path'),Module=require('module');
const {createCanvas}=require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');
const SRC=process.env.P_SRC;
function makeWx(w,h){const si={windowWidth:w,windowHeight:h,pixelRatio:2,safeArea:{top:0,bottom:h}};return{getSystemInfoSync:()=>si,getWindowInfo:()=>si,onTouchStart(){},onTouchEnd(){},onTouchMove(){},createInput(){},showKeyboard:o=>{o&&o.success&&setTimeout(()=>o.success({}),0)},hideKeyboard(){},onKeyboardInput(){},offKeyboardInput(){},onKeyboardConfirm(){},offKeyboardConfirm(){},onKeyboardComplete(){},onKeyboardHeightChange(){},offKeyboardHeightChange(){},createInnerAudioContext:()=>({onEnded(){},play(){},stop(){},destroy(){}}),setStorageSync(){},getStorageSync:k=>(k==='lives'?[]:'probe-openid'),showToast(){},cloud:{init(){},callFunction(){}},request(){},getMenuButtonBoundingClientRect:()=>({top:0,height:32,width:87,right:w-7}),getFileSystemManager:()=>({}),onWindowResize(){},offWindowResize(){},getDeviceInfo:()=>({}),getAppBaseInfo:()=>({}),getSystemSetting:()=>({})}}
const HOOK=`module.exports.__t={initLayout,render:()=>render(global.__ctx),setState:s=>{state=s},setItems:a=>{currentItems=a},setTyping:(n,c,s)=>{narrative=n;displayedChars=c;displayStartTime=s},setOpts:(a,t)=>{options=a;optionsAppearTime=t},setLoading:v=>{loading=v},setAlive:v=>{alive=v},getLayout:()=>layout,getOptions:()=>options};`;
function load(w,h){global.wx=makeWx(w,h);global.createCanvas=createCanvas;const m=new Module('g'+Date.now(),null);m.filename=SRC;m.paths=Module._nodeModulePaths(path.dirname(SRC));m._compile(fs.readFileSync(SRC,'utf8')+HOOK,SRC);return m.exports.__t}
const T=load(375,812);T.initLayout();
const cv=createCanvas(375,812);
T.setState({dynasty:'五代十国',eraDisplay:'显德五年',year:960,month:5,round:21,name:'李昌',age:39,city:'汴京',occupation:'义军指挥使',social_class:'庶民',items:[],声望:0,财富:0,学识:0,颜值:0,医术:0,战功:0,文采:0,政绩:0,义行:0});
T.setItems([]);T.setAlive(true);
// 场景：callAI 刚清了 narrative=''，但上一轮 options 还没被清（模拟:637-641 那条路径）
T.setLoading(true);
T.setTyping('',0,Date.now());
T.setOpts([{label:'拆开密信',key:'a'},{label:'原样退回',key:'b'},{label:'先找王朴',key:'c'}],Date.now()-5000);
const hits=[];const real=cv.getContext('2d');
global.__ctx=new Proxy(real,{get(t,k){const v=t[k];if(typeof v!=='function')return v;if(k==='fillText')return(s,x,y)=>{hits.push(String(s));return v.call(t,s,x,y)};return v.bind(t)},set(t,k,v){t[k]=v;return true}});
T.render();
const L=T.getLayout();
console.log('  加载中（narrative 空 + 旧 options 残留）：optionFadeIn =',L.optionFadeIn);
console.log('  旧选项是否被画出来 →', hits.some(s=>s==='拆开密信')||hits.some(s=>s==='原样退回') ? '🔴 是（旧选项在 loading 期间重现）':'✅ 否');
console.log('  loading 提示画出 →', hits.some(s=>s.includes('史官正在落笔'))?'✅':'（无）');
console.log('  本帧文字样本：', JSON.stringify(hits.slice(0,10)));
