// P-162 身份页（identity.js）信息区几何检查（PMO 2026-09-17 新增）
//   identity.js 从未单审。段 2「古代身份文书」render(identity.js:608-641)：
//     - 小屏(h<540) 紧凑单行：4 段 join(' · ') 居中 fillText，**无 maxWidth、无截断**
//     - 大屏双行：4 段分别居中于 cx ± halfW（halfW = cardW*0.14），**同样无 maxWidth**
//   → 长职业/居所会和相邻段水平重叠、并冲出卡片。本探针用真画布 measureText 量化。
// 数据：真机 player_life（只读）+ 跨世长身份用例
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '../../credentials/app-secret.json'), 'utf8')
  .match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';

function getToken() {
  return new Promise((res, rej) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        const j = JSON.parse(d); j.access_token ? res(j.access_token) : rej(new Error('token: ' + d.slice(0, 120)));
      });
    }).on('error', rej);
  });
}
function dbQuery(token, query) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com', path: `/tcb/databasequery?access_token=${token}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error('parse')); } }); });
    req.on('error', rej); req.write(body); req.end();
  });
}

// ── identity.js:84 calcLayout 复刻 ──
function calcLayout(w, h) {
  const cx = Math.floor(w / 2);
  const cardW = Math.floor(w * 0.88);
  const cardH = Math.min(Math.floor(Math.max(h * 0.62, h * 0.72 - 10)), Math.floor(h * 0.80));
  const cardX = Math.floor(cx - cardW / 2);
  const cardY = Math.floor(h * 0.16);
  const eraS = Math.min(13, Math.floor(w * 0.035));
  const eraY = cardY + Math.floor(cardH * 0.04);
  const infoS = Math.min(14, Math.floor(w * 0.036));
  const infoY = eraY + Math.floor(eraS * 1.8) + 8;
  return { w, h, cx, cardW, cardH, cardX, cardY, eraS, eraY, infoS, infoY, compact: h < 540 };
}

(async () => {
  const token = await getToken();
  const r = await dbQuery(token, `db.collection('player_life').orderBy('created_at','desc').limit(5).get()`);
  if (r.errcode) { console.error('DB ERR', r.errcode, r.errmsg); process.exit(1); }
  const lives = (r.data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
  const real = lives.find(l => l.name && l.occupation) || {};
  console.log(`=== P-162 身份页信息区检查  真机参考：${real.name || '?'}·${real.age || '?'}岁·${real.occupation || '?'}·${real.city || '?'} ===\n`);

  const cases = [
    { label: '真机', name: real.name || '李昌', age: real.age || 39, gender: real.gender === 'female' ? '女' : '男', occ: real.occupation || '渔夫', res: real.city || '汴京' },
    { label: '中等', name: '李昌', age: 39, gender: '男', occ: '义军指挥使', res: '汴京城东' },
    { label: '长身份', name: '欧阳玄机', age: 47, gender: '男', occ: '翰林院侍讲学士', res: '洛阳城西市' },
    { label: '极长', name: '司马嫣然', age: 22, gender: '女', occ: '枢密院承旨兼判吏部', res: '江南东道苏州府' },
  ];
  const screens = [[320, 480], [320, 568], [375, 667], [375, 812], [414, 896]];

  for (const [w, h] of screens) {
    const l = calcLayout(w, h);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.font = l.infoS + 'px sans-serif';
    console.log(`── ${w}x${h}  卡片${l.cardW}x${l.cardH} @x${l.cardX}  infoS=${l.infoS}  模式=${l.compact ? '紧凑单行' : '双行文书'} ──`);
    for (const c of cases) {
      const nameLabel = c.gender === '女' ? '小字' : '姓名';
      if (l.compact) {
        const text = [nameLabel + '：' + c.name, '年齿：' + c.age + '岁', c.occ, c.res].join(' · ');
        const tw = ctx.measureText(text).width;
        const left = l.cx - tw / 2, right = l.cx + tw / 2;
        const over = Math.max(0, -left, right - w);
        const overCard = Math.max(0, l.cardX - left, right - (l.cardX + l.cardW));
        console.log(`   ${c.label.padEnd(4)} 单行 "${text}" 宽${tw.toFixed(0)} [${left.toFixed(0)},${right.toFixed(0)}] ${over > 0 ? `🔴 出屏 ${over.toFixed(0)}px` : (overCard > 0 ? `🟠 出卡片 ${overCard.toFixed(0)}px` : '✅')}`);
      } else {
        const halfW = Math.floor(l.cardW * 0.14);
        const segs = [
          { t: nameLabel + '：' + c.name, cx: l.cx - halfW, row: 1 },
          { t: '年齿：' + c.age + '岁', cx: l.cx + halfW, row: 1 },
          { t: '身份：' + c.occ, cx: l.cx - halfW, row: 2 },
          { t: '居所：' + c.res, cx: l.cx + halfW, row: 2 },
        ].map(s => { const wd = ctx.measureText(s.t).width; return { ...s, wd, left: s.cx - wd / 2, right: s.cx + wd / 2 }; });
        // 同行两段重叠
        const row1Over = segs[0].right - segs[1].left;
        const row2Over = segs[2].right - segs[3].left;
        // 出卡片
        const outCard = Math.max(0, l.cardX - Math.min(...segs.map(s => s.left)), Math.max(...segs.map(s => s.right)) - (l.cardX + l.cardW));
        const outScreen = Math.max(0, -Math.min(...segs.map(s => s.left)), Math.max(...segs.map(s => s.right)) - w);
        const worst = Math.max(row1Over, row2Over);
        const flag = outScreen > 0 ? `🔴 出屏 ${outScreen.toFixed(0)}px` : (worst > 0 ? `🔴 同行重叠 ${worst.toFixed(0)}px` : (outCard > 0 ? `🟠 出卡片 ${outCard.toFixed(0)}px` : '✅ 安全'));
        console.log(`   ${c.label.padEnd(4)} 段宽 ${segs.map(s => s.wd.toFixed(0)).join('/')} 行1重叠${row1Over.toFixed(0)} 行2重叠${row2Over.toFixed(0)} ${flag}`);
      }
    }
    console.log('');
  }
})().catch(e => console.error('ERR:', e.message));
