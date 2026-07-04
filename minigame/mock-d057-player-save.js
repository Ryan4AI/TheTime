// Mock D057 player_save 重构 — 用 Module._load 拦截
const Module = require('module')
const path = require('path')

// 先拦截 require('wx-server-sdk')
const cloudMock = {
  init: () => {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: 'mock_openid_chenruibiao' }),
}
const fakeDb = {
  collection: (name) => {
    const ops = []
    return {
      _ops: ops,
      doc: (_id) => ({ ...self, _id }),
      where: (cond) => self,
      update: (opts) => { ops.push({ op: 'update', opts }); return Promise.resolve({ stats: { updated: 1 } }) },
      count: () => { ops.push({ op: 'count' }); return Promise.resolve({ total: 0 }) },
      add: (opts) => { ops.push({ op: 'add', opts }); return Promise.resolve({ _id: 'fake_' + Date.now() }) },
      get: () => Promise.resolve({ data: [] }),
      skip: () => self,
      limit: () => self,
      remove: () => Promise.resolve({ deleted: 0 }),
    }
    function self() { return self }
  },
}

const origResolve = Module._resolveFilename
const origLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === 'wx-server-sdk') return cloudMock
  return origLoad.call(this, request, parent, ...rest)
}

// 现在加载 player_save
const playerSaveModule = require(path.join(__dirname, '../cloudfunctions/player_save/index.js'))

async function run() {
  console.log('=== D057 player_save 重构 mock 测试 ===\n')

  let ok = 0, fail = 0

  // 测试 1：正常路径
  console.log('--- Test 1: player + player_life 正常路径 ---')
  const res1 = await playerSaveModule.main({
    player: { _id: 'mock_openid_chenruibiao', life_number: 1, created_at: Date.now(), updated_at: Date.now() },
    player_life: {
      openid: 'mock_openid_chenruibiao', life_number: 1, alive: true, name: '测试',
      gender: 'male', age: 30, health: 80, lifespan: 75, reputation: 50,
      wealth: 50, knowledge: 50, appearance: 50, medical: 50, military: 50,
      literary: 50, political: 50, righteous: 50, current_items: [],
      created_at: Date.now(), updated_at: Date.now(),
    },
  })
  if (res1.success === true && res1.updated_at) { console.log('  ✅ 通过\n'); ok++ }
  else { console.log('  ❌ 失败:', res1, '\n'); fail++ }

  // 测试 2：误传 narrate_history_list（应该忽略）
  console.log('--- Test 2: 误传 narrate_history_list（应该忽略） ---')
  const res2 = await playerSaveModule.main({
    player: { _id: 'mock_openid_chenruibiao', life_number: 1, created_at: Date.now(), updated_at: Date.now() },
    player_life: {
      openid: 'mock_openid_chenruibiao', life_number: 1, alive: true, name: '测试',
      gender: 'male', age: 30, health: 80, lifespan: 75, reputation: 50,
      wealth: 50, knowledge: 50, appearance: 50, medical: 50, military: 50,
      literary: 50, political: 50, righteous: 50, current_items: [],
      created_at: Date.now(), updated_at: Date.now(),
    },
    narrate_history_list: [
      { life_number: 1, role: 'user', content: '误传', created_at: Date.now() },
    ],
  })
  if (res2.success === true) { console.log('  ✅ 通过（成功忽略 narrate_history_list）\n'); ok++ }
  else { console.log('  ❌ 失败:', res2, '\n'); fail++ }

  // 测试 3：空入参
  console.log('--- Test 3: 空入参 ---')
  const res3 = await playerSaveModule.main({})
  if (res3.success === true) { console.log('  ✅ 通过\n'); ok++ }
  else { console.log('  ❌ 失败:', res3, '\n'); fail++ }

  console.log(`=== 总计 ${ok} 通过 / ${fail} 失败 ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FAIL:', e); process.exit(1) })