// 直接用云函数 SDK 测：先生端发的 payload
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-d5gkbowyvbd1c85e1' })
const db = cloud.database()

// 1) 先看 player 集合是否能 add（set 含 _id 限制）
async function test() {
  try {
    // add 一条
    const r = await db.collection('player').add({ data: { life_number: 1, test: 'mock' } })
    console.log('add 成功:', r._id)
    // 删掉
    await db.collection('player').doc(r._id).remove()
    console.log('remove 成功')
  } catch (e) {
    console.error('add 失败:', e.message)
  }
}
test()
