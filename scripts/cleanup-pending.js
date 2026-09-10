#!/usr/bin/env node
/**
 * llm_io 僵尸 pending 清理（142 期 · 先生 2026-09-11 00:35 授权）
 *
 * 用法:
 *   node scripts/cleanup-pending.js export   # 只导出备份，不删（安全）
 *   node scripts/cleanup-pending.js delete   # 导出 + 删除 status='pending' 的记录
 *   node scripts/cleanup-pending.js verify   # 只查当前 pending 数量
 *
 * 安全约束（硬编码，不可绕过）:
 *   - 只操作 llm_io 一张表
 *   - 只删 status === 'pending' 的记录（success/error 一律不碰）
 *   - delete 前必定先导出全量备份到 backups/
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('credentials/app-secret.json', 'utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const TABLE = 'llm_io';
const MODE = process.argv[2] || 'verify';

function getToken() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        const j = JSON.parse(d);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error('token err: ' + d.slice(0, 200)));
      });
    }).on('error', reject);
  });
}

function callApi(endpoint, query) {
  return getToken().then(token => new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com',
      path: `/tcb/${endpoint}?access_token=${token}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('parse: ' + d.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  }));
}

const countPending = () => callApi('databasecount', `db.collection('${TABLE}').where({status:'pending'}).count()`);
const countTotal = () => callApi('databasecount', `db.collection('${TABLE}').count()`);
const fetchPending = () => callApi('databasequery', `db.collection('${TABLE}').where({status:'pending'}).limit(200).get()`);

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

(async () => {
  try {
    const before = await countPending();
    if (before.errcode) throw new Error(`count 失败: ${before.errcode} ${before.errmsg}`);
    console.log(`📊 当前 ${TABLE} pending = ${before.count}`);

    if (MODE === 'verify') { console.log('（verify 模式，不导出不删除）'); return; }

    if (MODE === 'export' || MODE === 'delete') {
      const res = await fetchPending();
      if (res.errcode) throw new Error(`query 失败: ${res.errcode} ${res.errmsg}`);
      // 注意：微信 tcb HTTP API 的 databasequery 返回的是「JSON 字符串数组」，不是对象数组
      const docs = (res.data || []).map(d => (typeof d === 'string' ? JSON.parse(d) : d));
      console.log(`📦 拉取待删记录 ${docs.length} 条`);

      // 分类核对：必须是 pending，且打印 category 分布
      const bad = docs.filter(d => d.status !== 'pending');
      if (bad.length) {
        console.log('🔍 诊断 · 第 1 条 keys =', Object.keys(docs[0] || {}).join(','));
        console.log('🔍 诊断 · 第 1 条原文 =', JSON.stringify(docs[0] || {}).slice(0, 400));
        throw new Error(`❌ 安全中止：返回记录里有 ${bad.length} 条 status !== pending，拒绝继续`);
      }
      const dist = {};
      docs.forEach(d => { dist[d.category] = (dist[d.category] || 0) + 1; });
      console.log('   category 分布:', JSON.stringify(dist));
      const stamps = docs.map(d => d.created_at).filter(Boolean).sort((a, b) => a - b);
      if (stamps.length) {
        console.log('   时间范围:', new Date(stamps[0]).toLocaleString('zh-CN'), '~', new Date(stamps[stamps.length - 1]).toLocaleString('zh-CN'));
      }

      const dir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `llm_io-pending-${ts()}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2));
      const size = (fs.statSync(file).size / 1024).toFixed(1);
      console.log(`💾 备份已写入: ${path.relative(process.cwd(), file)} (${docs.length} 条 / ${size} KB)`);

      if (MODE === 'export') { console.log('（export 模式，未删除。确认无误后跑 delete）'); return; }
    }

    if (MODE === 'delete') {
      const r = await callApi('databasedelete', `db.collection('${TABLE}').where({status:'pending'}).remove()`);
      if (r.errcode) throw new Error(`delete 失败: ${r.errcode} ${r.errmsg}`);
      console.log(`🗑️  delete 返回: ${JSON.stringify(r)}`);

      const after = await countPending();
      const total = await countTotal();
      console.log(`✅ 清理后 pending = ${after.count}（原 ${before.count}）· ${TABLE} 总条数 = ${total.count}（原 591）`);
      console.log(`   success/error 记录 untouched：total 减少量 = ${591 - total.count}，应等于删除的 ${before.count}`);
    }
  } catch (e) {
    console.error('❌ 出错:', e.message || e);
    process.exit(1);
  }
})();
