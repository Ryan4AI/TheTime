// 247 期巡检：只读
 
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('credentials/app-secret.json', 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';

function getToken() {
  return new Promise((res, rej) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        const j = JSON.parse(d); j.access_token ? res(j.access_token) : rej(d.slice(0, 200));
      });
    }).on('error', rej);
  });
}
async function q(query, isCount) {
  const token = await getToken();
  return new Promise((res, rej) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com',
      path: `/tcb/${isCount ? 'databasecount' : 'databasequery'}?access_token=${token}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(d.slice(0, 200)); } }); });
    req.on('error', rej); req.write(body); req.end();
  });
}
(async () => {
  const tables = ['era_meta','era_cities','era_age_dist','social_structure','event','player','player_life','narrate_history','llm_io'];
  for (const t of tables) {
    const r = await q(`db.collection('${t}').count()`, true).catch(e => ({ err: String(e) }));
    console.log(`${t} = ${r.count !== undefined ? r.count : JSON.stringify(r).slice(0,120)}`);
  }
  // llm_io 明细
  const det = {
    'llm_io pending': `db.collection('llm_io').where({status:'pending'}).count()`,
    'llm_io error': `db.collection('llm_io').where({status:'error'}).count()`,
    'llm_io ok': `db.collection('llm_io').where({status:'ok'}).count()`,
    'cat=options_fallback': `db.collection('llm_io').where({category:'options_fallback'}).count()`,
    'cat=history_compress': `db.collection('llm_io').where({category:'history_compress'}).count()`,
  };
  for (const [k,v] of Object.entries(det)) {
    const r = await q(v, true).catch(e => ({ err: String(e) }));
    console.log(`${k} = ${r.count !== undefined ? r.count : JSON.stringify(r).slice(0,120)}`);
  }
  // 最新记录
  const latest = await q(`db.collection('narrate_history').orderBy('seq','desc').limit(3).get()`, false).catch(e=>({err:String(e)}));
  if (latest && latest.data) for (const d of latest.data) console.log(`narrate seq=${d.seq} role=${d.role} len=${typeof d.content==='string'?d.content.length:'NONSTR'} t=${d.created_at||d._ts||''}`);
  else console.log('narrate latest ERR', JSON.stringify(latest).slice(0,200));
  // 脏数据
  const dirty1 = await q(`db.collection('narrate_history').where({content:null}).count()`, true).catch(e=>({err:String(e)}));
  console.log('dirty content=null =', dirty1.count);
  // player_life
  const pl = await q(`db.collection('player_life').limit(3).get()`, false).catch(e=>({err:String(e)}));
  if (pl && pl.data) for (const d of pl.data) console.log(`player_life life=${d.life_number} round=${d.round} age=${d.age} alive=${d.alive} upd=${d.updated_at||d._ts||''}`);
  else console.log('player_life ERR', JSON.stringify(pl).slice(0,200));
  // llm_io pending 超10min
  const pend = await q(`db.collection('llm_io').where({status:'pending'}).orderBy('_ts','asc').limit(5).get()`, false).catch(e=>({err:String(e)}));
  if (pend && pend.data) {
    const now = Date.now();
    const old = pend.data.filter(d => d._ts && now - d._ts > 600000);
    console.log('pending old(>10min) =', old.length);
    for (const d of old) console.log('  stuck id=', d._id, 'ts=', new Date(d._ts).toISOString());
  } else console.log('pending query ERR', JSON.stringify(pend).slice(0,200));
})();
