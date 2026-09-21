// 171b 期晚班：llm_io 最新 / narrate_history seq / history_compress / player_life
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b).access_token)); }).on('error',rej));

function dbQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const o = { hostname: 'api.weixin.qq.com', path: `/tcb/databasequery?access_token=${TOKEN}`,
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
const ts = ms => { if(!ms) return '?'; const d = new Date(typeof ms==='number'?ms:ms*1000); return d.toISOString().replace('T',' ').slice(0,16); };

(async () => {
  TOKEN = await getToken();

  console.log('=== llm_io 最新 12 条 (orderBy created_at desc) ===');
  let r = await dbQuery(`db.collection('llm_io').orderBy('created_at','desc').limit(12).get()`);
  for (const x of (r.data||[])) console.log(`  ${ts(x.created_at)} | ${x.category||'-'} | ${x.status||'-'}`);

  console.log('=== llm_io 09-12 之后的记录 ===');
  r = await dbQuery(`db.collection('llm_io').where({created_at: {$gt: 1789228800000}}).orderBy('created_at','desc').limit(60).get()`);
  const recent = r.data||[];
  console.log(`  共 ${recent.length} 条（>= 09-13 起）`);
  const cats = {};
  recent.forEach(x => { const k=(x.category||'?')+'/'+(x.status||'?'); cats[k]=(cats[k]||0)+1; });
  console.log('  ', JSON.stringify(cats));
  for (const x of recent.slice(0,20)) console.log(`  ${ts(x.created_at)} | ${x.category||'-'} | ${x.status||'-'}`);

  console.log('=== narrate_history 最新 seq ===');
  r = await dbQuery(`db.collection('narrate_history').orderBy('seq','desc').limit(6).get()`);
  for (const x of (r.data||[])) console.log(`  seq=${x.seq} | ${x.role||'-'} | openid=${(x.openid||'').slice(-6)} | life=${x.life_number} | ${ts(x.created_at)}`);

  console.log('=== history_compress ===');
  r = await dbQuery(`db.collection('history_compress').orderBy('last_seq','asc').limit(30).get()`);
  for (const x of (r.data||[])) console.log(`  last_seq=${x.last_seq} | openid=${(x.openid||'').slice(-6)} | life=${x.life_number} | ${ts(x.created_at)}`);

  console.log('=== player_life ===');
  r = await dbQuery(`db.collection('player_life').limit(10).get()`);
  for (const x of (r.data||[])) console.log(`  openid=${(x.openid||'').slice(-6)} life=${x.life_number} round=${x.round} alive=${x.alive} is_scoring=${x.is_scoring} age=${x.age} updated=${ts(x.updated_at||x.updatedAt)}`);
})().catch(e => console.error('ERR:', e.message));
