// P-187b：给 #46（失败无重试入口）补「这事儿到底多常发生」的量化
//   只读 DB（llm_io / narrate_history），回答两个问题：
//   ① 历史失败率多少？（= 提示条出现的频率）
//   ② 失败里有多少是「这一世还没有任何成功叙事」= 开局首轮就失败 → 正好命中 narrative 为空的那扇门
const https = require('https'); const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b).access_token)); }).on('error',rej));
function dbQuery(query, isCount, limit) {
  return new Promise((resolve, reject) => {
    const full = limit ? `${query}.limit(${limit})` : query;
    const body = JSON.stringify({ env: ENV_ID, query: full });
    const o = { hostname: 'api.weixin.qq.com',
      path: `/tcb/${isCount ? 'databasecount' : 'databasequery'}?access_token=${TOKEN}`,
      method: 'POST', headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body) } };
    const rq = https.request(o, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
      try { const j = JSON.parse(d);
        if (Array.isArray(j.data)) j.data = j.data.map(s => { try { return JSON.parse(s) } catch(e){ return {__raw:s.slice(0,120)} } });
        resolve(j); } catch(e) { resolve({ raw: d.slice(0,300) }) } }); });
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
  const total = await C('llm_io');
  const ok = await C('llm_io', { status: 'success' });
  const err = await C('llm_io', { status: 'error' });
  console.log('=== ① 历史失败率 ===');
  console.log(`  llm_io 总 ${total}｜success ${ok}｜error ${err} → 失败率 ${((err/total)*100).toFixed(1)}%`);

  const _r0 = await dbQuery(`db.collection('llm_io').where({status:'error'}).orderBy('created_at','desc').limit(30).get()`, false);
  console.log('  [debug] errcode=', _r0.errcode, 'rows=', rows(_r0).length);
  const errRows = rows(_r0);
  console.log(`\n=== ② 最近 ${errRows.length} 条 error 明细（是否开局首轮失败）===`);
  // 每一条：查同一 openid+life_number 在这条之前有没有成功过 narrate
  let firstRound = 0;
  for (const r of errRows) {
    // 按 openid 看时间线（llm_io 里 life_number 字段不齐，用它过滤会漏）
    const before = rows(await dbQuery(
      `db.collection('llm_io').where({openid:'${r.openid}',status:'success'}).limit(200).get()`, false))
      .filter(x => ts(x) < ts(r));
    const isFirst = before.length === 0;
    if (isFirst) firstRound++;
    console.log(`  ${fmt(ts(r))} cat=${(r.category||'?').padEnd(16)} openid=${String(r.openid||'').slice(0,9)} life=${r.life_number} ` +
      `→ 此前成功 ${before.length} 次 ${isFirst ? '🔴 开局首轮（正好是 narrative 为空的情形）' : ''}`);
  }
  console.log(`\n  小结：${errRows.length} 条 error 里 **${firstRound} 条**落在"这一世还没有任何成功叙事"时段`);
  console.log('  ⚠️ 口径说明：llm_io 里没有直接记录玩家所见状态 → 玩家是否真的看到"没有重试按钮"取决于失败时前端 narrative 是否为空，');
  console.log('     上述统计是"最可能命中那扇门"的上界估计，不是精确复现。');
})();
