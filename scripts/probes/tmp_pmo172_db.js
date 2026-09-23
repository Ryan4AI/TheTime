// 170 期巡检 DB 校验（沿用 168 套路）
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
const C = async (name, where) => {
  const q = where ? `db.collection('${name}').where(${JSON.stringify(where)}).count()` : `db.collection('${name}').count()`;
  const r = await dbQuery(q, true); await sleep(120); return r.count;
};

(async () => {
  TOKEN = await getToken();
  console.log('=== 5 基础表 ===');
  for (const t of ['era_meta','era_cities','era_age_dist','social_structure','event'])
    console.log(`  ${t} = ${await C(t)}`);
  console.log('=== D049 运行时四表 ===');
  for (const t of ['player','player_life','narrate_history','llm_io'])
    console.log(`  ${t} = ${await C(t)}`);
  await sleep(150);

  const p = rows(await dbQuery(`db.collection('llm_io').where({status:'pending'}).limit(100).get()`)); await sleep(150);
  const now = Date.now();
  console.log(`=== pending = ${p.length} | >10min = ${p.filter(x => now - ts(x) > 6e5).length} ===`);

  const d = await dbQuery(`db.collection('narrate_history').where({content:{$exists:false}}).count()`, true); await sleep(150);
  console.log(`=== narrate_history 缺顶层 content = ${d.count} ===`);
  const d2 = await dbQuery(`db.collection('narrate_history').where({content:null}).count()`, true); await sleep(150);
  console.log(`=== narrate_history content=null = ${d2.count} ===`);

  const n1 = rows(await dbQuery(`db.collection('narrate_history').orderBy('seq','desc').limit(3).get()`)); await sleep(150);
  console.log('=== narrate_history 最新 seq ===');
  for (const x of n1) console.log(`  seq=${x.seq} ${x.role} openid=${String(x.openid).slice(0,10)} life=${x.life_number} ${fmt(ts(x))}`);

  const l1 = rows(await dbQuery(`db.collection('llm_io').orderBy('created_at','desc').limit(5).get()`)); await sleep(150);
  console.log('=== llm_io 最新 5 ===');
  for (const x of l1) console.log(`  ${fmt(ts(x))} | ${x.status} | ${String(x.error_str||'').slice(0,50)}`);

  const c1 = rows(await dbQuery(`db.collection('history_compress').limit(20).get()`)); await sleep(150);
  console.log('=== history_compress ===');
  for (const x of c1) console.log(`  last_seq=${x.last_seq} life=${x.life_number}`);

  const pl = rows(await dbQuery(`db.collection('player_life').orderBy('updated_at','desc').limit(3).get()`)); await sleep(150);
  console.log('=== player_life 最新 3 ===');
  for (const x of pl) console.log(`  ${fmt(ts(x))} life=${x.life_number} round=${x.round} age=${x.age} alive=${x.alive}`);

  const e1 = await dbQuery(`db.collection('llm_io').where({status:'error'}).count()`, true); await sleep(150);
  const f1 = await dbQuery(`db.collection('llm_io').where({status:'options_fallback'}).count()`, true); await sleep(150);
  console.log(`=== llm_io error=${e1.count} options_fallback=${f1.count} ===`);
})().catch(e => console.error('ERR:', e.message));
