const https=require('https'),fs=require('fs');
const APP_ID='wx2fc3ba2c105c9ba2';
const APP_SECRET=fs.readFileSync('credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID='cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{const j=JSON.parse(d);j.access_token?res(j.access_token):rej(d.slice(0,200));});}).on('error',rej);});}
let TK=null;
async function q(query){const token=TK||(TK=await getToken());return new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(d.slice(0,200));}});});req.on('error',rej);req.write(body);req.end();});}
const parse=r=>(r.data||[]).map(s=>{try{return JSON.parse(s)}catch(e){return{_parse_err:s.slice(0,50)}}});
(async()=>{
  // narrate 全量 32
  const nh=parse(await q(`db.collection('narrate_history').orderBy('seq','asc').limit(50).get()`));
  console.log('narrate n=',nh.length,'seq range',nh[0]&&nh[0].seq,'..',nh[nh.length-1]&&nh[nh.length-1].seq);
  const roles={};nh.forEach(d=>roles[d.role]=(roles[d.role]||0)+1);
  console.log('roles',JSON.stringify(roles));
  console.log('content nonstring=',nh.filter(d=>typeof d.content!=='string').length,'empty=',nh.filter(d=>d.content==='').length);
  const last=nh[nh.length-1];
  console.log('latest seq',last.seq,'at',new Date(last.created_at).toISOString(),'life',last.life_number);
  // llm_io 全量扫 status/category + created_at
  let all=[],off=0;
  while(off<700){const r=await q(`db.collection('llm_io').orderBy('created_at','asc').skip(${off}).limit(100).get()`);const arr=parse(r);all=all.concat(arr);if(arr.length<100)break;off+=100;}
  console.log('llm_io total fetched',all.length);
  const st={},cat={};
  all.forEach(d=>{st[d.status]=(st[d.status]||0)+1;cat[d.category]=(cat[d.category]||0)+1});
  console.log('status',JSON.stringify(st));
  console.log('category',JSON.stringify(cat));
  const withTs=all.filter(d=>d.created_at);
  const mx=withTs.reduce((a,b)=>a.created_at>b.created_at?a:b,withTs[0]||{});
  console.log('llm_io latest created_at',mx.created_at?new Date(mx.created_at).toISOString():'none','cat',mx.category,'status',mx.status);
  const pend=all.filter(d=>d.status==='pending');
  console.log('pending',pend.length, pend.length?pend.map(d=>new Date(d.created_at).toISOString()).join(','):'');
})();
