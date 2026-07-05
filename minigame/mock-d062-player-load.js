/**
 * D062 mock 测试：player_load 按 created_at asc 排序
 * 真因：D056 误判 _id 包含时间戳 → player_load 字典序随机 → 重进游戏 narrative 错乱
 * 修复：改 .orderBy('created_at', 'asc')
 *
 * 测试方式：mock 云数据库 collection.where().orderBy().get()，
 *           用先生真实 3 条 ai 数据（07-04 22:18 / 07-05 09:00 / 07-05 09:01），
 *           验证 asc 排序结果是真时间顺序。
 */

const path = require('path')

// 先生云端 3 条 ai（按实际 created_at 顺序记录）
const realRecords = [
  {
    _id: '34e7f3816a4851440016b2c80083bb9d',
    openid: 'oPj9J3SlVBKCn09wvsYdR94hov7A',
    life_number: 1,
    role: 'ai',
    created_at: 1783124292863,  // 07-04 22:18
    content: '你从告示栏前转身，心里盘算着刘主簿的话。',
    options: ['跟着老头走小路', '回客栈歇着', '去茶摊'],
  },
  {
    _id: '129318c96a49b7b100f8909951199fdc',
    openid: 'oPj9J3SlVBKCn09wvsYdR94hov7A',
    life_number: 1,
    role: 'ai',
    created_at: 1783216049482,  // 07-05 09:00
    content: '你转身往回走，街上议论声不绝于耳。',
    options: ['下楼去听告示', '继续躺着', '凑近墙壁'],
  },
  {
    _id: '1ac3fe576a49b7f6003896456617c3ed',
    openid: 'oPj9J3SlVBKCn09wvsYdR94hov7A',
    life_number: 1,
    role: 'ai',
    created_at: 1783216118592,  // 07-05 09:01
    content: '你披衣下楼，客栈门口已经围了一群人。',
    options: ['谢过少年', '回客栈收拾', '挤到告示'],
  },
]

function makeCollection(records) {
  let lastSort = null
  return {
    where: () => makeCollection(records),
    orderBy: (field, dir) => {
      lastSort = { field, dir }
      const sorted = [...records].sort((a, b) => {
        const va = a[field]
        const vb = b[field]
        if (typeof va === 'string' && typeof vb === 'string') {
          return dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
        }
        return dir === 'asc' ? va - vb : vb - va
      })
      return { get: async () => ({ data: sorted }), _lastSort: lastSort }
    },
    get: async () => ({ data: records }),
  }
}

const db = { collection: () => makeCollection(realRecords) }

// 把 db 挂到 global，让 new Function 内能访问（绕过 TDZ 问题）
global.db = db

// 加载 player_load（替换 wx-server-sdk 依赖）
const fs = require('fs')
const src = fs.readFileSync(path.join(__dirname, '../cloudfunctions/player_load/index.js'), 'utf8')
  .replace(`const cloud = require('wx-server-sdk')`, `const cloud = { database: () => global.db, getWXContext: () => ({ OPENID: 'oPj9J3SlVBKCn09wvsYdR94hov7A' }) }`)
  .replace(`cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`, `// mock init`)
  .replace(`exports.main`, `module.exports.main`)  // 把 exports.main 换成 module.exports.main

// 直接 require 模拟
const m = { exports: {} }
new Function('require', 'module', 'exports', '__dirname', '__filename', src)(
  require, m, m.exports, __dirname, __filename
)
const handler = m.exports.main

;(async () => {
  const evt = {
    openid: 'oPj9J3SlVBKCn09wvsYdR94hov7A',
    life_number: 1,
  }
  const result = await handler(evt, {})
  console.log('=== D062 mock test ===')
  console.log('success:', result.success)
  console.log('narrate_history count:', result.narrate_history_list && result.narrate_history_list.length)
  if (result.narrate_history_list) {
    result.narrate_history_list.forEach((m, i) => {
      console.log(`  [${i}] created_at=${m.created_at} content=${JSON.stringify(m.content.slice(0, 30))}`)
    })
  }

  let pass = true
  const list = result.narrate_history_list || []

  // 断言：asc 排序后应该是 created_at 升序
  for (let i = 1; i < list.length; i++) {
    if (list[i].created_at < list[i - 1].created_at) {
      pass = false
      console.error(`❌ 断言失败：第 ${i} 条 created_at=${list[i].created_at} < 第 ${i - 1} 条 ${list[i - 1].created_at}`)
    }
  }

  // 断言：第一条应该是 07-04 22:18（最早），最后一条是 07-05 09:01（最近）
  if (list[0] && list[0].content.includes('告示栏')) {
    console.log('✅ 第一条是最早剧情（07-04 22:18 告示栏）')
  } else {
    pass = false
    console.error('❌ 第一条不是最早剧情')
  }
  if (list.length > 0 && list[list.length - 1].content.includes('客栈门口')) {
    console.log('✅ 最后一条是最近剧情（07-05 09:01 客栈门口）')
  } else {
    pass = false
    console.error('❌ 最后一条不是最近剧情')
  }

  console.log(pass ? '\n🎉 D062 测试通过' : '\n❌ D062 测试失败')
  process.exit(pass ? 0 : 1)
})().catch(e => {
  console.error('mock 异常:', e.message, '\n', e.stack)
  process.exit(1)
})