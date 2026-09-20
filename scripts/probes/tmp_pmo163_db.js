// 163 期 DB 校验：5 基础表 + D049 运行时四表 + 卡轮 + 脏数据 + llm_io 画像 + 最新 narrate
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
const tsMs = x => { const t = x.created_at || x.createdAt; if (typeof t === 'number') return t < 1e12 ? t*1000 : t; const p = Date.parse(t); return isNaN(p) ? 0 : p; };
const fmt = ms => ms ? new Date(ms + 8*3600e3).toISOString().replace('T',' ').slice(0,16) : '?';

(async () => {
  TOKEN = await getToken();
  const out = {};
  for (const t of ['era_meta','era_cities','era_age_dist','social_structure','event','player','player_life','narrate_history','llm_io']) {
    const r = await dbQuery(`db.collection('${t}').count()`, true);
    out[t] = r && r.count !== undefined ? r.count : JSON.stringify(r).slice(0,120);
    await sleep(120);
  }
  // 卡轮
  const pr = await dbQuery(`db.collection('llm_io').where({status:'pending'}).limit(100).get()`);
  const now = Date.now();
  out.pending = rows(pr).length;
  out.pending_old10m = rows(pr).filter(x => { const a = now - tsMs(x); return a > 10*60*1000; }).length;
  await sleep(120);
  // llm_io 画像
  for (const w of ["status:'success'","status:'error'","category:'options_fallback'"]) {
    const r = await dbQuery(`db.collection('llm_io').where({${w}}).count()`, true);
    out['llm_io_' + w.replace(/[^a-z_]/g,'')] = r.count;
    await sleep(120);
  }
  // 脏数据扫描
  let total = 0, dirty = 0, shell = 0;
  for (let p = 0; p < 9; p++) {
    const r = await dbQuery(`db.collection('narrate_history').skip(${p*100}).limit(100).get()`);
    const arr = rows(r);
    if (!arr.length) break;
    for (const x of arr) { total++; if (x.content === undefined) shell++; else if (typeof x.content !== 'string') dirty++; }
    if (arr.length < 100) break;
    await sleep(120);
  }
  out.nh_scanned = total; out.nh_dirty = dirty; out.nh_shell = shell;
  // 最新 narrate + player_life
  const lr = await dbQuery(`db.collection('narrate_history').orderBy('seq','desc').limit(2).get()`);
  out.latest_narrate = rows(lr).map(x => ({ seq: x.seq, role: x.role, t: fmt(tsMs(x)) }));
  await sleep(120);
  const lr2 = await dbQuery(`db.collection('narrate_history').orderBy('created_at','desc').limit(1).get()`);
  out.latest_by_time = rows(lr2).map(x => ({ seq: x.seq, role: x.role, t: fmt(tsMs(x)) }));
  await sleep(120);
  const pl = await dbQuery(`db.collection('player_life').orderBy('updated_at','desc').limit(5).get()`);
  out.player_life = rows(pl).map(x => ({ life: x.life_number, round: x.round, age: x.age, alive: x.alive, t: fmt(tsMs(x)) }));
  await sleep(120);
  const c1 = await dbQuery(`db.collection('history_compress').limit(20).get()`);
  out.history_compress = rows(c1).map(x => ({ last_seq: x.last_seq, life: x.life_number }));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => console.error('ERR:', e.message));
