// PMO 158 期 · ② UX A 类：开局四页几何审查（真实模块 + 注入 HOOK 暴露私有 layout）
const fs = require('fs'), path = require('path'), Module = require('module');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const BASE = '/home/admin/workspace/TheTime/minigame/scenes/';

function makeWx(w, h) {
  return { getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    getWindowInfo: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    onTouchStart(){}, onTouchEnd(){}, onTouchMove(){}, onKeyboardHeightChange(){}, offKeyboardHeightChange(){},
    createInnerAudioContext: () => ({ onEnded(){}, play(){}, stop(){}, destroy(){} }),
    setStorageSync(){}, getStorageSync: () => 'test-openid', showToast(){}, hideKeyboard(){},
    cloud: { init(){}, callFunction(){} },
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize(){}, offWindowResize(){}, getDeviceInfo: () => ({}),
    getAppBaseInfo: () => ({}), getSystemSetting: () => ({}), request(){} };
}
global.createCanvas = createCanvas;
function loadScene(name, wxstub, hookSrc) {
  global.wx = wxstub;
  const file = BASE + name;
  const m = new Module(name, null);
  m.filename = file; m.paths = Module._nodeModulePaths(BASE);
  m._compile(fs.readFileSync(file, 'utf8') + '\n' + hookSrc, file);
  return m.exports;
}
const ov = (a, b) => { const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return ox > 0 && oy > 0 ? { ox: Math.round(ox), oy: Math.round(oy) } : null; };
const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];

console.log('═══ selection.js（选随身之物）═══');
const selHook = '\nmodule.exports.__L=()=>layout;';
for (const [w, h] of SCREENS) {
  let mod;
  try { mod = loadScene('selection.js', makeWx(w, h), selHook); mod.init(); } catch (e) { console.log(`${w}x${h} init ERR ${e.message}`); continue; }
  const L = mod.__L();
  const cv = createCanvas(w, h), ctx = cv.getContext('2d');
  try { mod.render(ctx); } catch (e) { console.log(`${w}x${h} render ERR ${e.message}`); }
  const cards = { x: L.gap, y: L.gridTop, w: L.cardW * 2 + L.gap, h: L.cardBottomH || (L.cardH + L.vGap) * 5 - L.vGap };
  const cardBottom = L.gridTop + (L.cardH + L.vGap) * 5 - L.vGap;
  const gender = { x: Math.floor(L.cx - (L.genderPillW * 3 + L.genderPillGap * 2) / 2), y: L.genderOptY, w: L.genderPillW * 3 + L.genderPillGap * 2, h: L.genderRowH };
  const btn = { x: Math.floor(L.cx - L.btnW / 2), y: L.btnY, w: L.btnW, h: L.btnH };
  const o1 = ov(gender, btn), o2 = ov(gender, { x: L.gap, y: L.gridTop, w: L.cardW * 2 + L.gap, h: cardBottom - L.gridTop });
  const descY = btn.y + btn.h + 14, hintY = btn.y + btn.h + 30;
  console.log(`${w}x${h}: cardBottom=${cardBottom} genderY=${L.genderOptY}-${L.genderOptY + L.genderRowH} btnY=${L.btnY}-${L.btnY + L.btnH} | 性别×按钮重叠=${o1 ? JSON.stringify(o1) : '无'} 性别×卡片重叠=${o2 ? JSON.stringify(o2) : '无'} | desc(已选N)底=${descY + 5} vs h=${h} | 名人提示底=${hintY + 5} vs h=${h}`);
}

console.log('\n═══ entry.js（入口页）═══');
const entryHook = '\nmodule.exports.__L=()=>layout;';
for (const [w, h] of SCREENS) {
  let mod;
  try { mod = loadScene('entry.js', makeWx(w, h), entryHook); mod.init(); } catch (e) { console.log(`${w}x${h} init ERR ${e.message}`); continue; }
  const L = mod.__L();
  const cv = createCanvas(w, h), ctx = cv.getContext('2d');
  try { mod.render(ctx); } catch (e) { console.log(`${w}x${h} render ERR ${e.message}`); }
  const footerY = h - (L.footerS ? 36 : 36);
  const b3 = { x: L.btnX, y: L.btnY3, w: L.btnW, h: L.btnH };
  console.log(`${w}x${h}: btn1=${L.btnY1} btn2=${L.btnY2} btn3=${L.btnY3}-${L.btnY3 + L.btnH} | 页脚 y≈${footerY} | btn3×页脚重叠=${ov(b3, { x: 0, y: footerY - 8, w, h: 16 }) ? 'YES' : '无'} | btn3底=${L.btnY3 + L.btnH} vs h=${h}${L.btnY3 + L.btnH > h ? ' ❌出屏' : ''}`);
}

console.log('\n═══ identity.js（身份卡）═══');
const idHook = '\nmodule.exports.__L=()=>layout;';
for (const [w, h] of SCREENS) {
  let mod;
  try { mod = loadScene('identity.js', makeWx(w, h), idHook); } catch (e) { console.log(`${w}x${h} load ERR ${e.message}`); continue; }
  try { mod.init({ name: '测试', gender: '男', age: 37, occupation: '郎中', socialClass: '寒门', dynasty: '后周', city: '开封', year: 960, lifespan: 70 }, [], null); } catch (e) { console.log(`${w}x${h} init ERR ${e.message}`); continue; }
  const L = mod.__L ? mod.__L() : null;
  const cv = createCanvas(w, h), ctx = cv.getContext('2d');
  try { mod.render(ctx); } catch (e) { console.log(`${w}x${h} render ERR ${e.message}`); }
  if (L) {
    const cardBot = L.cardY + L.cardH, btnBot = L.btnY + L.btnH;
    const radarBot = L.radarCY + L.radarR + L.labelDist;
    const poemBot = L.poemY + L.poemS;
    const tailBot = L.tailY + L.tailS;
    console.log(`${w}x${h}: 卡片 ${L.cardY}-${cardBot} 雷达底 ${Math.round(radarBot)} 诗词底 ${poemBot} 尾注底 ${tailBot} 按钮 ${L.btnY}-${btnBot} | 卡片出屏=${cardBot > h ? 'YES❌' : '无'} 按钮出屏=${btnBot > h ? 'YES❌' : '无'} 雷达压按钮=${radarBot > L.btnY ? 'YES❌' : '无'}`);
  } else console.log(`${w}x${h}: layout 未暴露 | render OK`);
}
