// 临时：验证 options 兜底真因假设 —— history 里 assistant 全是纯文本，few-shot 示范压过指令
// 对比 3 种方案 × 5 次：现状 / 普通端点 prefill '{' / beta 端点 prefix completion
const fs = require('fs');
const Module = require('module');
const https = require('https');

const stub = { init(){}, DYNAMIC_CURRENT_ENV:'x', database: () => ({ collection: () => ({ where:()=>({orderBy:()=>({limit:()=>({get:async()=>({data:[]})})})}), add:async()=>{}, get:async()=>({data:[]}) }), command:{} }), getWXContext:()=>({OPENID:'x'}) };
require.cache['wx-server-sdk'] = { id:'wx-server-sdk', filename:'wx-server-sdk', loaded:true, exports: stub };
const origLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request==='wx-server-sdk') return stub;
  if(request==='./parse-ai-output') return origLoad.call(this, '/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/parse-ai-output.js', parent, isMain);
  return origLoad.apply(this, arguments);
};
const SRC = fs.readFileSync('/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/index.js','utf8');
const m = new Module('worker-probe', null);
m._compile(SRC + '\nmodule.exports.__probe = { buildSystemPrompt, buildUserPrompt, parseAIOutput };\n', '/home/admin/workspace/TheTime/cloudfunctions/ai_narrate_worker/probe.js');
const { buildSystemPrompt, buildUserPrompt, parseAIOutput } = m.exports.__probe;

