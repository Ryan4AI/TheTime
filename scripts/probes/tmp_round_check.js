// PMO 巡检：验证「player_life.round 冻结」假设
// 假设：runPhase2(index.js:590) 用 applyPatch(state, state, attrPatch) → s.round = state.round（未 +1）
//       → 两阶段改造(2026-07-22)后 round 再没涨过
// 验证：看 seq=21*3=63 附近的消息创建时间，是否落在 07-22 前后
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function q(query){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}
const OPENID = process.argv[2] || 'oPj9J3SlVBKCn09wvsYdR94hov7A';
const LIFE = parseInt(process.argv[3] || '1', 10);
const fmt = ts => ts ? new Date(ts > 1e12 ? ts : ts * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) : '-';
(async () => {
  // 1) player_life
  const pl = await q(`db.collection('player_life').where({openid:'${OPENID}',life_number:${LIFE}}).get()`);
  if (pl.errcode !== 0) { console.log(pl); return; }
  for (const s of pl.data) {
    const r = JSON.parse(s);
    console.log(`[player_life] life=${r.life_number} round=${r.round} age=${r.age} year=${r.year} month=${r.month} alive=${r.alive} updated_at=${fmt(r.updated_at)}`);
  }
  // 2) narrate_history seq/时间 抽样
  const h = await q(`db.collection('narrate_history').where({openid:'${OPENID}',life_number:${LIFE}}).field({seq:true,role:true,created_at:true}).orderBy('seq','asc').limit(1000).get()`);
  if (h.errcode !== 0) { console.log(h); return; }
  const rows = h.data.map(s => JSON.parse(s)).sort((a, b) => a.seq - b.seq);
  console.log(`[narrate_history] 取回 ${rows.length} 条, seq ${rows[0] && rows[0].seq} .. ${rows[rows.length-1] && rows[rows.length-1].seq}`);
  // 每轮 = 1 user + 1 ai (+偶发 system) → user 条数 ≈ 轮数
  for (const cut of [63, 66, 100, 699]) {
    const sub = rows.filter(x => x.seq <= cut);
    const c = { user: 0, ai: 0, system: 0 };
    sub.forEach(x => { c[x.role] = (c[x.role] || 0) + 1 });
    console.log(`  seq<=${String(cut).padStart(3)}: 共${sub.length}条 user=${c.user} ai=${c.ai} system=${c.system} → 若 round 正常自增应=${c.user}`);
  }
  const marks = [1, 21, 60, 63, 66, 100, 200, 300, 400, 500, 600, 699];
  for (const m of marks) {
    const r = rows.find(x => x.seq === m) || rows.find(x => x.seq >= m);
    if (r) console.log(`  seq=${String(r.seq).padStart(3)} ${r.role.padEnd(6)} ${fmt(r.created_at)}`);
  }
})().catch(e => console.error('ERR:', e.message));
