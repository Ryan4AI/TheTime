// 压缩触发条件模拟（纯逻辑，不连 DB、不调 LLM）
// 验证 2026-09-16 修法：整百取模 → 按间隔（首次 200 / 后续 100）
// 条件复制自 cloudfunctions/ai_narrate_worker/index.js compressHistoryIfNeeded（改动后）
const fs = require('fs');
const path = require('path');

// 与 worker 保持一致的触发判定
function shouldCompress(newestSeq, lastSeq) {
  if (newestSeq === null) return false;
  const baseSeq = (typeof lastSeq === 'number' && lastSeq > 0) ? lastSeq : 0;
  const triggerGap = 200; // 见 index.js 注释：设 100 会退化成每轮压 3 条
  if (newestSeq - baseSeq < triggerGap) return false;
  const targetSeq = Math.min(baseSeq + 100, newestSeq - 100); // 每批只前进 100 条
  if (targetSeq <= baseSeq) return false;
  return targetSeq;
}
// 旧逻辑（对照）
function shouldCompressOld(newestSeq, lastSeq) {
  if (newestSeq === null) return false;
  const targetSeq = newestSeq - 100;
  if (newestSeq % 100 !== 0 || targetSeq <= (lastSeq || 0)) return false;
  return targetSeq;
}

// 实测锚点：seq 600-699 共 100 条 = 18,964 字符 ≈ 13.3K token（tmp_compress_feed.js 09-16 实测）
const CHARS_PER_MSG = 18964 / 100;
const tok = (n) => Math.round(n / 1.43);
const feedChars = (keepCount) => Math.round(keepCount * CHARS_PER_MSG);

function simulate(label, startLastSeq, fromSeq, toSeq, step, fn) {
  let lastSeq = startLastSeq;
  const fires = [];
  for (let s = fromSeq; s <= toSeq; s += step) {
    const t = fn(s, lastSeq);
    if (t !== false) { fires.push({ seq: s, target: t, keep: s - t }); lastSeq = t; }
  }
  console.log(`\n[${label}] 起点 lastSeq=${startLastSeq}  seq ${fromSeq}→${toSeq} step=${step}`);
  if (!fires.length) console.log('  ❌ 全程未触发任何压缩');
  fires.slice(0, 8).forEach(f => {
    const c = feedChars(f.keep);
    console.log(`  seq=${f.seq} 压到 ${f.target}  本次压 ${f.target - (fires[fires.indexOf(f) - 1] ? fires[fires.indexOf(f) - 1].target : 0)} 条  保留 ${f.keep} 条 ≈ ${c} 字符 / ${tok(c)} token`);
  });
  const keeps = fires.map(f => f.keep);
  const minKeep = Math.min(...keeps), maxKeep = Math.max(...keeps);
  if (keeps.length) console.log(`  保留条数区间 = ${minKeep}..${maxKeep}（设计下限 100）`);
  return { fires, minKeep, maxKeep };
}

console.log('=== 旧逻辑（HEAD，整百取模）===');
const oldA = simulate('当前真实：lastSeq=400', 400, 699, 1500, 3, shouldCompressOld);

console.log('\n=== 新逻辑（PMO 修法，按间隔）===');
const newA = simulate('当前真实：lastSeq=400', 400, 699, 1500, 3, shouldCompress);
const newB = simulate('新的一世：无压缩记录', null, 3, 900, 3, shouldCompressNewWrap);
function shouldCompressNewWrap(s, l) { return shouldCompress(s, l); }

// 断言
const checks = [
  ['旧逻辑：下一次补压要熬到 seq≥900（中间 67 轮持续膨胀）', oldA.fires.length === 0 || oldA.fires[0].seq >= 900],
  ['新逻辑：lastSeq=400 起点能补压', newA.fires.length > 0],
  ['新逻辑：保留条数始终 ≥100', newA.minKeep >= 100 && newB.minKeep >= 100],
  ['新逻辑：首次触发在 seq≈200（沿用原设计）', newB.fires[0] && newB.fires[0].seq <= 201 && Math.abs(newB.fires[0].target - 100) <= 1],
  ['新逻辑：无「每轮压几条」退化（每批压入量 ≥50 条）', newA.fires.every((f, i) => i === 0 || f.target - newA.fires[i - 1].target >= 50)],
  ['新逻辑：每批压入量 ≤100 条（摘要输入不翻倍，先生顾虑点）', newA.fires.every((f, i) => i === 0 || f.target - newA.fires[i - 1].target <= 100)],
  ['新逻辑：稳态（追赶期后）触发间隔 ≥30 轮', (() => {
    const steady = newA.fires.slice(3); // 前几次是补压追赶（每轮追 100 条，预期密集）
    return steady.length >= 2 && steady.every((f, i) => i === 0 || f.seq - steady[i - 1].seq >= 90);
  })()],
  ['新逻辑：保留条数 ≤200（喂量峰值受控）', newA.maxKeep <= 200 && newB.maxKeep <= 200],
];
console.log('\n=== 断言 ===');
let pass = 0;
checks.forEach(([name, ok]) => { console.log(`${ok ? '✅' : '❌'} ${name}`); if (ok) pass++; });
console.log(`\n结果：${pass}/${checks.length} 通过`);
process.exit(pass === checks.length ? 0 : 1);