const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('/home/admin/workspace/TheTime/credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
function getToken(){return new Promise((res,rej)=>{https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b).access_token));}).on('error',rej);});}
function q(query){return getToken().then(token=>new Promise((res,rej)=>{const body=JSON.stringify({env:ENV_ID,query});const req=https.request({hostname:'api.weixin.qq.com',path:`/tcb/databasequery?access_token=${token}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));});req.on('error',rej);req.write(body);req.end();}));}

const OPENID = 'oPj9J3SlVBKCn09wvsYdR94hov7A';
const KEY = JSON.parse(fs.readFileSync('/home/admin/workspace/TheTime/cloudbaserc.json','utf8')).functions.find(f=>f.name==='ai_narrate_worker').envVariables.DS_API_KEY;

function callLLM(messages, opts) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const body = JSON.stringify({ model:'deepseek-flash', messages, max_tokens:1500, temperature:0.85,
      thinking:{type:'disabled'}, stream:false, ...(opts.jsonMode?{response_format:{type:'json_object'}}:{}) });
    const base = opts.beta ? 'https://api.deepseek.com/beta/chat/completions' : 'https://api.deepseek.com/chat/completions';
    const url = new URL(base);
    const req = https.request({ hostname:url.hostname, path:url.pathname, method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY,'Content-Length':Buffer.byteLength(body)} },
      res=>{ let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ resolve({status:res.statusCode, ms:Date.now()-t0, body:d}); }); });
    req.on('error',e=>resolve({status:0, ms:Date.now()-t0, body:e.message}));
    req.setTimeout(90000,()=>{req.destroy();resolve({status:-1,ms:Date.now()-t0,body:'local timeout'})});
    req.write(body); req.end();
  });
}

const N = 8;
(async () => {
  const life = await q(`db.collection('player_life').where({openid:'${OPENID}'}).orderBy('life_number','desc').limit(1).get()`);
  const rec = JSON.parse(life.data[0]);
  const state = { life_number:rec.life_number, name:rec.name, gender:rec.gender==='female'?'女':'男', age:rec.age,
    occupation:rec.occupation, social_class:rec.social_class||rec.socialClass, dynasty:rec.dynasty,
    eraDisplay:rec.era_display||rec.eraDisplay, city:rec.city, year:rec.year, month:rec.month, round:rec.round||0,
    coin:rec.coin!=null?rec.coin:1000, '声望':rec.reputation||0,'财富':rec.wealth||0,'学识':rec.knowledge||0,'颜值':rec.appearance||0,
    '医术':rec.medical||0,'战功':rec.military||0,'文采':rec.literary||0,'政绩':rec.political||0,'义行':rec.righteousness||0,
    items:rec.items||[], legacy:rec.legacy||null };
  const compRes = await q(`db.collection('history_compress').where({openid:'${OPENID}'}).orderBy('last_seq','desc').limit(1).get()`);
  const comp = compRes.data && compRes.data.length ? JSON.parse(compRes.data[0]) : null;
  let all = [];
  for (let skip = 0; skip < 1200; skip += 100) {
    const page = await q(`db.collection('narrate_history').where({openid:'${OPENID}'}).orderBy('seq','asc').skip(${skip}).limit(100).get()`);
    if (!page.data || !page.data.length) break;
    all = all.concat(page.data.map(s=>JSON.parse(s)));
    if (page.data.length < 100) break;
  }
  const history = comp ? all.filter(x => x.seq > comp.last_seq) : all;
  const aiCount = history.filter(x=>x.role==='ai').length;
  console.log(`喂 AI 原文 ${history.length} 条，其中 assistant(ai) ${aiCount} 条 —— 全是纯文本叙事（无 JSON）`);

  const systemPrompt = buildSystemPrompt(state, null);
  const base = [
    { role:'system', content: systemPrompt },
    ...(comp && comp.text ? [{ role:'system', content: comp.text }] : []),
    ...history.map(msg => msg.role==='ai' ? {role:'assistant',content:msg.content} : msg.role==='system' ? {role:'system',content:msg.content||''} : {role:'user',content:msg.content}),
    { role:'system', content:'【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。' },
  ];

  const hintMsg = { role:'system', content:'【时间跨度：约一个月】即将生成的剧情建议按跨月的节奏设计（约一个月）。用自然过渡体现——"入秋了""年关将近""月余过去"。时间跨度仅为系统建议，如果当前剧情不适合按此跨度推进，可灵活调整，以剧情连贯性优先。' };
  const tailMsg = { role:'system', content:'【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。' };
  const baseNoTail = base.slice(0, -1); // 去掉原末尾 reminder
  const mkHistory = (asJson) => history.map(msg => {
    if (msg.role === 'ai') {
      const c = asJson && Array.isArray(msg.options) && msg.options.length
        ? JSON.stringify({ content: msg.content, options: msg.options })
        : msg.content;
      return { role:'assistant', content: c };
    }
    return msg.role === 'system' ? { role:'system', content: msg.content || '' } : { role:'user', content: msg.content };
  });
  const buildA = () => [...baseNoTail, hintMsg, tailMsg];
  const buildB = () => [
    { role:'system', content: systemPrompt },
    ...(comp && comp.text ? [{ role:'system', content: comp.text }] : []),
    ...mkHistory(true),
    hintMsg, tailMsg,
  ];

  const mkHistoryTail = (n) => {
    const aiIdx = history.map((m,i)=>({m,i})).filter(x=>x.m.role==='ai').map(x=>x.i);
    const tail = new Set(aiIdx.slice(-n));
    return history.map((msg, i) => {
      if (msg.role === 'ai') {
        const c = tail.has(i) && Array.isArray(msg.options) && msg.options.length
          ? JSON.stringify({ content: msg.content, options: msg.options }) : msg.content;
        return { role:'assistant', content: c };
      }
      return msg.role === 'system' ? { role:'system', content: msg.content || '' } : { role:'user', content: msg.content };
    });
  };
  const buildC = () => [
    { role:'system', content: systemPrompt },
    ...(comp && comp.text ? [{ role:'system', content: comp.text }] : []),
    ...mkHistoryTail(8),
    hintMsg, tailMsg,
  ];

  // 真实玩家输入变体：worker 在 history 之后 push buildUserPrompt(input, history)
  const USER_INPUT = '趁隘口松动，带翠姑南下梅岭';
  const up = buildUserPrompt(USER_INPUT, history);
  const userMsg = { role:'user', content: up };
  const buildA2 = () => [...buildA(), userMsg];
  const buildC2 = () => [...buildC(), userMsg];
  const groups = [
    { label:'A 现状（无真实输入）', build: buildA },
    { label:'C 最后8条JSON（无真实输入）', build: buildC },
    { label:'A2 现状 + 真实玩家输入', build: buildA2 },
    { label:'C2 最后8条JSON + 真实玩家输入', build: buildC2 },
  ];

  for (const g of groups) {
    let direct = 0, fallbackOk = 0, secondCall = 0, err = 0;
    const detail = [];
    for (let i = 0; i < N; i++) {
      const r = await callLLM(g.build(), {});
      if (r.status !== 200) { err++; detail.push(`HTTP${r.status}`); continue; }
      const j = JSON.parse(r.body);
      const content = j.choices?.[0]?.message?.content || '';
      const p = parseAIOutput(content);
      const b = Array.isArray(p.branches) ? p.branches[0] : p.branches;
      const optN = b && Array.isArray(b.options) ? b.options.length : 0;
      const needSecond = optN === 0 || b.optionsFallback === true;
      if (needSecond) secondCall++;
      else if (p.fallbackUsed) fallbackOk++;
      else direct++;
      detail.push(`${r.ms}ms ${needSecond?'要补选项✗':(p.fallbackUsed?'正则救回~':'一次成型✓')}(opt${optN})`);
    }
    console.log(`\n${g.label}`);
    console.log(`   一次成型 ${direct}/${N} · 正则救回不补 ${fallbackOk}/${N} · 需二次补选项 ${secondCall}/${N} · 错误 ${err}`);
    console.log('   ' + detail.join(' | '));
  }

})().catch(e=>console.error('ERR:', e.stack));
