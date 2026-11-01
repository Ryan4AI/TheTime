const https=require('https'),fs=require('fs');
const APP_ID='wx2fc3ba2c105c9ba2';
const APP_SECRET=fs.readFileSync('credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID='cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{const j=JSON.parse(d);j.access_token?res(j.access_token):rej(d.slice(0,200));});}).on('error',rej);});}
function q(query){return new Promise(async(res,rej)=>{const token=await getToken();const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(d.slice(0,200));}});});req.on('error',rej);req.write(body);req.end();});}
(async()=>{
  const r=await q(`db.collection('narrate_history').orderBy('seq','desc').limit(2).get()`);
  console.log('RAW:', JSON.stringify(r).slice(0,900));
  const r2=await q(`db.collection('player_life').limit(1).get()`);
  console.log('PL RAW:', JSON.stringify(r2).slice(0,900));
  const r3=await q(`db.collection('llm_io').orderBy('_ts','desc').limit(2).get()`);
  console.log('IO RAW:', JSON.stringify(r3).slice(0,900));
})();
