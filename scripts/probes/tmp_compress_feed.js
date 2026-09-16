// 压缩修法量化验证（只读 DB，不改任何代码/数据）
// 目的：算出「触发条件改成按间隔后」AI₁ 每轮真实喂量（字符/估算 token）
// 口径：现在 lastSeq=400 / newestSeq=699；修后本轮压到 599，保留 seq 600-699 共 100 条原文 + 1 条摘要
const https = require('https');
const fs = require('fs');
const path = require('path');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '../../credentials/app-secret.json'), 'utf8')
  .match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';

function getToken() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        const j = JSON.parse(d);
        if (j.access_token) resolve(j.access_token); else reject(new Error('token err: ' + d.slice(0, 200)));
      });
    }).on('error', reject);
  });
}

function dbQuery(token, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com',
      path: `/tcb/databasequery?access_token=${token}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('parse: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

const FROM = parseInt(process.env.FROM || '600', 10);
const PAGE = 20;

(async () => {
  const token = await getToken();
  const rows = [];
  let offset = 0;
  while (true) {
    const RANGE = process.env.TO ? `,seq:db.command.lte(${parseInt(process.env.TO,10)})` : '';
    const q = `db.collection('narrate_history').where({seq:db.command.gte(${FROM})${RANGE}}).orderBy('seq','asc').skip(${offset}).limit(${PAGE}).get()`;
    const r = await dbQuery(token, q);
    if (r.errcode) { console.error('ERR', r.errcode, r.errmsg); process.exit(1); }
    // 微信 databasequery 返回的 data 是「JSON 字符串数组」，必须逐项 parse（2026-09-16 踩坑）
    const batch = (r.data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    if (offset > 2000) break;
  }
  rows.sort((a, b) => a.seq - b.seq);
  const byRole = {};
  let total = 0;
  rows.forEach(m => {
    const c = (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')).length;
    byRole[m.role] = (byRole[m.role] || 0) + c;
    total += c;
  });
  const seqs = rows.map(m => m.seq);
  const t = (n) => Math.round(n / 1.43); // 中文粗估：1 token ≈ 1.43 字符（保守）
  console.log(`seq>=${FROM}: 条数=${rows.length}  seq范围=${Math.min(...seqs)}..${Math.max(...seqs)}`);
  console.log('  角色分布:', Object.keys(byRole).map(k => `${k}=${rows.filter(r => r.role === k).length}`).join(' '));
  console.log('  字符合计 =', total, ' 按角色:', JSON.stringify(byRole));
  console.log(`  估算 token ≈ ${t(total)}`);
  const dl = new Date(Math.max(...rows.map(r => r.created_at))).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('  最新一条时间 =', dl);
  if (process.env.VERBOSE) {
    rows.forEach(m => console.log(`    seq=${m.seq} ${m.role} len=${(m.content||'').length}`));
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
