// 178 期旁路核查：llm_io 里是否留下过 ai_write_death / ai_write_poem 的调用痕迹
const https = require('https'); const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b).access_token)); }).on('error',rej));
const q = (query, isCount) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ env: ENV_ID, query });
  const o = { hostname: 'api.weixin.qq.com', path: `/tcb/${isCount?'databasecount':'databasequery'}?access_token=${TOKEN}`,
    method: 'POST', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const rq = https.request(o, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
    try { const j=JSON.parse(d); if (Array.isArray(j.data)) j.data = j.data.map(s=>{ try{return JSON.parse(s)}catch(e){return {__raw:s.slice(0,80)}} });
      resolve(j); } catch(e){ resolve({raw:d.slice(0,200)}) } }); });
  rq.on('error', reject); rq.write(body); rq.end();
});
const R = r => (r && Array.isArray(r.data)) ? r.data : [];
(async () => {
  TOKEN = await getToken();
  const one = R(await q('db.collection("llm_io").limit(1).get()'));
  console.log('llm_io 字段样例：', Object.keys(one[0] || {}).join(', '));
  for (const f of ['scene','from','name','fn','func','type','kind','category']) {
    const arr = R(await q(`db.collection("llm_io").where({${f}: _.exists(true)}).limit(500).get()`));
    if (!arr.length) continue;
    const c = {}; for (const x of arr) c[x[f]] = (c[x[f]]||0)+1;
    console.log(`  ${f}:`, Object.entries(c).slice(0,15).map(([k,v])=>`${k}=${v}`).join(' | '), `(样本 ${arr.length})`);
  }
  for (const kw of ['death','write_death','ai_write_death','poem']) {
    console.log(`  scene=${kw} →`, JSON.stringify(await q(`db.collection("llm_io").where({scene:"${kw}"}).count()`, true)));
  }
})();
