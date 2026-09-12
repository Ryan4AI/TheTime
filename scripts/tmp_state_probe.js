// 临时：查 player_life + narrate_history 最近记录
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function q(query, count){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/${count?'databasecount':'databasequery'}?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}
const OPENID = process.argv[2] || 'oPj9J3SlVBKCn09wvsYdR94hov7A';
(async()=>{
  const life = await q(`db.collection('player_life').where({openid:'${OPENID}'}).orderBy('life_number','desc').limit(1).get()`);
  console.log('=== player_life ===');
  for(const s of (life.data||[])){
    const r=JSON.parse(s);
    console.log(JSON.stringify({life_number:r.life_number,age:r.age,round:r.round,is_scoring:r.is_scoring,month:r.month,year:r.year,city:r.city,dynasty:r.dynasty,alive:r.alive,updated_at:r.updated_at,updated_at_str:r.updated_at?new Date(r.updated_at).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):''}));
  }
  const hist = await q(`db.collection('narrate_history').where({openid:'${OPENID}'}).orderBy('created_at','desc').limit(8).get()`);
  console.log('=== narrate_history 最近 8 ===');
  for(const s of (hist.data||[])){
    const r=JSON.parse(s);
    console.log(`${new Date(r.created_at).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})} | ${r.role} | seq=${r.seq} | life=${r.life_number} | ${(r.content||'').slice(0,60).replace(/\n/g,'⏎')}`);
  }
})().catch(e=>console.error('ERR:',e.message));
