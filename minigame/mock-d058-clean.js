// Mock D058 clean_narrate_history 扩展版
const Module = require('module')
const path = require('path')

const fakeStore = []  // 模拟云端数据
let removedRecords = []

// 模拟 db.command
const cmdMock = {
  in: (arr) => ({ __cmd: 'in', value: arr }),
}

const fakeDb = {
  collection: () => {
    const self = {
      command: cmdMock,
      where: (cond) => {
        if (cond && cond._id && cond._id.__cmd === 'in') {
          self._filterIds = new Set(cond._id.value)
        }
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
        const toRemove = self._filterIds || new Set(removedRecords)
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
  console.log('=== D058 clean_narrate_history 扩展 mock 测试 ===\n')

  fakeStore.length = 0
  fakeStore.push(
    { _id: 'a1', openid: 'mock_openid_chenruibiao', content: '初始回合', role: 'ai', message_id: 1 },
    { _id: 'a2', openid: 'mock_openid_chenruibiao', content: '初始回合', role: 'ai', message_id: 2 },
    { _id: 'a3', openid: 'mock_openid_chenruibiao', content: '初始回合', role: 'ai', message_id: 3 },
    { _id: 'b1', openid: 'mock_openid_chenruibiao', content: '正常1', role: 'user', message_id: 100 },
    { _id: 'b2', openid: 'mock_openid_chenruibiao', content: '正常2', role: 'ai', message_id: 101 },
    { _id: 'c1', openid: 'mock_openid_chenruibiao', content: '重复1', role: 'user', message_id: 100 },
    { _id: 'c2', openid: 'mock_openid_chenruibiao', content: '重复2', role: 'ai', message_id: 101 },
  )

  let ok = 0, fail = 0

  // Test 1: dryRun + clean_dirty
  console.log('--- Test 1: dryRun clean_dirty ---')
  const r1 = await cleanModule.main({ dryRun: true, mode: 'clean_dirty' })
  console.log('  total:', r1.stats.total, 'target:', r1.stats.target, 'clean:', r1.stats.clean)
  if (r1.success && r1.stats.total === 7 && r1.stats.target === 5 && r1.stats.clean === 2 && fakeStore.length === 7) {
    console.log('  ✅ 通过（3 初始 + 2 重复 = 5 脏，没真删）\n'); ok++
  } else { console.log('  ❌ 失败:', r1, '\n'); fail++ }

  // Test 2: clean_dirty 真删
  console.log('--- Test 2: clean_dirty 真删 ---')
  const r2 = await cleanModule.main({ dryRun: false, mode: 'clean_dirty' })
  console.log('  remaining:', fakeStore.length, 'removed:', r2.removed)
  if (r2.success && fakeStore.length === 2 && r2.removed === 5) {
    console.log('  ✅ 通过（删 5 条，剩 b1 b2）\n'); ok++
  } else { console.log('  ❌ 失败:', r2, '\n'); fail++ }

  // Test 3: by_ids 删指定
  console.log('--- Test 3: by_ids 删指定 b1 ---')
  const r3 = await cleanModule.main({ dryRun: false, mode: 'by_ids', ids: ['b1'] })
  console.log('  remaining:', fakeStore.length, 'removed:', r3.removed)
  if (r3.success && fakeStore.length === 1) {
    console.log('  ✅ 通过（删 b1，剩 b2）\n'); ok++
  } else { console.log('  ❌ 失败:', r3, '\n'); fail++ }

  // Test 4: all 全删
  console.log('--- Test 4: all 全删 ---')
  const r4 = await cleanModule.main({ dryRun: false, mode: 'all' })
  console.log('  remaining:', fakeStore.length, 'removed:', r4.removed)
  if (r4.success && fakeStore.length === 0 && r4.removed === 1) {
    console.log('  ✅ 通过（删剩余 1 条 b2）\n'); ok++
  } else { console.log('  ❌ 失败:', r4, '\n'); fail++ }

  // Test 5: by_ids 不存在的 id
  console.log('--- Test 5: by_ids 删不存在的 id ---')
  const r5 = await cleanModule.main({ dryRun: false, mode: 'by_ids', ids: ['nonexistent'] })
  console.log('  removed:', r5.removed, 'message:', r5.message)
  if (r5.success && r5.removed === 0 && r5.message === 'nothing_to_remove') {
    console.log('  ✅ 通过\n'); ok++
  } else { console.log('  ❌ 失败:', r5, '\n'); fail++ }

  console.log(`=== ${ok} 通过 / ${fail} 失败 ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FAIL:', e); process.exit(1) })