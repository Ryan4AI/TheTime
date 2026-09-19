// 168 期早班 DB 校验：llm_io 最新 + error 趋势 + 先生是否玩过 + 压缩/seq 现状
// 沿用 161 期套路：微信云 data = JSON 字符串数组，逐条 parse
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b).access_token)); }).on('error',rej));

function dbQuery(query, isCount) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const o = { hostname: 'api.weixin.qq.com',
      path: `/tcb/${isCount ? 'databasecount' : 'databasequery'}?access_token=${TOKEN}`,
      method: 'POST', headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body) } };
    const rq = https.request(o, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
      try { const j = JSON.parse(d);
        if (Array.isArray(j.data)) j.data = j.data.map(s => { try { return JSON.parse(s) } catch(e){ return {__raw:s.slice(0,120)} } });
        resolve(j);
      } catch(e) { resolve({ raw: d.slice(0,300) }) } }); });
    rq.on('error', reject); rq.write(body); rq.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rows = r => (r && Array.isArray(r.data)) ? r.data : [];
const ts = x => { const t = x.created_at || x.createdAt; if (typeof t === 'number') return t < 1e12 ? t*1000 : t; const p = Date.parse(t); return isNaN(p) ? 0 : p; };
const fmt = ms => ms ? new Date(ms + 8*3600e3).toISOString().replace('T',' ').slice(0,16) : '?';

(async () => {
  TOKEN = await getToken();

  // 1) llm_io 最近 12 条（按 created_at 倒序）
  const r1 = await dbQuery(`db.collection('llm_io').orderBy('created_at','desc').limit(12).get()`);
  console.log('=== llm_io 最新 12 条 ===');
  for (const x of rows(r1)) {
    console.log(`  ${fmt(ts(x))} | ${x.category || x.kind || '?'} | ${x.status} | req=${(x.request_id||'').slice(0,8)} | ${x.error_str ? ('ERR:'+String(x.error_str).slice(0,60)) : ''}`);
  }
  await sleep(150);

  // 2) error 总数 + 最新一条
  const e1 = await dbQuery(`db.collection('llm_io').where({status:'error'}).count()`, true);
  console.log('=== error 总数 ===', e1.count);
  await sleep(150);
  const e2 = await dbQuery(`db.collection('llm_io').where({status:'error'}).orderBy('created_at','desc').limit(2).get()`);
  for (const x of rows(e2)) console.log('  最新 error:', fmt(ts(x)), String(x.error_str||'').slice(0,80));
  await sleep(150);

  // 3) pending 卡轮
  const p1 = await dbQuery(`db.collection('llm_io').where({status:'pending'}).limit(100).get()`);
  const pr = rows(p1);
  const now = Date.now();
  console.log('=== pending ===', pr.length, '| >10min:', pr.filter(x => now - ts(x) > 6e5).length);
  await sleep(150);

  // 4) narrate_history 最新 seq（先生那一世）
  const n1 = await dbQuery(`db.collection('narrate_history').orderBy('seq','desc').limit(3).get()`);
  console.log('=== narrate_history 最新 seq ===');
  for (const x of rows(n1)) console.log(`  seq=${x.seq} ${x.role} openid=${String(x.openid).slice(0,10)} life=${x.life_number} ${fmt(ts(x))}`);
  await sleep(150);

  // 5) history_compress 现状
  const c1 = await dbQuery(`db.collection('history_compress').limit(20).get()`);
  console.log('=== history_compress ===');
  for (const x of rows(c1)) console.log(`  last_seq=${x.last_seq} openid=${String(x.openid).slice(0,10)} life=${x.life_number}`);
  await sleep(150);

  // 6) player_life 最新（先生那世 round/age/alive）
  const l1 = await dbQuery(`db.collection('player_life').orderBy('updated_at','desc').limit(3).get()`);
  console.log('=== player_life 最新 3 ===');
  for (const x of rows(l1)) console.log(`  ${fmt(ts(x))} openid=${String(x.openid).slice(0,10)} life=${x.life_number} round=${x.round} age=${x.age} alive=${x.alive} is_scoring=${x.is_scoring}`);
})().catch(e => console.error('ERR:', e.message));
