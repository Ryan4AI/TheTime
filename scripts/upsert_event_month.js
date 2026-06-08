#!/usr/bin/env node
/**
 * 批量更新 event 集合的 month 字段
 *
 * 1. 先查询原 event 备份到 data/event_backup_<timestamp>.json
 * 2. 用 _id 逐条 update，set: { month, month_provided: true, month_inferred_at: <timestamp> }
 * 3. 失败的记日志
 * 4. 全部完成后输出统计
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1'
const ITEMS_PATH = 'data/events_to_upsert.json'

async function tcbQuery(cmd) {
  const out = execSync(`npx tcb db nosql execute --command '${cmd}' --json`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
  return JSON.parse(out)
}

function quote(s) { return String(s).replace(/'/g, "\\'") }

async function upsertOne(item) {
  const id = item._id
  const month = item.month
  const ts = new Date().toISOString()

  // 腾讯云 TCB update 命令格式：updates 数组 + $set
  const cmd = JSON.stringify([{
    TableName: 'event',
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: 'event',
      updates: [{
        q: { _id: { $oid: id } },
        u: { $set: { month } },
        multi: false,
        upsert: false,
      }],
    }),
  }])

  try {
    const res = await tcbQuery(cmd)
    const r = res?.data?.results?.[0] || res?.data?.results
    if (res?.data?.message === 'success' || r?.ok === 1 || r?.updatedExisting) {
      return { _id: id, ok: true }
    }
    return { _id: id, ok: false, error: '未匹配到记录或更新失败', raw: JSON.stringify(res).substring(0, 300) }
  } catch (e) {
    return { _id: id, ok: false, error: e.message }
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf-8'))
  const items = data.items
  console.log(`\n📥 准备入库 ${items.length} 条 event.month 更新`)
  console.log(`   (先生审过：127 条 B1+B2 LLM 推断 + B3 12 条我手动推)\n`)

  // ── 第一步：备份 ──
  console.log('🔒 步骤 1/2: 备份原始 event 集合...')
  const findCmd = JSON.stringify([{
    TableName: 'event',
    CommandType: 'QUERY',
    Command: JSON.stringify({ find: 'event', filter: {}, limit: 500 }),
  }])
  const backup = await tcbQuery(findCmd)
  const ts = Date.now()
  const backupPath = `data/event_backup_${ts}.json`
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8')
  console.log(`   ✅ 备份写入 ${backupPath}（${backup.data?.results?.[0]?.length || '?'} 条）\n`)

  // ── 第二步：逐条 update ──
  console.log(`🔄 步骤 2/2: 逐条 update ${items.length} 条...`)
  const results = []
  let okCount = 0
  let failCount = 0
  for (let i = 0; i < items.length; i++) {
    const r = await upsertOne(items[i])
    results.push({ ...r, title: items[i].title, year: items[i].year, month: items[i].month })
    if (r.ok) okCount++
    else failCount++
    if ((i + 1) % 10 === 0 || i === items.length - 1) {
      console.log(`   进度: ${i + 1}/${items.length}  成功 ${okCount}  失败 ${failCount}`)
    }
  }

  // 写日志
  const logPath = `data/upsert_log_${ts}.json`
  fs.writeFileSync(logPath, JSON.stringify({ ok: okCount, fail: failCount, results }, null, 2), 'utf-8')

  console.log(`\n📊 结果：`)
  console.log(`   成功: ${okCount}`)
  console.log(`   失败: ${failCount}`)
  console.log(`   备份: ${backupPath}`)
  console.log(`   日志: ${logPath}`)

  if (failCount > 0) {
    console.log(`\n❌ 失败明细（前 10 条）：`)
    results.filter(r => !r.ok).slice(0, 10).forEach(r => {
      console.log(`   - ${r._id} | ${r.title} | ${r.error}`)
    })
  }
}

main().catch(e => { console.error('❌ 异常:', e); process.exit(1) })
