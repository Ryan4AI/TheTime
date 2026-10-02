// PMO 193：loading 期待感改造 —— 真实 game.js 渲染出图（375x812，裁叙事区）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas, GlobalFonts } = require(CP);
try { GlobalFonts.registerFromPath('/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', 'STKaiti'); } catch(e){ console.log('font', e.message); }
const SRC = '/home/admin/workspace/TheTime/minigame/scenes/game.js';
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
  getLayout: () => layout,
  setNarrative: n => { narrative = n },
  setLoadingAt: (ms, txt) => { loading = true; loadingStart = Date.now() - ms; loadingText = txt || '史官正在落笔…' },
};
`;
const w = 375, h = 812;
global.wx = makeWx(w, h); global.createCanvas = createCanvas;
const m = new Module('game-render', null); m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
m._compile(fs.readFileSync(SRC, 'utf8') + HOOK, SRC);
const T = m.exports.__t; T.initLayout();
const src = createCanvas(w, h); global.__ctx = src.getContext('2d');
T.setState({ dynasty: '后周', eraDisplay: '显德五年', year: 960, month: 5, items: [], round: 5,
  name: '仆固怀恩', age: 24, city: '开封', occupation: '禁军', social_class: '军户' });
T.setNarrative('');
const stages = [[400,''],[1400,''],[2600,''],[3800,'']];
const RH = 96, TOP = 36;
const out = createCanvas(w*2, (TOP + stages.length*RH)*2); const o = out.getContext('2d'); o.scale(2,2);
o.fillStyle = '#241c15'; o.fillRect(0,0,w, TOP + stages.length*RH);
o.fillStyle = 'rgba(245,239,224,0.6)'; o.font = '13px "STKaiti"';
o.fillText('真实游戏渲染（375×812 截图·裁叙事区）· loading 期待感', 16, 22);
stages.forEach(([ms, txt], i) => {
  T.setLoadingAt(ms, txt);
  T.render();
  const y = TOP + i*RH;
  o.drawImage(src, 0, 128, w, 92, 0, y, w, 92);
  o.fillStyle = 'rgba(232,200,130,0.9)'; o.font = '11px "STKaiti"';
  o.textAlign = 'right'; o.fillText('T+' + (ms/1000).toFixed(1) + 's', w-14, y-4); o.textAlign = 'left';
});
fs.writeFileSync('/tmp/loading_real.png', out.toBuffer('image/png'));
console.log('OK /tmp/loading_real.png');
