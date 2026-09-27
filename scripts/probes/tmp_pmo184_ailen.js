// 184 期：叙事打字机等待时长分布（真实 narrate_history 数据）
// 目的：量化「点选项后要等多久才能看到选项」= TYPEWRITE_SPEED(15ms/字) × 字数
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
    const o = { hostname: 'api.weixin.qq.com',
      path: `/tcb/databasequery?access_token=${TOKEN}`,
      method: 'POST', headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body) } };
    const rq = https.request(o, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
      try { const j = JSON.parse(d);
        if (Array.isArray(j.data)) j.data = j.data.map(s => { try { return JSON.parse(s) } catch(e){ return {__raw:s.slice(0,120)} } });
        resolve(j);
      } catch(e) { resolve({ raw: d.slice(0,300) }) } }); });
    rq.on('error', reject); rq.write(body); rq.end();
  });
}
const rows = r => (r && Array.isArray(r.data)) ? r.data : [];

(async () => {
  TOKEN = await getToken();
  const list = rows(await dbQuery(`db.collection('narrate_history').where({role:'ai'}).orderBy('seq','desc').limit(80).get()`));
  const lens = list.map(x => typeof x.content === 'string' ? x.content.length : -1).filter(n => n >= 0);
  lens.sort((a,b) => a-b);
  const stat = (p) => lens[Math.min(lens.length-1, Math.floor(lens.length*p))];
  const secs = n => (n * 15 / 1000).toFixed(1);
  console.log('=== ai 叙事条数 =', lens.length, '(seq', Math.min(...[]) || '', ')');
  console.log(`  字数 min=${lens[0]} p25=${stat(0.25)} 中位=${stat(0.5)} p75=${stat(0.75)} p90=${stat(0.9)} max=${lens[lens.length-1]}`);
  console.log(`  对应打字耗时(15ms/字,秒): min=${secs(lens[0])} 中位=${secs(stat(0.5))} p75=${secs(stat(0.75))} p90=${secs(stat(0.9))} max=${secs(lens[lens.length-1])}`);
  const over = t => lens.filter(n => n*15/1000 > t).length;
  for (const t of [4,6,8,10,15])
    console.log(`  > ${t}s 的占比: ${over(t)}/${lens.length} = ${(over(t)/lens.length*100).toFixed(1)}%`);
  // 打完才能出选项（+300ms），统计“点完选项到可再点”的总等待
  console.log('=== 最长 5 条 ===');
  list.map(x => ({ seq: x.seq, n: typeof x.content === 'string' ? x.content.length : -1 }))
      .sort((a,b) => b.n - a.n).slice(0,5)
      .forEach(x => console.log(`  seq=${x.seq} ${x.n}字 → ${secs(x.n)}s`));
})().catch(e => console.error('ERR:', e.message));
