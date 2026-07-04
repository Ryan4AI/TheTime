// Mock D058 clean_narrate_history 扩展（dryRun 返回 all_records + all_target_ids）
const Module = require('module')
const path = require('path')

const fakeStore = []
const cmdMock = { in: (arr) => ({ __cmd: 'in', value: arr }) }
const fakeDb = {
  collection: () => {
    const self = {
      command: cmdMock,
      where: (cond) => {
        if (cond && cond._id && cond._id.__cmd === 'in') self._filterIds = new Set(cond._id.value)
        return self
      },
      skip: () => self,
      limit: (n) => self,
      get: () => {
        const filtered = self._filterIds ? fakeStore.filter(r => self._filterIds.has(r._id)) : fakeStore
        self._filterIds = null
        return Promise.resolve({ data: filtered })
      },
      remove: () => {
        const before = fakeStore.length
        const toRemove = self._filterIds || new Set()
        for (let i = fakeStore.length - 1; i >= 0; i--) {
          if (toRemove.has(fakeStore[i]._id)) fakeStore.splice(i, 1)
        }
        self._filterIds = null
        return Promise.resolve({ deleted: before - fakeStore.length })
      },
    }
    return self
  },
  command: cmdMock,
}

const cloud = {
  init: () => {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: 'mock_openid_chenruibiao' }),
  DYNAMIC_CURRENT_ENV: 'thetime-rl6pe',
  command: cmdMock,
}

const origLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === 'wx-server-sdk') return cloud
  return origLoad.call(this, request, parent, ...rest)
}

const cleanModule = require(path.join(__dirname, '../cloudfunctions/clean_narrate_history/index.js'))

async function run() {
  console.log('=== D058 cloud 扩展 mock 测试 ===\n')

  fakeStore.length = 0
  fakeStore.push(
    { _id: 'a1', openid: 'mock_openid_chenruibiao', role: 'ai', content: '初始回合', message_id: 1, created_at: 1000 },
    { _id: 'a2', openid: 'mock_openid_chenruibiao', role: 'ai', content: '初始回合', message_id: 2, created_at: 2000 },
    { _id: 'b1', openid: 'mock_openid_chenruibiao', role: 'user', content: '正常1', message_id: 100, created_at: 3000 },
    { _id: 'c1', openid: 'mock_openid_chenruibiao', role: 'user', content: '重复', message_id: 100, created_at: 4000 },
    { _id: 'c2', openid: 'mock_openid_chenruibiao', role: 'ai', content: '重复2', message_id: 100, created_at: 5000 },
  )

  let ok = 0, fail = 0

  // Test 1: dryRun clean_dirty + 新字段
  console.log('--- Test 1: dryRun clean_dirty 新字段 ---')
  const r1 = await cleanModule.main({ dryRun: true, mode: 'clean_dirty' })
  console.log('  total:', r1.stats.total, 'target:', r1.stats.target)
  console.log('  all_target_ids:', r1.stats.all_target_ids)
  console.log('  all_records.length:', r1.stats.all_records ? r1.stats.all_records.length : 'undefined')
  if (r1.success &&
      r1.stats.total === 5 &&
      r1.stats.target === 4 &&  // 2 初始 + 2 重复
      Array.isArray(r1.stats.all_target_ids) && r1.stats.all_target_ids.length === 4 &&
      Array.isArray(r1.stats.all_records) && r1.stats.all_records.length === 5 &&
      fakeStore.length === 5) {
    console.log('  ✅ 通过\n'); ok++
  } else {
    console.log('  ❌ 失败\n'); fail++
  }

  // Test 2: dryRun all_records 精简（content 截 200 + 字段）
  console.log('--- Test 2: all_records 精简字段 ---')
  const r2 = await cleanModule.main({ dryRun: true, mode: 'clean_dirty' })
  const firstRec = r2.stats.all_records[0]
  const hasCorrectFields = firstRec._id && firstRec.role !== undefined && firstRec.content !== undefined && firstRec.created_at !== undefined
  console.log('  first record:', JSON.stringify(firstRec))
  if (hasCorrectFields) {
    console.log('  ✅ 通过（含 _id role content message_id created_at life_number）\n'); ok++
  } else {
    console.log('  ❌ 失败（字段缺失）\n'); fail++
  }

  // Test 3: 500+ 条截断
  console.log('--- Test 3: 500+ 条截断 ---')
  fakeStore.length = 0
  for (let i = 0; i < 600; i++) {
    fakeStore.push({ _id: 'r' + i, openid: 'mock_openid_chenruibiao', role: 'ai', content: 'msg' + i, message_id: i, created_at: 1000 + i })
  }
  const r3 = await cleanModule.main({ dryRun: true, mode: 'all' })
  console.log('  total:', r3.stats.total, 'all_records.length:', r3.stats.all_records.length, 'truncated:', r3.stats.all_records_truncated)
  if (r3.stats.total === 600 && r3.stats.all_records.length === 500 && r3.stats.all_records_truncated === 100) {
    console.log('  ✅ 通过（截 100 条）\n'); ok++
  } else {
    console.log('  ❌ 失败\n'); fail++
  }

  console.log(`=== ${ok} 通过 / ${fail} 失败 ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FAIL:', e); process.exit(1) })