// 查数据库 event vs 我 items 的 _id 对比
const { execSync } = require('child_process')
const fs = require('fs')

const out = execSync('npx tcb db nosql execute --command \'[{"TableName":"event","CommandType":"QUERY","Command":"{\\"find\\":\\"event\\",\\"filter\\":{},\\"limit\\":500}"}]\' --json', { encoding: 'utf-8', maxBuffer: 50*1024*1024 })
const data = JSON.parse(out)
const dbItems = data.data.results[0]

const my = JSON.parse(fs.readFileSync('data/events_to_upsert.json', 'utf-8')).items
const dbById = {}
for (const x of dbItems) {
  const id = x._id?.$oid || x._id
  dbById[id] = x
}

let found = 0, monthEqual = 0
const monthMismatch = []
for (const m of my) {
  if (dbById[m._id]) {
    found++
    const dbm = dbById[m._id].month?.$numberInt ?? dbById[m._id].month
    if (String(dbm) === String(m.month)) monthEqual++
    else monthMismatch.push({ _id: m._id, title: m.title, db_month: dbm, my_month: m.month })
  }
}

console.log('我 items 129 条 _id 在数据库:')
console.log('  找到:', found)
console.log('  month 一致:', monthEqual)
console.log('  month 不一致:', monthMismatch.length)
if (monthMismatch.length) {
  console.log('\n不一致样本（前 10）:')
  monthMismatch.slice(0, 10).forEach(x => {
    console.log(`  ${x._id} | ${x.title}`)
    console.log(`    数据库 month: ${x.db_month} | 我推断: ${x.my_month}`)
  })
}

// 数据库里 month 分布
const monthDist = {}
for (const x of dbItems) {
  const m = x.month?.$numberInt ?? x.month ?? 'null'
  monthDist[m] = (monthDist[m] || 0) + 1
}
console.log('\n数据库 event month 分布:')
Object.entries(monthDist).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
