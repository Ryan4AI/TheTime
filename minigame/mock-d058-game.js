// Mock D058 game.js 整体
const path = require('path')

// Mock wx
let mockNh = []
let callLog = []
const fakeWx = {
  cloud: {
    callFunction: ({ name, data, success, fail }) => {
      callLog.push({ name, data: JSON.stringify(data).slice(0, 100) })
      console.log(`[mock wx.cloud.callFunction] name=${name}`)
      if (name === 'clean_narrate_history') {
        const dirtyIds = []
        const seenMsg = new Map()
        for (const r of mockNh) {
          if (r.content === '初始回合') { dirtyIds.push(r._id); continue }
          if (r.message_id != null) {
            if (seenMsg.has(r.message_id)) dirtyIds.push(r._id)
            else seenMsg.set(r.message_id, r._id)
          }
        }
        if (data.dryRun) {
          success({ result: { success: true, mode: data.mode || 'clean_dirty', dryRun: true, stats: {
            total: mockNh.length,
            target: dirtyIds.length,
            clean: mockNh.length - dirtyIds.length,
            all_target_ids: dirtyIds,
            all_records: mockNh.slice(0, 500),
          } } })
        } else {
          const targetIds = new Set()
          if (data.mode === 'all') mockNh.forEach(r => targetIds.add(r._id))
          else if (data.mode === 'by_ids') data.ids.forEach(id => targetIds.add(id))
          else dirtyIds.forEach(id => targetIds.add(id))
          const before = mockNh.length
          mockNh = mockNh.filter(r => !targetIds.has(r._id))
          success({ result: { success: true, mode: data.mode, dryRun: false, stats: { total: before, target: targetIds.size }, removed: before - mockNh.length } })
        }
      } else {
        fail({ errMsg: 'unknown function: ' + name })
      }
    },
  },
  getStorageSync: () => null,
  setStorageSync: () => {},
  showToast: () => {},
  showModal: ({ success }) => success({ confirm: true }),
  setClipboardData: ({ success }) => success && success(),
}

global.wx = fakeWx
global.hitTest = (x, y, hx, hy, hw, hh) => x >= hx && x <= hx + hw && y >= hy && y <= hy + hh
global.layout = {
  windowW: 393,
  windowH: 852,
  safeTop: 47,
  topBarH: 44,
  padding: 12,
}

// 用 eval + Function 隔离作用域，捕获 D058 函数
const fs = require('fs')
const gameCode = fs.readFileSync(path.join(__dirname, 'scenes/game.js'), 'utf8')

// 提取 D058 函数（drawDbgDataTab / dbgLoadCloudNh / dbgCopyDataPanel）
// 直接 grep 行号范围
const lines = gameCode.split('\n')
let start = -1, end = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('D058（2026-07-04 21:09 先生拍板）：DBG 「数据」tab')) start = i
}
end = lines.length
const d058Code = lines.slice(start, end).join('\n')

console.log(`D058 代码段：${start + 1}-${end} 行（共 ${end - start} 行）\n`)

// 注入到全局
eval(d058Code)

// 手动声明 D058 顶部变量（因为 mock 只 eval 了 D058 函数段，没 include 变量声明）
global.dbgDataList = []
global.dbgDataLoading = false
global.dbgDataDirtyIds = null
global.dbgDataSelected = {}
global.dbgDataScroll = 0
global.dbgDataFilter = 'all'
global.dbgActiveTab = 6

async function run() {
  console.log('=== D058 game.js D058 段 mock 测试 ===\n')

  // 造数据
  mockNh = [
    { _id: 'a1', role: 'ai', content: '初始回合', message_id: 1, created_at: Date.now() },
    { _id: 'a2', role: 'ai', content: '初始回合', message_id: 2, created_at: Date.now() },
    { _id: 'b1', role: 'user', content: '正常1', message_id: 100, created_at: Date.now() },
    { _id: 'c1', role: 'user', content: '重复', message_id: 100, created_at: Date.now() },
  ]

  let ok = 0, fail = 0

  // Test 1: dryRun
  console.log('--- Test 1: dryRun clean_dirty ---')
  dbgLoadCloudNh(true, 'clean_dirty')
  // 等异步完成
  await new Promise(r => setTimeout(r, 100))
  if (dbgDataList.length === 4 && dbgDataDirtyIds.size === 3 && mockNh.length === 4) {
    console.log('  ✅ 通过（dryRun 拉到 4 条，识别 3 脏，没真删）\n'); ok++
  } else {
    console.log('  ❌ 失败:', { listLen: dbgDataList.length, dirtySize: dbgDataDirtyIds.size, mockNhLen: mockNh.length }, '\n'); fail++
  }

  // Test 2: 真删 by_ids
  console.log('--- Test 2: 真删 by_ids (a1, a2) ---')
  dbgDataSelected = { a1: true, a2: true }
  dbgLoadCloudNh(false, 'by_ids', ['a1', 'a2'])
  await new Promise(r => setTimeout(r, 100))
  if (mockNh.length === 2) {
    console.log('  ✅ 通过（剩 2 条 b1 c1）\n'); ok++
  } else {
    console.log('  ❌ 失败:', mockNh, '\n'); fail++
  }

  // Test 3: 真删 all
  console.log('--- Test 3: 真删 all ---')
  dbgLoadCloudNh(false, 'all')
  await new Promise(r => setTimeout(r, 100))
  if (mockNh.length === 0) {
    console.log('  ✅ 通过（全删）\n'); ok++
  } else {
    console.log('  ❌ 失败:', mockNh, '\n'); fail++
  }

  // Test 4: dbgCopyDataPanel
  console.log('--- Test 4: dbgCopyDataPanel ---')
  dbgDataList = [1, 2, 3, 4, 5]
  dbgDataDirtyIds = new Set(['a', 'b', 'c'])
  dbgDataSelected = { x: true, y: true }
  const txt = dbgCopyDataPanel()
  if (txt.includes('总: 5') && txt.includes('脏: 3') && txt.includes('已选: 2')) {
    console.log('  ✅ 通过:', txt, '\n'); ok++
  } else {
    console.log('  ❌ 失败:', txt, '\n'); fail++
  }

  console.log(`=== ${ok} 通过 / ${fail} 失败 ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FAIL:', e); process.exit(1) })