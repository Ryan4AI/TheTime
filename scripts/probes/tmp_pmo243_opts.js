// PMO 193 期巡检 DB 校验（沿用 172 期 HTTP 套路）
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

function labelsOf(o) {
  // output.parsed is a JSON string of array
  try {
    let p = o.output && o.output.parsed;
    if (typeof p === 'string') p = JSON.parse(p);
    const arr = Array.isArray(p) ? p : [p];
    const out = [];
    for (const b of arr) if (b && Array.isArray(b.options)) out.push(...b.options.map(String));
    return out;
  } catch (e) { return null; }
}
(async () => {
  TOKEN = await getToken();
  const all = [];
  for (let skip = 0; skip < 700; skip += 100) {
    const r = rows(await dbQuery(`db.collection('llm_io').where({category:'narrate'}).orderBy('created_at','desc').skip(${skip}).limit(100).get()`));
    await sleep(150);
    if (!r.length) break;
    all.push(...r);
  }
  console.log('narrate rows =', all.length);
  const lens = [];
  let parseFail = 0, optCount = {};
  for (const x of all) {
    const L = labelsOf(x);
    if (!L) { parseFail++; continue; }
    optCount[L.length] = (optCount[L.length] || 0) + 1;
    for (const s of L) lens.push(s.length);
  }
  lens.sort((a,b)=>a-b);
  const q = p => lens[Math.min(lens.length-1, Math.floor(lens.length*p))];
  console.log('parseFail =', parseFail, 'option-count dist =', JSON.stringify(optCount));
  console.log('label count =', lens.length, 'min=', lens[0], 'p50=', q(.5), 'p90=', q(.9), 'p99=', q(.99), 'max=', lens[lens.length-1]);
  // 分位数分布桶
  const buckets = {};
  for (const n of lens) { const b = n<=20?'<=20':n<=23?'21-23':n<=25?'24-25':n<=30?'26-30':n<=40?'31-40':'41+'; buckets[b]=(buckets[b]||0)+1; }
  console.log('buckets =', JSON.stringify(buckets));
  console.log('max labels =', lens.slice(-10).join(','));
})().catch(e => console.error('ERR:', e.message));
