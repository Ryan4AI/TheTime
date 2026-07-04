// Mock D057 clean_narrate_history — 真机云函数测，dryRun 默认 true
// 这里只测代码语法和 dryRun 逻辑，不真删

const Module = require('module')
const path = require('path')

// 真实 wx-server-sdk 跑不起来（要 init env），我们用本地 mock 测 dryRun 逻辑
// 直接 import 云函数代码，注入 mock cloud

let dbData = []
let getCallCount = 0
let removeCallCount = 0

const fakeDb = {
  collection: () => {
    const self = {
      _data: dbData,
      where: () => self,
      skip: () => self,
      limit: (n) => {
        // 模拟分页：每次 limit 取下一批
        const offset = self._fetched || 0
        const batch = self._data.slice(offset, offset + n)
        self._fetched = offset + batch.length
        if (batch.length < n) self._finished = true
        // 把 batch 暂存到 self._currentBatch，让 get 返回
        self._currentBatch = batch
        return self
      },
      get: () => {
        getCallCount++
        const data = self._currentBatch || []
        self._currentBatch = null
        // 如果 finished，下一次 limit 返回空
        if (self._finished && !self._secondPass) {
          self._secondPass = true
          self._fetched = 0
        }
        return Promise.resolve({ data })
      },
      remove: () => { removeCallCount++; return Promise.resolve({ deleted: 5 }) },
    }
    return self
  },
}

const cloud = {
  init: () => {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: 'mock_openid_chenruibiao' }),
  DYNAMIC_CURRENT_ENV: 'thetime-rl6pe',
}

// 拦截 require
const origLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === 'wx-server-sdk') return cloud
  return origLoad.call(this, request, parent, ...rest)
}

const cleanModule = require(path.join(__dirname, '../cloudfunctions/clean_narrate_history/index.js'))

async function run() {
  console.log('=== D057 clean_narrate_history dryRun 测试 ===\n')

  // 造脏数据：106 条 = 100 条'初始回合' + 6 条正常 + 5 条重复 message_id
  dbData = []
  for (let i = 0; i < 100; i++) {
    dbData.push({ _id: 'dirty_' + i, openid: 'mock_openid_chenruibiao', content: '初始回合', message_id: 1000 + i, role: 'ai', created_at: Date.now() })
  }
  for (let i = 100; i < 106; i++) {
    dbData.push({ _id: 'clean_' + i, openid: 'mock_openid_chenruibiao', content: '正常消息' + i, message_id: 2000 + i, role: 'ai', created_at: Date.now() })
  }
  // 5 条 message_id 重复（2000 重复 5 次）
  for (let i = 0; i < 5; i++) {
    dbData.push({ _id: 'dup_' + i, openid: 'mock_openid_chenruibiao', content: '重复' + i, message_id: 2000, role: 'user', created_at: Date.now() })
  }

  console.log(`造数据: ${dbData.length} 条（100 初始回合 + 6 正常 + 5 重复 message_id）`)

  const res = await cleanModule.main({ dryRun: true })

  console.log('\n结果:', JSON.stringify(res, null, 2))

  // 校验
  const checks = [
    ['success = true', res.success === true],
    ['dryRun = true', res.dryRun === true],
    ['stats.total = 111', res.stats && res.stats.total === 111],
    ['stats.dirty = 104', res.stats && res.stats.dirty === 104],  // 100 初始回合 + 4 dup_1~4（dup_0 是 first 不算）
    ['stats.clean = 7', res.stats && res.stats.clean === 7],
    ['removeCallCount = 0（dryRun 不删）', removeCallCount === 0],
    ['sample_dirty_content 有内容', res.stats && res.stats.sample_dirty_content && res.stats.sample_dirty_content.length > 0],
  ]

  for (const [name, pass] of checks) console.log(`  ${pass ? '✅' : '❌'} ${name}`)

  const allPass = checks.every(c => c[1])
  console.log(`\n=== ${allPass ? '全部通过' : '有失败'} ===`)
  process.exit(allPass ? 0 : 1)
}

run().catch(e => { console.error('FAIL:', e); process.exit(1) })