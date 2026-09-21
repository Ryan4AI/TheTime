// 171 期 DB 校验：5 基础表 + 4 运行时表 count + 卡轮 + 脏数据
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

(async () => {
  TOKEN = await getToken();
  const count = async (name, where) => {
    const q = where
      ? `db.collection('${name}').where(${where}).count()`
      : `db.collection('${name}').count()`;
    const r = await dbQuery(q, true);
    await sleep(150);
    return r.count;
  };

  console.log('=== 5 基础表 ===');
  for (const t of ['era_meta','era_cities','era_age_dist','social_structure','event']) {
    console.log(`  ${t} = ${await count(t)}`);
  }
  console.log('=== 4 运行时表 ===');
  for (const t of ['player','player_life','narrate_history','llm_io']) {
    console.log(`  ${t} = ${await count(t)}`);
  }
  console.log('=== llm_io 画像 ===');
  for (const [k,v] of [['success','{status:"success"}'],['error','{status:"error"}'],['pending','{status:"pending"}'],['options_fallback','{category:"options_fallback"}']]) {
    console.log(`  ${k} = ${await count('llm_io', v)}`);
  }
  console.log('=== 脏数据扫描 (narrate_history content 非字符串) ===');
  const r = await dbQuery(`db.collection('narrate_history').limit(1000).get()`);
  const rows = r.data || [];
  let bad = 0, empty = 0;
  for (const x of rows) {
    if (x.content !== undefined && typeof x.content !== 'string') bad++;
    if (typeof x.content === 'string' && x.content.length === 0) empty++;
  }
  console.log(`  抽样 ${rows.length} 条 | content 非字符串 = ${bad} | content 空壳 = ${empty}`);
})().catch(e => console.error('ERR:', e.message));
