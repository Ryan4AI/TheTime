const { execSync } = require('child_process')
const fs = require('fs')
const data = JSON.parse(fs.readFileSync('data/event_month_manual.json', 'utf-8'))
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
    if (parseInt(r.n?.$numberInt || r.n) === 0) {
      console.log('未匹配:', x._id, '|', x.title)
    }
  } catch (e) {
    console.log('错误:', x._id, '|', e.message.substring(0, 100))
  }
}
