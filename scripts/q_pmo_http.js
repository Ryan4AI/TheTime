// PMO 巡检查询 · 走 wx cloud databasequery/databasecount 协议（2026-08-27 修复 databaserecord 40066）
const https = require('https');
const fs = require('fs');
const APP_ID='wx2fc3ba2c105c9ba2';
const APP_SECRET=fs.readFileSync('credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID='cloud1-d5gkbowyvbd1c85e1';

function getToken(){
  return new Promise((resolve, reject) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
        const j=JSON.parse(d);
        if(j.access_token) resolve(j.access_token);
        else reject('token err: '+d.slice(0,200));
      });
    }).on('error',reject);
  });
}

async function dbQuery(query, isCount=false) {
  const token = await getToken();
  const endpoint = isCount ? 'databasecount' : 'databasequery';
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com',
      path: `/tcb/${endpoint}?access_token=${token}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
        try{ resolve(JSON.parse(d)); }catch(e){ reject('parse: '+d.slice(0,200)); }
      });
    });
    req.on('error',reject);
    req.write(body); req.end();
  });
}

(async () => {
  const table = process.argv[2];
  const type = process.argv[3] || 'count';
  let query, isCount;
  try {
    if (type === 'count') {
      query = `db.collection('${table}').count()`;
      isCount = true;
    } else if (type === 'pending_count') {
      query = `db.collection('${table}').where({status:'pending'}).count()`;
      isCount = true;
    } else if (type === 'pending_old10m') {
      const cutoff = new Date(Date.now() - 10*60*1000).toISOString();
      query = `db.collection('${table}').where({status:'pending',created_at:db.command.lt('${cutoff}')}).count()`;
      isCount = true;
    } else if (type === 'dirty') {
      query = `db.collection('${table}').where({content:db.command.neq(db.command.type('string'))}).count()`;
      isCount = true;
    } else if (type === 'dirty_v2') {
      query = `db.collection('${table}').where({content:db.command.exists(false)}).count()`;
      isCount = true;
    } else if (type === 'dirty_v3') {
      query = `db.collection('${table}').where({content:null}).count()`;
      isCount = true;
    } else if (type === 'dirty_ids') {
      query = `db.collection('${table}').where({content:db.command.exists(false)}).limit(50).field({_id:true,seq:true,created_at:true,status:true}).get()`;
      isCount = false;
    } else if (type === 'pending_ids') {
      query = `db.collection('${table}').where({status:'pending'}).orderBy('created_at','desc').limit(100).field({_id:true,category:true,created_at:true}).get()`;
      isCount = false;
    } else if (type === 'recent3') {
      const lim = parseInt(process.argv[4] || '3', 10);
      query = `db.collection('${table}').orderBy('created_at','desc').limit(${lim}).field({_id:true,created_at:true,status:true,category:true}).get()`;
      isCount = false;
    } else if (type === 'cat_recent') {
      // 用法: node q_pmo_http.js llm_io cat_recent scene  （查某 category 最近 10 条 status/created_at）
      const cat = process.argv[4];
      query = `db.collection('${table}').where({category:'${cat}'}).orderBy('created_at','desc').limit(10).field({_id:true,created_at:true,status:true,category:true}).get()`;
      isCount = false;
    } else if (type === 'role_recent') {
      // 用法: node q_pmo_http.js narrate_history role_recent system 8
      const role = process.argv[4] || 'system';
      const lim = parseInt(process.argv[5] || '8', 10);
      query = `db.collection('${table}').where({role:'${role}'}).orderBy('seq','desc').limit(${lim}).field({_id:true,seq:true,created_at:true,role:true,content:true}).get()`;
      isCount = false;
    } else if (type === 'cat_raw') {
      // 用法: node q_pmo_http.js llm_io cat_raw narrate 2  （看某 category 最近 N 条的原始输出/状态）
      const cat = process.argv[4];
      const lim = parseInt(process.argv[5] || '2', 10);
      query = `db.collection('${table}').where({category:'${cat}'}).orderBy('created_at','desc').limit(${lim}).get()`;
      isCount = false;
    } else if (type === 'max_seq') {
      query = `db.collection('${table}').orderBy('seq','desc').limit(3).field({_id:true,seq:true,created_at:true,content:true,role:true}).get()`;
      isCount = false;
    } else {
      console.error('unknown type:', type); process.exit(1);
    }

    const r = await dbQuery(query, isCount);
    if (r.data) {
      const data = r.data;
      if (Array.isArray(data)) {
        console.log(`${table} ${type}: array len=${data.length}`);
        const sw = parseInt(process.env.Q_SLICE || "220", 10);
        data.slice(0, parseInt(process.env.Q_LIMIT || "10", 10)).forEach(x => console.log(' ', JSON.stringify(x).slice(0, sw)));
      } else if (typeof data === 'number') {
        console.log(`${table} ${type} total = ${data}`);
      } else {
        console.log(JSON.stringify(data, null, 2).slice(0, 1500));
      }
    } else if (r.errcode) {
      console.log(`${table} ${type} ERR: errcode=${r.errcode} ${r.errmsg}`);
    } else {
      console.log(JSON.stringify(r, null, 2).slice(0, 1500));
    }
  } catch(e) {
    console.error('OUTER ERR:', e.message || e);
  }
})();
