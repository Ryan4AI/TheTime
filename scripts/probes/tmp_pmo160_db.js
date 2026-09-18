// 160 期巡检一次性 DB 校验（一次 token，多次查询）
const https = require('https');
const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
let TOKEN = '';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function dbQuery(query,isCount){return new Promise((resolve,reject)=>{const body=JSON.stringify({env:ENV_ID,query});const opts={hostname:'api.weixin.qq.com',path:`/tcb/${isCount?'databasecount':'databasequery'}?access_token=${TOKEN}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};const req=https.request(opts,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){resolve({raw:d.slice(0,300)})}})});req.on('error',reject);req.write(body);req.end();});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  TOKEN = await getToken();
  const base=['era_meta','era_cities','era_age_dist','social_structure','event'];
  const d049=['player','player_life','narrate_history','llm_io'];
  const out={};
  for(const t of [...base,...d049]){
    const r=await dbQuery(`db.collection('${t}').count()`,true);
    out[t]= r&&r.count!==undefined? r.count : JSON.stringify(r).slice(0,120);
    await sleep(120);
  }
  // pending
  const pr=await dbQuery(`db.collection('llm_io').where({status:'pending'}).limit(100).get()`,false);
  let plist=[]; try{plist=JSON.parse(pr.data||'[]');}catch(e){plist=[];}
  out.pending=plist.length;
  const now=Date.now();
  const old10=plist.filter(x=>{const t=x.created_at||x.createdAt; if(!t)return false; const ts=(typeof t==='object'&&t.$date)?t.$date:t; const ms=typeof ts==='number'?(ts<1e12?ts*1000:ts):Date.parse(ts); return ms && (now-ms)>10*60*1000;});
  out.pending_old10m=old10.length;
  out.pending_sample=plist.slice(0,2).map(x=>({id:x._id,t:x.created_at||x.createdAt}));
  await sleep(120);
  // latest narrate
  const lr=await dbQuery(`db.collection('narrate_history').orderBy('created_at','desc').limit(2).get()`,false);
  let ll=[];try{ll=JSON.parse(lr.data||'[]')}catch(e){}
  if(!ll.length){const lr2=await dbQuery(`db.collection('narrate_history').limit(2).get()`,false);try{ll=JSON.parse(lr2.data||'[]')}catch(e){}}
  out.latest_narrate=ll.map(x=>({seq:x.seq,t:x.created_at||x.createdAt,role:x.role}));
  await sleep(120);
  // dirty scan: content 非字符串
  let dirty=0,total=0;
  for(let p=0;p<9;p++){
    const r=await dbQuery(`db.collection('narrate_history').skip(${p*100}).limit(100).get()`,false);
    let arr=[];try{arr=JSON.parse(r.data||'[]')}catch(e){}
    if(!arr.length)break;
    for(const x of arr){total++; if(x.content!==undefined && typeof x.content!=='string')dirty++;}
    if(arr.length<100)break;
    await sleep(120);
  }
  out.dirty=dirty; out.scanned=total;
  console.log(JSON.stringify(out,null,1));
})().catch(e=>console.error('ERR:',e.message));
