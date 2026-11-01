#!/usr/bin/env node
/**
 * 封档用：把云数据库全量导出成本地 JSON。
 *
 * 用法：node scripts/archive_dump_db.js [输出目录]
 * 默认输出：data/archive-db-YYYY-MM-DD/<collection>.json
 *
 * 依赖：scripts/q_db.js 的 dbQuery（复用同一套微信云开发 HTTP 查询通道）
 */
const fs = require('fs');
const path = require('path');
const { dbQuery } = require('./q_db');

const COLLECTIONS = [
  // 基础历史数据
  'era_meta', 'era_cities', 'era_age_dist', 'social_structure', 'event',
  // 玩家与运行日志
  'player', 'player_life', 'narrate_history', 'llm_io',
  // 榜单
  'leaderboards',
];

const PAGE = 1000;

async function count(name) {
  const r = await dbQuery(`db.collection('${name}').count()`, true);
  return r.count || 0;
}

async function page(name, skip) {
  const r = await dbQuery(`db.collection('${name}').skip(${skip}).limit(${PAGE}).get()`, false);
  // 微信接口返回 data: [ "<json string>", ... ]
  return (r.data || []).map((d) => (typeof d === 'string' ? JSON.parse(d) : d));
}

(async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = process.argv[2] || path.join('data', `archive-db-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];
  for (const name of COLLECTIONS) {
    let total = 0;
    try {
      total = await count(name);
    } catch (e) {
      summary.push({ collection: name, total: -1, error: e.message });
      continue;
    }

    const rows = [];
    for (let skip = 0; skip < total; skip += PAGE) {
      const batch = await page(name, skip);
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }

    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows, null, 1));
    summary.push({ collection: name, total, dumped: rows.length });
    console.log(`${name}: ${rows.length}/${total}`);
  }

  fs.writeFileSync(path.join(outDir, '_summary.json'), JSON.stringify({
    exportedAt: new Date().toISOString(),
    envId: 'cloud1-d5gkbowyvbd1c85e1',
    collections: summary,
  }, null, 2));

  const missing = summary.filter((s) => s.total !== s.dumped);
  console.log(`\n完成 → ${outDir}`);
  if (missing.length) {
    console.log('⚠️ 数量不一致：', JSON.stringify(missing));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exitCode = 1;
});
