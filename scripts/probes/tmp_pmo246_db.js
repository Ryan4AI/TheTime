// 246 期抽查：llm_io status/category 分布 · narrate_history role 分布（只读）
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
  const counts = {
    'llm_io status=error': `db.collection('llm_io').where({status:'error'}).count()`,
    'llm_io cat=options_fallback': `db.collection('llm_io').where({category:'options_fallback'}).count()`,
    'llm_io cat=history_compress': `db.collection('llm_io').where({category:'history_compress'}).count()`,
    'narrate role=user': `db.collection('narrate_history').where({role:'user'}).count()`,
    'narrate role=ai': `db.collection('narrate_history').where({role:'ai'}).count()`,
    'narrate role=system': `db.collection('narrate_history').where({role:'system'}).count()`,
  };
  for (const [k, v] of Object.entries(counts)) {
    const r = await q(v, true).catch(e => ({ err: String(e) }));
    console.log(`${k} = ${r.count !== undefined ? r.count : JSON.stringify(r).slice(0, 120)}`);
  }
  const g = await q(`db.collection('player_life').limit(1).get()`).catch(e => ({ err: String(e) }));
  const doc = (g.data && g.data[0]) || {};
  console.log('player_life:', JSON.stringify({ life: doc.life, round: doc.round, age: doc.age, alive: doc.alive, updated_at: doc.updated_at }).slice(0, 300));
})();
