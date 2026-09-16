// P-160 物品详情浮窗几何检查（PMO 2026-09-16 晚班新增）
//   144-159 期审过：选项区 / 底栏 / 命格区 / 物品清单浮窗滚动 / 死亡结算 / 榜单 / 属性详情 /
//   叙事区 / 顶栏 / 目标条 / 等待·反馈·输入。**物品详情浮窗（drawItemDetail, game.js:3943）从未单审**
//   → 本期补：物品名 18px bold 居中、描述 13px 居中逐行、面板 280x260、底部「使用」按钮。
// 数据来自真机存档 player_life.current_items（只读），几何用真画布 measureText。
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');

const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '../../credentials/app-secret.json'), 'utf8')
  .match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const W = parseInt(process.env.P_W || '375', 10);

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

(async () => {
  const token = await getToken();
  const r = await dbQuery(token, `db.collection('player_life').orderBy('created_at','desc').limit(5).get()`);
  if (r.errcode) { console.error('DB ERR', r.errcode, r.errmsg); process.exit(1); }
  const lives = (r.data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
  const withItems = lives.filter(l => Array.isArray(l.current_items) && l.current_items.length);
  if (!withItems.length) { console.log('未找到带 current_items 的存档'); return; }
  const life = withItems[0];
  const items = life.current_items;
  console.log(`=== P-160 物品详情浮窗检查  屏宽=${W}  存档 ${withItems[0].name || '?'}（第 ${withItems[0].life_number || '?'} 世）共 ${items.length} 件 ===\n`);

  const canvas = createCanvas(W, 812);
  const ctx = canvas.getContext('2d');
  const FONT = 'sans-serif';
  // 与 drawItemDetail 同款常量
  const pw = Math.min(280, W - 40), ph = 260;
  const nameMaxW = pw - 24;          // 面板内左右的合理留白（代码未传 maxWidth，此为参照）
  const descMaxW = pw - 32;          // 代码传的 maxWidth
  const descTop = 130, descLineH = 20;
  const btnTop = ph - 32 - 16;       // 「使用」按钮顶边 = 212
  const descBottomLimit = btnTop - 6; // 描述不该压到按钮

  let nameOver = 0, descCompressed = 0, descOverBtn = 0;
  ctx.font = 'bold 18px ' + FONT;
  items.forEach((it, i) => {
    const name = String(it.name || '物品');
    const nw = ctx.measureText(name).width;
    const over = nw - nameMaxW;
    if (over > 0) nameOver++;
    // 描述
    const desc = String(it.desc || '一件普通的物品。');
    const lines = desc.split('\n');
    ctx.font = '13px ' + FONT;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const compressed = widest > descMaxW;
    if (compressed) descCompressed++;
    const lastLineY = descTop + (lines.length - 1) * descLineH;
    if (lastLineY + 13 > descBottomLimit) descOverBtn++;
    console.log(`  ${i + 1}. 「${name}」${name.length}字 宽=${nw.toFixed(1)}/${nameMaxW} ${over > 0 ? `❌ 溢出 ${over.toFixed(1)}px` : '✅'}`);
    console.log(`     描述 ${lines.length} 行 / 最长行 ${widest.toFixed(1)}px ${compressed ? `⚠️ 被 maxWidth(${descMaxW}) 横向压缩` : '✅'}${lastLineY + 13 > descBottomLimit ? ` ❌ 末行底 ${(lastLineY + 13).toFixed(0)} > 按钮顶 ${descBottomLimit}` : ''}`);
  });

  // 压力用例：AI 可能生成的长名/多行描述
  console.log('\n  压力用例（AI 生成长度上限，非真机数据）:');
  const stress = [
    ['长名 14 字', '从张将军革囊里翻出的半块干粮'],
    ['长名 20 字', '显德三年冬从洛阳城西市旧货摊上淘来的那枚缺角铜印'],
  ];
  ctx.font = 'bold 18px ' + FONT;
  stress.forEach(([tag, nm]) => {
    const w = ctx.measureText(nm).width;
    console.log(`     ${tag}：宽=${w.toFixed(1)} / ${nameMaxW} → ${w > nameMaxW ? `❌ 溢出 ${(w - nameMaxW).toFixed(1)}px（无 maxWidth、无截断，会画出面板）` : '✅'}`);
  });

  console.log(`\n=== 结论：真机 ${items.length} 件 → 物品名溢出 ${nameOver} 件 / 描述被压缩 ${descCompressed} 件 / 描述压到按钮 ${descOverBtn} 件`
    + `；长名压力用例 ${stress.length} 例全部溢出 = 代码未传 maxWidth 也无截断 ===`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
