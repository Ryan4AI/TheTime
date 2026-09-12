// 临时：本地用真实 state + 真实 history 复现 AI₁ 调用（DeepSeek jsonMode）
const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

// 1. stub wx-server-sdk
const origResolve = Module._resolveFilename;
const stub = { init(){}, DYNAMIC_CURRENT_ENV:'x', database: () => ({ collection: () => ({ where:()=>({orderBy:()=>({limit:()=>({get:async()=>({data:[]})})})}), add:async()=>{}, get:async()=>({data:[]}) }), command:{} }), getWXContext:()=>({OPENID:'x'}) };
require.cache['wx-server-sdk'] = { id:'wx-server-sdk', filename:'wx-server-sdk', loaded:true, exports: stub };
const origLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request==='wx-server-sdk') return stub;
  if(request==='./parse-ai-output') return origLoad.call(this, '/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/parse-ai-output.js', parent, isMain);
  return origLoad.apply(this, arguments);
};

// 2. 加载 worker 源码并导出内部纯函数
const SRC = fs.readFileSync('/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/index.js','utf8');
const m = new Module('worker-probe', null);
m._compile(SRC + '\nmodule.exports.__probe = { buildSystemPrompt, buildUserPrompt, parseAIOutput, MONTH_DELTA_WEIGHTS, weightedRandom };\n', '/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/probe.js');
const { buildSystemPrompt, buildUserPrompt, parseAIOutput } = m.exports.__probe;

// 3. 从云端拉真实数据
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function q(query){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}

const OPENID = 'oPj9J3SlVBKCn09wvsYdR94hov7A';
const cfg = JSON.parse(fs.readFileSync('/home/admin/workspace/TheTime/cloudbaserc.json','utf8'));
const KEY = cfg.functions.find(f=>f.name==='ai_narrate_worker').envVariables.DS_API_KEY;

function callLLM(messages, opts) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const body = JSON.stringify({ model:'deepseek-flash', messages, max_tokens: opts.maxTokens||1500, temperature:0.85,
      thinking:{type:'disabled'}, stream:false, ...(opts.jsonMode?{response_format:{type:'json_object'}}:{}) });
    const req = https.request({ hostname:'api.deepseek.com', path:'/chat/completions', method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY,'Content-Length':Buffer.byteLength(body)} },
      res=>{ let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ resolve({status:res.statusCode, ms:Date.now()-t0, body:d}); }); });
    req.on('error',e=>resolve({status:0, ms:Date.now()-t0, body:e.message}));
    req.setTimeout(90000,()=>{req.destroy();resolve({status:-1,ms:Date.now()-t0,body:'local timeout'})});
    req.write(body); req.end();
  });
}

(async () => {
  const life = await q(`db.collection('player_life').where({openid:'${OPENID}'}).orderBy('life_number','desc').limit(1).get()`);
  const rec = JSON.parse(life.data[0]);
  const state = {
    life_number: rec.life_number, name: rec.name, gender: rec.gender==='female'?'女':'男', age: rec.age,
    occupation: rec.occupation, social_class: rec.social_class||rec.socialClass, dynasty: rec.dynasty,
    eraDisplay: rec.era_display||rec.eraDisplay, city: rec.city, year: rec.year, month: rec.month, round: rec.round||0,
    coin: rec.coin!=null?rec.coin:1000,
    '声望':rec.reputation||0,'财富':rec.wealth||0,'学识':rec.knowledge||0,'颜值':rec.appearance||0,
    '医术':rec.medical||0,'战功':rec.military||0,'文采':rec.literary||0,'政绩':rec.political||0,'义行':rec.righteousness||0,
    items: rec.items||[], legacy: rec.legacy||null,
  };
  const compRes = await q(`db.collection('history_compress').where({openid:'${OPENID}'}).orderBy('last_seq','desc').limit(1).get()`);
  const comp = compRes.data && compRes.data.length ? JSON.parse(compRes.data[0]) : null;
  const lastSeq = comp ? comp.last_seq : null;
  console.log('最新压缩 last_seq=', lastSeq, ' 摘要长度=', comp ? (comp.text||'').length : 0);
  // 分页拉 seq > lastSeq 的原文（模拟 worker 全量喂）
  let all = [];
  for (let skip = 0; skip < 1200; skip += 100) {
    const page = await q(`db.collection('narrate_history').where({openid:'${OPENID}'}).orderBy('seq','asc').skip(${skip}).limit(100).get()`);
    if (!page.data || !page.data.length) break;
    all = all.concat(page.data.map(s=>JSON.parse(s)));
    if (page.data.length < 100) break;
  }
  console.log('narrate_history 全量条数 =', all.length);
  const history = lastSeq == null ? all : all.filter(m => m.seq > lastSeq);
  console.log('喂 AI 的原文条数 =', history.length, '(seq >', lastSeq, ')');

  const systemPrompt = buildSystemPrompt(state, null);
  const userPrompt = buildUserPrompt('', history);
  console.log('systemPrompt chars=', systemPrompt.length, ' userPrompt chars=', userPrompt.length, ' history=', history.length);

  const messages = [
    { role:'system', content: systemPrompt },
    ...(comp && comp.text ? [{ role:'system', content: comp.text }] : []),
    ...history.map(msg => msg.role==='ai' ? {role:'assistant',content:msg.content} : msg.role==='system' ? {role:'system',content:msg.content||''} : {role:'user',content:msg.content}),
    { role:'system', content:'【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。' },
  ];
  console.log('messages=', messages.length, ' 估算 prompt tokens ≈', Math.round((systemPrompt.length + JSON.stringify(messages).length)/2));

  for (const opts of [{jsonMode:true,label:'jsonMode ON #1'},{jsonMode:true,label:'jsonMode ON #2'},{jsonMode:false,label:'jsonMode OFF（对照）'}]) {
    const r = await callLLM(messages, opts);
    console.log(`\n### ${opts.label} → HTTP ${r.status} (${r.ms}ms)`);
    if (r.status !== 200) { console.log(r.body.slice(0,400)); continue; }
    const j = JSON.parse(r.body);
    const ch = j.choices?.[0];
    console.log('finish_reason=', ch?.finish_reason, ' usage=', JSON.stringify(j.usage));
    const content = ch?.message?.content || '';
    const parsed = parseAIOutput(content);
    console.log('parseError=', parsed.parseError ? parsed.parseError.message : 'none', ' branches=', (parsed.branches||[]).length, ' options=', JSON.stringify(parsed.branches?.[0]?.options||null));
    console.log('content.length=', content.length, ' trimmed.length=', content.trim().length);
    console.log('raw head:', JSON.stringify(content.slice(0,200)));
    console.log('raw tail:', JSON.stringify(content.slice(-300)));
  }
})().catch(e=>console.error('ERR:', e.stack));

// ── 追加：jsonMode ON 重复 3 次，打印完整输出特征 ──
