// PMO 232 期：验证 P-194 score_json_repair 在真实 llm_io 样本上的回归率
const https = require('https');
const fs = require('fs');
const { repairScoreJson } = require('/home/admin/workspace/TheTime/scripts/score_json_repair.js');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json', 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b).access_token)); }).on('error', rej));

function dbQuery(query, isCount) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const o = { hostname: 'api.weixin.qq.com',
      path: `/tcb/${isCount ? 'databasecount' : 'databasequery'}?access_token=${TOKEN}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
    const rq = https.request(o, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try { const j = JSON.parse(d);
        if (Array.isArray(j.data)) j.data = j.data.map(s => { try { return JSON.parse(s) } catch (e) { return null } }).filter(Boolean);
        resolve(j);
      } catch (e) { resolve({ raw: d.slice(0, 300) }); } }); });
    rq.on('error', reject); rq.write(body); rq.end();
  });
}

// 复刻 worker 现有三层解析（严格照 index.js 2412~2440）
function legacyParse(raw0) {
  const raw = String(raw0 || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<aihint>[\s\S]*?<\/aihint>/g, '')
    .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim().replace(/[“”]/g, '"');
  const t = s => { try { return JSON.parse(s) } catch (e) { return null } };
  let p = t(raw);
  if (!p) { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); if (a !== -1 && b !== -1) p = t(raw.substring(a, b + 1)); }
  if (!p && raw.includes(':')) p = t('{' + raw + '}');
  return p;
}

(async () => {
  TOKEN = await getToken();
  const q = "db.collection('llm_io').where({category:'score',status:'success'}).orderBy('created_at','desc').limit(300).get()";
  const r = await dbQuery(q, false);
  const rows = (r.data || []).map(x => ({ _id: x._id, raw_response: (x.output && x.output.raw_response) || x.raw_response })).filter(x => typeof x.raw_response === 'string' && x.raw_response.trim());
  let lo = 0, hi = 0, fixed = [], stillFail = [];
  for (const row of rows) {
    const a = legacyParse(row.raw_response);
    const b = repairScoreJson(row.raw_response);
    if (a) lo++;
    if (b.ok) hi++;
    if (!a && b.ok) fixed.push({ id: row._id, method: b.method, raw: row.raw_response.slice(0, 160) });
    if (!b.ok) stillFail.push({ id: row._id, raw: row.raw_response.slice(0, 160) });
  }
  console.log(`样本 ${rows.length} 条`);
  console.log(`legacy 通过 ${lo} (${(lo / rows.length * 100).toFixed(1)}%) | repair 通过 ${hi} (${(hi / rows.length * 100).toFixed(1)}%)`);
  console.log(`新修复 ${fixed.length} 条:`); fixed.forEach(f => console.log('  ✅', f.method, f.raw.replace(/\n/g, ' ')));
  console.log(`仍失败 ${stillFail.length} 条:`); stillFail.forEach(f => console.log('  ❌', f.raw.replace(/\n/g, ' ')));
  // 安全性：两条链路对已通过样本的「语义一致性」抽查（number 字段是否一致）
  let mismatch = 0;
  for (const row of rows) {
    const a = legacyParse(row.raw_response); if (!a) continue;
    const b = repairScoreJson(row.raw_response); if (!b.ok) { mismatch++; continue; }
    for (const k of ['财富', 'month_delta']) {
      if ((typeof a[k] === 'number') !== (typeof b.value[k] === 'number')) { mismatch++; console.log('  ⚠ 语义差异', k, row._id); break; }
    }
  }
  console.log(`语义差异 ${mismatch} 条（应 0）`);
})();
