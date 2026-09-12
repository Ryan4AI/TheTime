// 临时：本地直连 DeepSeek 验证 jsonMode 是否 400 / 超时
const https = require('https');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('/home/admin/workspace/TheTime/cloudbaserc.json','utf8'));
const fn = cfg.functions.find(f=>f.name==='ai_narrate_worker');
const KEY = fn.envVariables.DS_API_KEY;

function call(opts, label) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const body = JSON.stringify({
      model: 'deepseek-flash',
      messages: opts.messages,
      max_tokens: 1500,
      temperature: 0.85,
      thinking: { type: 'disabled' },
      stream: false,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    const req = https.request({ hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+KEY, 'Content-Length': Buffer.byteLength(body) } },
      res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        console.log(`\n### ${label} → HTTP ${res.statusCode} (${Date.now()-t0}ms)`);
        console.log(d.slice(0,700));
        resolve();
      });});
    req.on('error', e => { console.log(`\n### ${label} → ERR ${e.message}`); resolve(); });
    req.setTimeout(60000, ()=>{ req.destroy(); console.log(`\n### ${label} → 本地 60s 超时`); resolve(); });
    req.write(body); req.end();
  });
}

const SYS_WITH_JSON = '【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。';
const SYS_NO_JSON = '你是一个历史穿越叙事引擎，写一段古风叙事正文。';

(async () => {
  await call({ messages:[{role:'system',content:SYS_WITH_JSON},{role:'user',content:'继续'}], jsonMode:true }, 'A jsonMode + 含JSON字样');
  await call({ messages:[{role:'system',content:SYS_NO_JSON},{role:'user',content:'继续'}], jsonMode:true }, 'B jsonMode + 无JSON字样');
  await call({ messages:[{role:'system',content:SYS_WITH_JSON},{role:'user',content:'继续'}], jsonMode:false }, 'C 无 jsonMode（对照）');
})();
