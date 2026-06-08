#!/usr/bin/env node
/**
 * 调用 MiniMax-M2.7 给一批 event 推断 month
 * 输入：data/events_batch_*.json
 * 输出：data/events_inferred_v2_<batch>.json
 *
 * 约束（Q3=C 折中）：
 * - LLM 不确定就 month=null（不进库，进 skip 列表）
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const MM_API_KEY = process.env.MM_API_KEY || 'sk-cp-c5wSwWsnIcUkewTEe9JhETRKZNyJ1OBnphm_4B1HdOV0LMNh9vP80kJFBKZV5jpCtp22_xyBUtF0zRAwgWaxU4YECc_LL8GPzEj6GVOHmMiovcfwylDgCDM'
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7'
const BATCH_SIZE = 8  // 一次送 8 条给 LLM

function callLLM(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MM_MODEL, messages, max_tokens: 4000, temperature: 0.3,
    })
    const url = new URL(MM_BASE_URL + '/chat/completions')
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MM_API_KEY },
      timeout: 60000,
    }, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`))
        try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('JSON parse: ' + body.substring(0, 200))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(data)
    req.end()
  })
}

const SYSTEM_PROMPT = `你是中国历史事件月份推断专家。

任务：根据事件描述和已知年份，推断事件最可能发生的月份（1-12）。

铁律：
1. **不确定就 month=null**。宁可留空，不要猜。
2. 严格基于史料常识（春节 1-2 月、科举秋闱 8-9 月、战事多春秋两季、登基多在先帝崩后、立春 2 月等）。
3. 同一事件有公认月份的按公认，无史料精确月份的按习俗/季节推断。
4. 输出必须是合法 JSON 数组，每条对应一条输入事件。

输出格式：
[
  {"_id": "原事件_id", "month": 数字1-12, "confidence": "high"|"medium"|"low", "reason": "一句话推断依据"},
  {"_id": "...", "month": null, "confidence": "low", "reason": "史料无明确月份，按 X 季习俗推断"}
]

month 为 null 时，confidence=low，reason 解释为什么不填。`

// 兼容 BSON _id 和字符串 _id
function getId(e) { return e._id?.$oid || e._id }
function getYear(e) { return e.year?.$numberInt || e.year }

async function inferBatch(events) {
  const results = []
  const total = Math.ceil(events.length / BATCH_SIZE)
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const sub = events.slice(i, i + BATCH_SIZE)
    const userPrompt = '请为以下 ' + sub.length + ' 条事件推断月份：\n\n' +
      sub.map((e, idx) => `[${idx + 1}] _id: ${getId(e)}\n年份: ${getYear(e)}\n标题: ${e.title}\n描述: ${e.desc}\n城市: ${e.city || '未知'}`).join('\n\n')

    const batchNo = Math.floor(i / BATCH_SIZE) + 1
    process.stdout.write(`  → 子批次 ${batchNo}/${total}（${sub.length} 条）... `)
    let resp
    try {
      resp = await callLLM([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ])
    } catch (e) {
      console.log('❌ 失败：' + e.message)
      // 失败时把子批次标记为 retry
      sub.forEach(e => results.push({ _id: getId(e), month: null, confidence: 'low', reason: 'LLM调用失败：' + e.message, _error: true }))
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    const content = resp.choices?.[0]?.message?.content || ''
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim()
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    const jsonStr = (firstBracket !== -1 && lastBracket !== -1) ? cleaned.substring(firstBracket, lastBracket + 1) : cleaned

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      console.log('❌ JSON 解析失败：' + e.message)
      console.log('    原始: ' + content.substring(0, 200))
      sub.forEach(e => results.push({ _id: getId(e), month: null, confidence: 'low', reason: 'JSON解析失败', _error: true }))
      continue
    }

    if (!Array.isArray(parsed)) {
      console.log('❌ 返回非数组')
      sub.forEach(e => results.push({ _id: getId(e), month: null, confidence: 'low', reason: 'LLM返回非数组', _error: true }))
      continue
    }

    // 合并原事件数据 + 推断结果
    for (let j = 0; j < sub.length; j++) {
      const inf = parsed[j] || {}
      results.push({
        _id: getId(sub[j]),
        year: getYear(sub[j]),
        title: sub[j].title,
        desc: sub[j].desc,
        city: sub[j].city,
        type: sub[j].type,
        scope: sub[j].scope,
        month: (typeof inf.month === 'number' && inf.month >= 1 && inf.month <= 12) ? inf.month : null,
        confidence: inf.confidence || 'low',
        reason: inf.reason || 'LLM未返回',
      })
    }
    console.log(`✅ ${parsed.length} 条`)
    await new Promise(r => setTimeout(r, 1500))  // 节流
  }
  return results
}

// ─── 入口 ───
async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.log('用法: node infer_event_month.js <batch_json> [limit]')
    console.log('示例: node infer_event_month.js data/events_batch_B1_政治外交.json 5')
    process.exit(1)
  }
  const limit = parseInt(process.argv[3] || '0', 10)

  const data = JSON.parse(fs.readFileSync(arg, 'utf-8'))
  // 兼容两种结构：{ batch, list } 或 纯数组
  let events = Array.isArray(data) ? data : data.list
  if (limit > 0) events = events.slice(0, limit)
  const label = data.batch || path.basename(arg)
  console.log(`\n🧠 推断 ${events.length} 条事件 month（批次：${label}）`)

  const results = await inferBatch(events)

  const inferred = results.filter(r => r.month !== null)
  const skipped = results.filter(r => r.month === null)
  const errored = results.filter(r => r._error)

  const out = {
    batch: data.batch,
    total: results.length,
    inferred: inferred.length,
    skipped: skipped.length,
    errored: errored.length,
    results,
  }
  const outPath = arg.replace('events_batch_', 'events_inferred_v2_')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')

  console.log(`\n📊 结果：`)
  console.log(`  推断成功: ${inferred.length}`)
  console.log(`  跳过(null): ${skipped.length}`)
  console.log(`  错误: ${errored.length}`)
  console.log(`  → 已写入 ${outPath}\n`)

  // 给先生看 5 条样本
  console.log('📝 样本（前 5 条）：')
  results.slice(0, 5).forEach((r, i) => {
    const m = r.month !== null ? `${r.month}月` : 'NULL'
    console.log(`  [${i+1}] ${r.year} | ${m} | conf=${r.confidence} | ${r.title}`)
    console.log(`       依据: ${r.reason}`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
