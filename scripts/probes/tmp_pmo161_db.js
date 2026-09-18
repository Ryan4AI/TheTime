// 161 期巡检 DB 校验（一次 token，多次查询）
// ⚠️ 161 期修正：微信云 HTTP 返回的 data 是「**JSON 字符串数组**」，不是 JSON 数组。
//    直接 JSON.parse(r.data) 永远失败 → 160 期的 tmp_pmo160_db.js 靠 count 侥幸出数，
//    分页扫描那段其实扫到 0 条（scanned=0 才是真值，160 期报的 753 是笔误口径）。
//    本文件统一用 parseRows() 逐条 parse，稳。
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
      } catch(e) { resolve({ raw: d.slice(0,200) }) } }); });
    rq.on('error', reject); rq.write(body); rq.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rows = r => (r && Array.isArray(r.data)) ? r.data : [];

(async () => {
  TOKEN = await getToken();
  const out = {};
  for (const t of ['era_meta','era_cities','era_age_dist','social_structure','event','player','player_life','narrate_history','llm_io']) {
    const r = await dbQuery(`db.collection('${t}').count()`, true);
    out[t] = r && r.count !== undefined ? r.count : JSON.stringify(r).slice(0,120);
    await sleep(120);
  }
  // 卡轮：pending + 超 10 分钟
  const pr = await dbQuery(`db.collection('llm_io').where({status:'pending'}).limit(100).get()`);
  const now = Date.now();
  const age = x => { const t = x.created_at || x.createdAt; const ms = typeof t === 'number' ? (t < 1e12 ? t*1000 : t) : Date.parse(t); return ms ? now - ms : null; };
  out.pending = rows(pr).length;
  out.pending_old10m = rows(pr).filter(x => { const a = age(x); return a && a > 10*60*1000; }).length;
  await sleep(120);
  // llm_io 分类/状态分布
  for (const w of ["status:'success'","status:'error'","category:'narrate'","category:'score'","category:'options_fallback'"]) {
    const r = await dbQuery(`db.collection('llm_io').where({${w}}).count()`, true);
    out['llm_io_' + w.replace(/[^a-z_]/g,'')] = r.count;
    await sleep(120);
  }
  // 脏数据 / 空壳（正确扫法：逐条 typeof content）
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
  // 最后一局时间
  const lr = await dbQuery(`db.collection('narrate_history').orderBy('created_at','desc').limit(2).get()`);
  out.latest_narrate = rows(lr).map(x => ({ seq: x.seq, role: x.role, t: x.created_at }));
  await sleep(120);
  const pl = await dbQuery(`db.collection('player_life').limit(5).get()`);
  out.player_life = rows(pl).map(x => ({ id: x._id, round: x.round, t: x.created_at }));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => console.error('ERR:', e.message));
