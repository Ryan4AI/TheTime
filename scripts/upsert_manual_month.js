const { execSync } = require('child_process')
const fs = require('fs')
const data = JSON.parse(fs.readFileSync('data/event_month_manual.json', 'utf-8'))
console.log('待入库 ' + data.length + ' 条')

let ok = 0, fail = 0
for (const x of data) {
  const cmd = JSON.stringify([{
    TableName: 'event',
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: 'event',
      updates: [{
        q: { _id: { $oid: x._id } },
        u: { $set: { month: x.month } },
        multi: false,
        upsert: false,
      }],
    }),
  }])
  try {
    const out = execSync(`npx tcb db nosql execute --command '${cmd}' --json`, { encoding: 'utf-8', maxBuffer: 5*1024*1024 })
    const m = out.match(/\{.*\}/s)
    const j = JSON.parse(m[0])
    const r = j.data.results[0][0]
    if (parseInt(r.n?.$numberInt || r.n) > 0) ok++
    else fail++
  } catch (e) {
    fail++
  }
}
console.log('成功: ' + ok + ' | 失败: ' + fail)
