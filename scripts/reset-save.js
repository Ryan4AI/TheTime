#!/usr/bin/env node
/**
 * 清档：备份 + 删除指定 openid 的游戏存档
 * 用法: node scripts/reset-save.js <openid> [--dry]
 * 安全：delete 前必定全量备份 4 张表到 backups/
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '..', 'credentials', 'app-secret.json'), 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const OPENID = process.argv[2];
const DRY = process.argv.includes('--dry');
const TABLES = ['player', 'player_life', 'narrate_history', 'history_compress'];

function getToken() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error(d.slice(0, 200))); });
    }).on('error', reject);
  });
}
let TOKEN;
function call(ep, q) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query: q });
    const req = https.request({ hostname: 'api.weixin.qq.com', path: `/tcb/${ep}?access_token=${TOKEN}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d.slice(0, 300) }); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
const parseDocs = r => (r.data || []).map(d => (typeof d === 'string' ? JSON.parse(d) : d));
const ts = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

(async () => {
  if (!OPENID) { console.error('用法: node scripts/reset-save.js <openid> [--dry]'); process.exit(1); }
  TOKEN = await getToken();

  // 1) 全量备份 4 张表（分页）
  const backup = {};
  for (const t of TABLES) {
    let all = [], off = 0;
    while (true) {
      const r = await call('databasequery', `db.collection('${t}').skip(${off}).limit(1000).get()`);
      if (r.errcode) { console.error(`查询 ${t} 失败`, r.errcode, r.errmsg); break; }
      const docs = parseDocs(r);
      all = all.concat(docs);
      if (docs.length < 1000) break;
      off += 1000;
    }
    backup[t] = all;
    console.log(`📦 ${t}: ${all.length} 条`);
  }
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `save-full-${ts()}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`💾 全量备份: ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);

  if (DRY) { console.log('（--dry 模式，不删除）'); return; }

  // 2) 删除目标 openid
  console.log(`\n🗑️  删除 openid = ${OPENID}`);
  for (const t of TABLES) {
    const where = (t === 'player') ? `{_id:'${OPENID}'}` : `{openid:'${OPENID}'}`;
    const before = await call('databasecount', `db.collection('${t}').where(${where}).count()`);
    const r = await call('databasedelete', `db.collection('${t}').where(${where}).remove()`);
    const after = await call('databasecount', `db.collection('${t}').where(${where}).count()`);
    console.log(`   ${t}: 删前 ${before.count} → 删后 ${after.count}  (${r.errcode ? 'ERR ' + r.errcode + ' ' + r.errmsg : 'ok'})`);
  }

  // 3) 剩余总览
  console.log('\n剩余总览:');
  for (const t of TABLES) {
    const c = await call('databasecount', `db.collection('${t}').count()`);
    console.log(`   ${t} = ${c.count}`);
  }
})().catch(e => { console.error('❌', e.message || e); process.exit(1); });
