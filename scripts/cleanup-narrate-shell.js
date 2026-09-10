#!/usr/bin/env node
/**
 * narrate_history 脏数据清洗 —— AI 输出缺冒号的畸形 JSON 被解析后，外壳混进正文
 * 特征：content 以 {content " 开头（或含 , "options [ ）
 *
 * 用法:
 *   node scripts/cleanup-narrate-shell.js dryrun   # 只预览，不写库
 *   node scripts/cleanup-narrate-shell.js fix      # 备份 + 修正（备份写 backups/）
 *
 * 安全约束：
 *   - 只动 narrate_history 一张表，且只动 role='ai' 的记录
 *   - 只有"重新解析后能拿到更干净的 content"才写库；解析不了的跳过不动
 *   - fix 前必定先写全量备份到 backups/（可回滚）
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { parseAIOutput } = require('../cloudfunctions/ai_narrate_worker/parse-ai-output.js');

const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '..', 'credentials', 'app-secret.json'), 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const MODE = process.argv[2] || 'dryrun';

function getToken() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error(d.slice(0, 200))); });
    }).on('error', reject);
  });
}
function call(endpoint, query) {
  return getToken().then(token => new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com', path: `/tcb/${endpoint}?access_token=${token}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d.slice(0, 300) }); } }); });
    req.on('error', reject); req.write(body); req.end();
  }));
}

(async () => {
  // 候选：content 以 { 开头且紧跟 content（畸形外壳特征）
  const q = `db.collection('narrate_history').where({role:'ai'}).orderBy('seq','desc').limit(200).get()`;
  const res = await call('databasequery', q);
  if (res.errcode) { console.error('查询失败:', res.errcode, res.errmsg); return; }
  const all = (res.data || []).map(s => (typeof s === 'string' ? JSON.parse(s) : s));

  const dirty = all.filter(r => /^\s*\{\s*"?content/i.test(String(r.content || '')));
  console.log(`📊 扫描 ${all.length} 条 ai 记录，命中畸形外壳 ${dirty.length} 条\n`);

  const plan = [];
  for (const r of dirty) {
    const original = String(r.content || '');
    const parsed = parseAIOutput(original);
    const b = Array.isArray(parsed.branches) ? parsed.branches[0] : parsed.branches;
    const clean = b && b.content ? String(b.content) : '';
    if (clean && clean !== original && !/^\s*\{\s*"?content/i.test(clean)) {
      plan.push({
        _id: r._id, seq: r.seq,
        before: original.slice(0, 70),
        after: clean.slice(0, 70),
        fullAfter: clean,
        options: (b.options && b.options.length) ? b.options : r.options,
      });
    } else {
      console.log(`⏭️  seq=${r.seq} 无法安全修正，跳过（保持原样）`);
    }
  }

  console.log(`\n📝 可安全修正 ${plan.length} 条：`);
  plan.forEach(p => {
    console.log(`  seq=${p.seq}`);
    console.log(`    改前: ${JSON.stringify(p.before)}`);
    console.log(`    改后: ${JSON.stringify(p.after)}`);
  });

  if (MODE === 'dryrun') { console.log('\n（dryrun 模式，未写库。确认无误后跑 fix）'); return; }

  // 备份
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bakFile = path.join(dir, `narrate_history-shell-${ts}.json`);
  fs.writeFileSync(bakFile, JSON.stringify(dirty.map(r => ({ _id: r._id, seq: r.seq, content: r.content, options: r.options })), null, 2));
  console.log(`\n💾 已备份 ${dirty.length} 条原始记录 → ${path.relative(process.cwd(), bakFile)}`);

  let ok = 0, fail = 0;
  for (const p of plan) {
    const uq = `db.collection('narrate_history').doc('${p._id}').update({data:{content:${JSON.stringify(p.fullAfter)}}})`;
    const r = await call('databaseupdate', typeof uq === 'string' ? uq : uq);
    if (r.errcode === 0) { ok++; }
    else { fail++; console.error(`  ❌ seq=${p.seq} 更新失败: ${r.errcode} ${r.errmsg}`); }
  }
  console.log(`\n✅ 修正完成：成功 ${ok} 条，失败 ${fail} 条`);
})().catch(e => console.error('❌', e.message));
