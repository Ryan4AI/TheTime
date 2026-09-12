// 临时：清 is_scoring（先生 2026-09-12 15:26 授权）
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function run(query, endpoint){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/${endpoint}?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}
const OPENID = 'oPj9J3SlVBKCn09wvsYdR94hov7A';
(async()=>{
  const before = await run(`db.collection('player_life').where({openid:'${OPENID}'}).limit(5).get()`,'databasequery');
  console.log('=== 更新前 ===');
  for(const s of (before.data||[])){const r=JSON.parse(s);console.log(`life=${r.life_number} is_scoring=${r.is_scoring} round=${r.round}`);}
  const upd = await run(`db.collection('player_life').where({openid:'${OPENID}',is_scoring:true}).update({data:{is_scoring:false}})`,'databaseupdate');
  console.log('=== 更新结果 ===', JSON.stringify(upd));
  const after = await run(`db.collection('player_life').where({openid:'${OPENID}'}).limit(5).get()`,'databasequery');
  console.log('=== 更新后 ===');
  for(const s of (after.data||[])){const r=JSON.parse(s);console.log(`life=${r.life_number} is_scoring=${r.is_scoring} round=${r.round}`);}
})().catch(e=>console.error('ERR:',e.message));
