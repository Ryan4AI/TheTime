// P-163 榜单页 + 序章页几何审查（PMO 2026-09-17 晚班）
//   沿用先生 tmp_p161_openflow.js 的「真实模块 + HOOK 暴露私有 layout」套路（比复刻常量准）
//   覆盖两个从未单审的场景：leaderboard.js / intro.js
//   必须带 CJK 垫片跑：node -r ./scripts/probes/_cjk_shim.js scripts/probes/tmp_p163_board_intro.js
const fs = require('fs'), path = require('path'), Module = require('module');
const https = require('https');
const CP = '/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas';
const { createCanvas } = require(CP);
const BASE = '/home/admin/workspace/TheTime/minigame/scenes/';
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json', 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';

function makeWx(w, h) {
  return {
    getSystemInfoSync: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    getWindowInfo: () => ({ windowWidth: w, windowHeight: h, pixelRatio: 2, safeArea: { top: 0, bottom: h } }),
    onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    createInnerAudioContext: () => ({ onEnded() {}, play() {}, stop() {}, destroy() {} }),
    setStorageSync() {}, getStorageSync: () => 'test-openid', showToast() {}, hideKeyboard() {},
    cloud: { init() {}, callFunction: () => Promise.reject(new Error('no cloud')) },
    getMenuButtonBoundingClientRect: () => ({ top: 0, height: 32, width: 87, right: w - 7 }),
    getFileSystemManager: () => ({}), onWindowResize() {}, offWindowResize() {},
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({}), getSystemSetting: () => ({}), request() {},
  };
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
function getToken() {
  return new Promise((res, rej) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => { const j = JSON.parse(d); j.access_token ? res(j.access_token) : rej(new Error('tok')); });
    }).on('error', rej);
  });
}
function dbQuery(token, query) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({ hostname: 'api.weixin.qq.com', path: `/tcb/databasequery?access_token=${token}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error('parse')); } }); });
    req.on('error', rej); req.write(body); req.end();
  });
}

const SCREENS = [[375, 812], [390, 844], [360, 780], [320, 568], [320, 480]];

(async () => {
  const token = await getToken();
  // 注意：leaderboards 前 20 条是历史空壳 doc（只有 _id），必须取 100 条再过滤
  const lb = await dbQuery(token, `db.collection('leaderboards').limit(100).get()`);
  let nameMax = 0, longestName = '', dynastyMax = 0, longestDyn = '', scoreMax = 0, longestScore = '';
  let boardsWithData = 0;
  if (!lb.errcode && lb.data) {
    for (const s of lb.data) {
      const r = typeof s === 'string' ? JSON.parse(s) : s;
      const chars = r.characters || [];
      if (chars.length) boardsWithData++;
      for (const c of chars) {
        if ((c.name || '').length > nameMax) { nameMax = (c.name || '').length; longestName = c.name; }
        if ((c.dynasty || '').length > dynastyMax) { dynastyMax = (c.dynasty || '').length; longestDyn = c.dynasty; }
        const sc = String(c['综合分'] != null ? c['综合分'] : (c.score != null ? c.score : ''));
        if (sc.length > scoreMax) { scoreMax = sc.length; longestScore = sc; }
      }
    }
  }
  console.log(`真机榜单数据：最长姓名「${longestName}」(${nameMax}字) 最长朝代「${longestDyn}」(${dynastyMax}字) 最长分数「${longestScore}」(${scoreMax}位)\n`);

  // ───── leaderboard.js ─────
  console.log('═══ leaderboard.js（历史名人榜）═══');
  const lbHook = '\nmodule.exports.__L=()=>layout;module.exports.__B=()=>BOARD_LIST;';
  for (const [w, h] of SCREENS) {
    let mod;
    try { mod = loadScene('leaderboard.js', makeWx(w, h), lbHook); mod.init(); } catch (e) { console.log(`${w}x${h} ERR ${e.message}`); continue; }
    const L = mod.__L(), BOARD = mod.__B();
    // Tab：5 列固定 tabW=60 gap=6 起点 padding
    const tabW = 60, tabGap = 6, tabStartX = L.padding;
    const tabsRight = tabStartX + 4 * (tabW + tabGap) + tabW;
    // 行内：排名 padding+20 / 姓名 padding+60 / 朝代 padding+140 / 分数 右对齐 w-padding-20
    const cv = createCanvas(w, h), ctx = cv.getContext('2d');
    ctx.font = '14px sans-serif';
    const nameW = ctx.measureText(longestName).width;
    ctx.font = '11px sans-serif';
    const dynW = ctx.measureText(longestDyn).width;
    ctx.font = '13px sans-serif';
    const scoreW = ctx.measureText(longestScore + '分').width;
    const nameRight = L.padding + 60 + nameW;
    const dynLeft = L.padding + 140;
    const dynRight = dynLeft + dynW;
    const scoreLeft = w - L.padding - 20 - scoreW;
    const tabsFlag = tabsRight > w ? `❌ 出屏 ${(tabsRight - w).toFixed(0)}px` : '✅';
    const nameFlag = nameRight > dynLeft ? `❌ 压朝代 ${(nameRight - dynLeft).toFixed(0)}px` : '✅';
    const scoreFlag = dynRight > scoreLeft ? `❌ 压分数 ${(dynRight - scoreLeft).toFixed(0)}px` : '✅';
    const maxRows = Math.floor((L.btnY - L.contentY - 20) / 36);
    const lastRowBottom = L.contentY + maxRows * 36;
    console.log(`${w}x${h}: Tab 5列右缘=${tabsRight}/${w} ${tabsFlag} | 姓名右=${nameRight.toFixed(0)} 朝代起=${dynLeft} ${nameFlag} | 朝代右=${dynRight.toFixed(0)} 分数左=${scoreLeft.toFixed(0)} ${scoreFlag} | 行数=${maxRows} 末行底=${lastRowBottom} vs 按钮顶=${L.btnY} ${lastRowBottom > L.btnY - 30 ? '⚠️ 靠近底部提示' : '✅'}`);
  }

  // ───── intro.js ─────
  console.log('\n═══ intro.js（序章·命运文字）═══');
  const inHook = '\nmodule.exports.__L=()=>layout;module.exports.__POOL=()=>FATE_POOL;';
  for (const [w, h] of SCREENS) {
    let mod;
    try { mod = loadScene('intro.js', makeWx(w, h), inHook); } catch (e) { console.log(`${w}x${h} load ERR ${e.message}`); continue; }
    const POOL = mod.__POOL ? mod.__POOL() : [];
    let maxLen = 0, longest = '';
    for (const p of POOL) if (p.length > maxLen) { maxLen = p.length; longest = p; }
    const fs2 = Math.min(20, w * 0.052);
    const cv = createCanvas(w, h), ctx = cv.getContext('2d');
    ctx.font = fs2 + 'px sans-serif';
    const tw = ctx.measureText(longest).width;
    const hintFs = Math.min(10, w * 0.026);
    ctx.font = hintFs + 'px sans-serif';
    const hintW = ctx.measureText('✦ 长河漫漫，有些名字永不湮灭').width;
    console.log(`${w}x${h}: 最长命运「${longest}」${maxLen}字 @${fs2.toFixed(1)}px = ${tw.toFixed(0)}px / ${w} ${tw > w ? '❌ 出屏' : '✅'} | 提示「✦ 长河漫漫…」${hintW.toFixed(0)}px ${hintW > w ? '❌ 出屏' : '✅'}`);
  }
})().catch(e => console.error('ERR:', e.message));
