#!/usr/bin/env node
/**
 * 层 1「章回制」A/B 验证：改前 vs 改后 平均月推进 / 一世轮数
 * 用法： node scripts/ab_pacing.js <before|after> [turns]
 * 只读本地源码 + 调真实 DeepSeek，不写任何 DB（wx-server-sdk 已打桩）。
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

const VARIANT = process.argv[2] || 'before';
const N = parseInt(process.argv[3] || '18', 10);
const ROOT = '/home/admin/workspace/TheTime';
const WORKER = path.join(ROOT, 'cloudfunctions/ai_narrate_worker/index.js');

// ---- 1) stub wx-server-sdk ----
const stub = {
  init() {}, DYNAMIC_CURRENT_ENV: 'x',
  database: () => ({
    collection: () => ({
      where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }), get: async () => ({ data: [] }), count: async () => ({ total: 0 }) }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      add: async () => ({}), doc: () => ({ update: async () => ({}) }),
    }),
    command: {},
  }),
  getWXContext: () => ({ OPENID: 'sim' }),
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return stub;
  if (request === './parse-ai-output') return origLoad.call(this, path.join(ROOT, 'cloudfunctions/ai_narrate_worker/parse-ai-output.js'), parent, isMain);
  return origLoad.apply(this, arguments);
};

// ---- 2) load source, patch if 'after' ----
let SRC = fs.readFileSync(WORKER, 'utf8');

function replaceBetween(src, startAnchor, endAnchor, replacement) {
  const i = src.indexOf(startAnchor);
  if (i < 0) throw new Error('anchor start not found: ' + startAnchor.slice(0, 30));
  const j = src.indexOf(endAnchor, i);
  if (j < 0) throw new Error('anchor end not found: ' + endAnchor.slice(0, 30));
  return src.slice(0, i) + replacement + src.slice(j + endAnchor.length);
}

if (VARIANT === 'after') {
  // P1: 节奏段 起承转合 -> 章回制
  SRC = replaceBetween(
    SRC,
    '`# 节奏（无事件月专用）`,',
    '不强行套起承转合。`,',
    [
      '`# 节奏（章回制）`,',
      '``,',
      '`- 把这一世当成"章回体说书"，不是一天的流水账。`,',
      '`- 一回 = 一个完整目标/冲突，跨 3~6 轮：开篇抛出目标/麻烦 → 中段 2~3 轮遇人与阻碍 → 收束并埋下下一回的引子。`,',
      '`- 一轮只推进"这一步"，结尾必须留一个未解钩子，不要写成闭合小节（不要每轮都"铺陈—互动—发现—收束"自成一篇）。`,',
      '`- 平淡年月必须压缩跳年：没有大事的岁月用一句蒙太奇带过——"一晃三年，孩子能满地跑了""又过了两个冬天，你在镇上站住了脚"。只把镜头对准有变化、有抉择的时刻。`,',
      '`- 国家级事件月（5-10 轮）：遵循"历史事件段"的进度，不强行套章回。`,',
    ].join('\n')
  );
  // P1b: 写作守则里的"1~2 轮快速推进日常剧情，不要拖沓" 强化
  SRC = SRC.replace(
    '`- 如果当前无历史事件，1~2 轮快速推进日常剧情，不要拖沓`,',
    '`- 无历史事件时不要逐月磨日常：无事发生的年月用一句蒙太奇跳年（"一晃三年…"），只写有变化、有抉择的时刻`,'
  );
  // P3: AI₂ month_delta 判定段 60 放胆
  SRC = SRC.replace(
    '`- 60：跨五年以上——极罕见，剧情必须有明确的长时间跨度描写`,',
    '`- 60：跨五年以上——当剧情明确写出跨年/数年时照实给，不必保守`,'
  );
  // P4: 时间跨度分布
  SRC = replaceBetween(
    SRC,
    'const MONTH_DELTA_WEIGHTS = [',
    ']',
    [
      'const MONTH_DELTA_WEIGHTS = [',
      '  { value: 0,  weight: 25 },',
      '  { value: 1,  weight: 20 },',
      '  { value: 6,  weight: 15 },',
      '  { value: 12, weight: 15 },',
      '  { value: 36, weight: 15 },',
      '  { value: 60, weight: 10 },',
      ']',
    ].join('\n')
  );
}

// ---- 3) compile with exposed internals ----
const EXPOSE = '\nmodule.exports.__probe = { buildSystemPrompt, callLLM, callScoringAI, applyPatch, weightedRandom, MONTH_DELTA_WEIGHTS, parseAIOutput };\n';
const m = new Module('sim', null);
m._compile(SRC + EXPOSE, path.join(ROOT, 'cloudfunctions/ai_narrate_worker/sim.js'));
const P = m.exports.__probe;

// ---- 4) API key ----
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloudbaserc.json'), 'utf8'));
process.env.DS_API_KEY = cfg.functions.find(f => f.name === 'ai_narrate_worker').envVariables.DS_API_KEY;
// reload module so DS_API_KEY (read at load-time) is set
const m2 = new Module('sim2', null);
m2._compile(SRC + EXPOSE, path.join(ROOT, 'cloudfunctions/ai_narrate_worker/sim2.js'));
const P2 = m2.exports.__probe;

// ---- 5) hint 文本（old = 线上原文，new = 草案）----
const OLD_HINTS = {
  0: '即将生成的剧情建议按同日到几天的节奏设计，不跨月。聚焦当天发生的事——一场对话、一次赶集、一日劳作。',
  1: '即将生成的剧情建议按跨月的节奏设计（约一个月）。用自然过渡体现——"入秋了""年关将近""月余过去"。',
  2: '即将生成的剧情建议按跨一个季节的节奏设计（如冬→春、夏→秋），用自然节律体现时间流逝——"河面的冰开始化了""院子里的桂树开了"。',
  3: '即将生成的剧情建议按跨一个季度的节奏设计，用季节变化带过——"春种忙完，入夏后……""秋收过后，日子清闲下来"。',
  6: '即将生成的剧情建议按跨半年的节奏设计，用季节/节气自然带过——"入秋后""开春以来""半年过去"。半年跨度可能有较大变化，选最重要的写。',
  12: '即将生成的剧情建议按跨一年的节奏设计，用年份变化体现——"一年就这么过去了""又到了年关"。适合用标志性事件标记这一年。',
  60: '即将生成的剧情建议按跨五年以上的节奏设计，必须有强叙事理由——"五年后，孩子已经能在院子里跑了"。用蒙太奇手法一笔带过中间年月。',
};
const OLD_LABELS = { 0: '同日到几天', 1: '约一个月', 2: '一季', 3: '一个季度', 6: '半年', 12: '一年', 60: '五年以上' };
const NEW_HINTS = {
  0: '本轮基调：同日到几天，聚焦当下这一刻的关键抉择；若本轮是章末，结尾留一个悬念钩子。',
  1: '本轮基调：约一个月，用自然过渡体现时间流逝（"入秋了""月余过去"）。',
  6: '本轮基调：半年。必须在叙事里明写时间流逝（"入秋后半年过去""开春以来"）。',
  12: '本轮基调：一年。必须明写跨年——"一年就这么过去了""又到了年关"。',
  36: '本轮基调：三年。必须用一句蒙太奇明写跳跃——"一晃三年，……"，中间年月一笔带过。',
  60: '本轮基调：五年以上。必须用蒙太奇明写——"五年后，孩子已经能满地跑了"，要有强叙事理由。',
};
const NEW_LABELS = { 0: '同日到几天', 1: '约一个月', 6: '半年', 12: '一年', 36: '三年', 60: '五年以上' };
function hintFor(delta) {
  if (VARIANT === 'after' || VARIANT === 'src') return `【本轮基调参考：${NEW_LABELS[delta]}】${NEW_HINTS[delta]}注意：只有"开启新的一幕"时才按这个跨度跳时间；若本轮是接着演当前这一幕（幕内），一律不跳、按同日处理。跳时间只能发生在幕与幕之间。`;
  const lab = OLD_LABELS[delta] || '几天到一个月';
  const h = OLD_HINTS[delta] || OLD_HINTS[1];
  return `【时间跨度：${lab}】${h}时间跨度仅为系统建议，如果当前剧情不适合按此跨度推进，可灵活调整，以剧情连贯性优先。`;
}

// ---- 6) seed state ----
const SEED = {
  life_number: 1, name: '沈砚', gender: '男', age: 25, occupation: '铁匠学徒', socialClass: '庶人',
  dynasty: '北宋', eraDisplay: '熙宁年间', city: '开封', year: 1070, month: 3, round: 0,
  coin: 1200, items: [{ name: '旧铁锤', icon: '🔨', durability: 80 }], legacy: '', alive: true, lifespan: 70,
  '声望': 120, '财富': 260, '学识': 80, '颜值': 300, '医术': 0, '战功': 0, '文采': 40, '政绩': 0, '义行': 20,
};
let state = JSON.parse(JSON.stringify(SEED));
const history = [];  // [{role, content}]
const extractions = [];

const fmtReminder = '【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。';

function histMsgs(history) {
  const slice = history.slice(-16);
  const aiIdxs = []; slice.forEach((m, i) => { if (m.role === 'ai') aiIdxs.push(i); });
  const demo = new Set(aiIdxs.slice(-8));
  const out = [];
  slice.forEach((m, i) => {
    if (m.role === 'ai') out.push({ role: 'assistant', content: demo.has(i) && m.options && m.options.length ? JSON.stringify({ content: m.content, options: m.options }) : m.content });
    else if (m.role === 'system') out.push({ role: 'system', content: m.content || '' });
    else out.push({ role: 'user', content: m.content });
  });
  return out;
}

function extractContent(raw) {
  try { const o = JSON.parse(raw); if (o && typeof o.content === 'string') return { content: o.content, options: Array.isArray(o.options) ? o.options : [] }; } catch (e) {}
  try { const p = P.parseAIOutput(raw); if (p && p.content) return { content: p.content, options: p.options || [] }; } catch (e) {}
  const mm = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (mm) { try { return { content: JSON.parse('"' + mm[1] + '"'), options: [] }; } catch (e) { return { content: mm[1], options: [] }; } }
  return { content: raw.slice(0, 200), options: [] };
}

async function run() {
  console.log(`\n===== VARIANT=${VARIANT}  turns=${N} =====`);
  let input = '开始';
  for (let t = 0; t < N; t++) {
    const delta = P2.weightedRandom(P2.MONTH_DELTA_WEIGHTS);
    const hint = hintFor(delta);
    const sys = P2.buildSystemPrompt(state, null);
    const messages = [{ role: 'system', content: sys }, ...histMsgs(history), { role: 'system', content: hint }, { role: 'user', content: fmtReminder }, { role: 'user', content: input }];

    let content = '', options = [];
    try {
      const resp = await P2.callLLM(messages, 'deepseek-flash', {});
      const raw = resp.choices[0].message.content;
      const parsed = extractContent(raw);
      content = parsed.content; options = parsed.options;
    } catch (e) { console.log(`  turn${t} AI1 FAIL: ${e.message}`); break; }
    history.push({ role: 'user', content: input });
    history.push({ role: 'ai', content, options });

    // AI₂ 判分
    let md = 0, patch = {};
    try {
      const r = await P2.callScoringAI(content, state, history.slice(0, -1), input);
      patch = r.attrPatch || {};
      md = typeof patch.month_delta === 'number' ? patch.month_delta : 0;
    } catch (e) { console.log(`  turn${t} AI2 FAIL: ${e.message}`); }

    const skip = /一晃|又过|年过去|几年|多年|年间|数载|三个春秋|岁月/.test(content);
    extractions.push({ t, suggested: delta, judged: md, chars: content.length, skipWord: skip });
    console.log(`  t${t}: 建议=${delta} 判=${md} 字数=${content.length} 跳年词=${skip ? 'Y' : '-'}`);
    if (process.env.DUMP) console.log(`    「${content.replace(/\n/g, ' ')}」`);

    state = P2.applyPatch(state, { ...state }, patch);
    const st = state.story
    if (st) {
      const card = `回目=${st.arc || '-'} | 抉择=${st.question || '-'} | 伏笔=${(st.threads || []).map(x => x.text + (x.since ? '(' + x.since + ')' : '')).join(' / ') || '-'} | 人物=${(st.npcs || []).map(x => x.name).join('/') || '-'}`
      console.log(`     ↳卡: ${card}`)
      extractions[extractions.length - 1].story = st
    }
    input = options[0] || '继续';
    if ((state.age || 0) >= (state.lifespan || 70)) { console.log('  -> 寿限到，结束'); break; }
  }

  const n = extractions.length;
  const avgJ = n ? extractions.reduce((s, x) => s + x.judged, 0) / n : 0;
  const avgS = n ? extractions.reduce((s, x) => s + x.suggested, 0) / n : 0;
  const medJ = n ? [...extractions.map(x => x.judged)].sort((a, b) => a - b)[Math.floor(n / 2)] : 0;
  const months = ((state.lifespan || 70) - SEED.age) * 12;
  const turnsPerLife = avgJ > 0 ? Math.round(months / avgJ) : Infinity;
  console.log(`\n--- ${VARIANT} 汇总 ---`);
  console.log(`轮数=${n}  平均建议=${avgS.toFixed(2)}  平均判定=${avgJ.toFixed(2)}  中位判定=${medJ}  跳年词占比=${(extractions.filter(x => x.skipWord).length / n * 100).toFixed(0)}%`);
  console.log(`推一世轮数 = ${months}月 / ${avgJ.toFixed(2)} ≈ ${turnsPerLife}`);
  fs.writeFileSync(`/tmp/ab_${VARIANT}.json`, JSON.stringify({ variant: VARIANT, n, avgS, avgJ, medJ, turnsPerLife, extractions }, null, 2));
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
