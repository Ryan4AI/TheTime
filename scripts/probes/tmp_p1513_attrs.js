// P-151-3 调研：文采/政绩是否普遍恒 0（跨世/跨玩家）
const https=require('https'), fs=require('fs');
const APP_ID='wx2fc3ba2c105c9ba2';
const SEC=fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV='cloud1-d5gkbowyvbd1c85e1';
const tok=()=>new Promise(r=>https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${SEC}`,s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b).access_token))}));
const q=query=>tok().then(t=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV,query});const rq=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${t}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>res(JSON.parse(d)))});rq.on('error',rej);rq.write(body);rq.end();}));
const K=[['声望','reputation'],['财富','wealth'],['学识','knowledge'],['颜值','appearance'],['医术','medical'],['战功','military'],['文采','literary'],['政绩','political'],['义行','righteousness']];
(async()=>{
  const r=await q(`db.collection('player_life').limit(20).get()`);
  if(r.errcode!==0){console.log(r);return;}
  console.log(`player_life 共 ${r.data.length} 条：`);
  for(const s of r.data){const x=JSON.parse(s);
    console.log(`  #${x.life_number} ${x.name||'?'} ${x.occupation||'?'} ${x.dynasty||''} | ` + K.map(([c,e])=>`${c}=${x[e]!=null?x[e]:(x.attrs&&x.attrs[e]!=null?x.attrs[e]:'-')}`).join(' '));}
  // 再查 narrate_history 里最近带属性快照的 system 消息
  const h=await q(`db.collection('narrate_history').where({role:'system'}).orderBy('seq','desc').limit(12).get()`);
  if(h.errcode===0&&h.data.length){
    console.log('\n最近 system 属性快照（含文采/政绩的才打印）：');
    let n=0;
    for(const s of h.data){const x=JSON.parse(s); const c=x.content||'';
      if(c.includes('文采')||c.includes('政绩')){ n++;
        const hit=(c.match(/[^\s，。、]{0,6}(文采|政绩)[：: ]?-?\d+/g)||[]).join(' ');
        console.log(`  seq${x.seq}: ${hit.slice(0,90)}`);}
      if(n>=6)break;}
    if(n===0)console.log('  （最近 12 条 system 无属性快照）');
  }
})().catch(e=>console.error('ERR:',e.message));
