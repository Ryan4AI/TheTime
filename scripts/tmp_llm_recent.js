// 临时：查 llm_io 最近记录摘要
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function q(query){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}
const N = parseInt(process.argv[2]||'20',10);
const FILTER = process.argv[3]||''; // e.g. "fail"
(async()=>{
  let query = `db.collection('llm_io').orderBy('created_at','desc').limit(${N}).get()`;
  if (FILTER==='fail') query = `db.collection('llm_io').where({status:'error'}).orderBy('created_at','desc').limit(${N}).get()`;
  if (FILTER==='pending') query = `db.collection('llm_io').where({status:'pending'}).orderBy('created_at','asc').limit(${N}).get()`;
  if (FILTER==='pending_desc') query = `db.collection('llm_io').where({status:'pending'}).orderBy('created_at','desc').limit(${N}).get()`;
  const r = await q(query);
  if(r.errcode!==0){console.log(r);return;}
  const rows = r.data.map(s=>JSON.parse(s));
  for(const x of rows){
    const t = new Date(x.created_at).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
    const out = x.output||{};
    console.log(`${t} | ${x.category} | ${x.status} | ${x.input&&x.input.model} | ${out.duration_ms}ms | err=${(x.error||'').slice(0,120)} | resp=${(out.raw_response||'').slice(0,80).replace(/\n/g,'⏎')}`);
  }
})().catch(e=>console.error('ERR:',e.message));
