#!/usr/bin/env node
/**
 * 读取 event 集合所有事件，统计 month 缺失情况
 */

const { execSync } = require('child_process')
const fs = require('fs')

const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1'

// 查 event 集合所有数据
const findCmd = `tcb db nosql execute --command '[{"TableName":"event","CommandType":"QUERY","Command":"{\\"find\\":\\"event\\",\\"filter\\":{},\\"limit\\":500}"}]' --json`

try {
  const output = execSync(findCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
  const data = JSON.parse(output)
  const resultArray = data.data?.results?.[0]

  if (!Array.isArray(resultArray)) {
    console.log('返回结构调试:', JSON.stringify(data, null, 2).slice(0, 2000))
    process.exit(1)
  }

  const events = resultArray
  let totalWithMonth = 0
  let totalNoMonth = 0
  const noMonthList = []

  for (const ev of events) {
    const month = ev.month
    if (typeof month === 'number' && month >= 1 && month <= 12) {
      totalWithMonth++
    } else {
      totalNoMonth++
      noMonthList.push({
        _id: typeof ev._id === 'string' ? ev._id : ev._id?.$oid || JSON.stringify(ev._id),
        title: ev.title,
        year: ev.year?.$numberInt || ev.year,
        month: month,
        type: ev.type,
        scope: ev.scope,
        city: ev.city,
        desc: (ev.desc || '').slice(0, 60)
      })
    }
  }

  console.log(`总事件数: ${events.length}`)
  console.log(`已有 month: ${totalWithMonth}`)
  console.log(`缺失 month: ${totalNoMonth}`)
  console.log(`---`)

  // 看看有没有 dynasty 字段
  const hasDynasty = events.some(e => e.dynasty)
  console.log(`事件是否有 dynasty 字段: ${hasDynasty}`)

  // 按 type 统计
  const byType = {}
  for (const ev of events) {
    if (typeof ev.month !== 'number' || ev.month < 1 || ev.month > 12) {
      const t = ev.type || '未知'
      byType[t] = (byType[t] || 0) + 1
    }
  }
  console.log(`---按 type 统计（缺失 month）：`)
  Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v}`)
  })

  fs.writeFileSync(
    '/home/admin/workspace/TheTime/data/events_no_month.json',
    JSON.stringify({
      total: events.length,
      with_month: totalWithMonth,
      no_month: totalNoMonth,
      by_type: byType,
      list: noMonthList
    }, null, 2)
  )

  console.log(`---`)
  console.log(`已写入 data/events_no_month.json`)
  console.log(`---`)
  console.log(`前 20 条缺失 month 的事件：`)
  noMonthList.slice(0, 20).forEach((e, i) => {
    console.log(`${i+1}. [${e.year}] ${e.title} | type=${e.type} | scope=${e.scope}`)
  })

} catch (e) {
  console.error('读取失败:', e.message)
  process.exit(1)
}
