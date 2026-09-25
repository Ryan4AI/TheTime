// P-184：用微信开放接口的 invokecloudfunction 端点，做「零成本」的部署核查
//   step1 调已知可用的只读函数 player_load  → 证明端点/参数格式对不对
//   step2 调 ai_write_death 但**传空 event** → 若已部署会在入口 return {success:false,error:'缺少 state'}（不调 LLM、零花费）
//                                            若未部署应报 fn name invalid 之类
const https = require('https'); const fs = require('fs');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const getToken = () => new Promise((res, rej) => https.get(
  `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,
  r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b).access_token)); }).on('error',rej));
const invoke = (name, event, token) => new Promise((resolve) => {
  const body = JSON.stringify(event);
  const o = { hostname: 'api.weixin.qq.com',
    path: `/tcb/invokecloudfunction?access_token=${token}&env=${ENV_ID}&name=${name}`,
    method: 'POST', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const rq = https.request(o, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{
    try { resolve(JSON.parse(d)) } catch(e) { resolve({ raw: d.slice(0,300) }) } }); });
  rq.on('error', e => resolve({ netErr: e.message })); rq.write(body); rq.end();
});
(async () => {
  const TOKEN = await getToken();
  const cases = [
    ['ai_write_poem', {}],
    ['narrate_get_result', {}],
    ['ai_narrate_submit', {}],
    ['leaderboard_query', {}],
    ['diag_query', {}],
  ];
  for (const [name, ev] of cases) {
    const r = await invoke(name, ev, TOKEN);
    const ok = r.errcode === 0;
    const deployed = ok ? '✅ 已部署（返回自己的入参错误）' : (r.errcode === -501000 ? '❌ 未部署 (FUNCTION_NOT_FOUND)' : '⚠️ 其它错误');
    console.log(`── ${name.padEnd(20)} ${deployed}`);
    console.log('   ', JSON.stringify(r).slice(0, 260));
  }
})();
