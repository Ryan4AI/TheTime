// D057（2026-07-04 08:21 拍板·B 方案）：清云端脏 narrate_history
// 场景：D056 之前 4 天累积的脏数据（content='初始回合' + message_id 重复 + 重复 ai 消息）
// 设计：只清当前 wx context 的 openid（先生的），不污染其他用户
// 入参：dryRun = true 时只统计不删（默认 true）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const dryRun = event.dryRun !== false  // 默认 dryRun
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, error: 'no_openid' }

  try {
    // 拉全部先生的 narrate_history
    const MAX = 1000
    let allRecords = []
    let offset = 0
    while (true) {
      const res = await db.collection('narrate_history')
        .where({ openid })
        .skip(offset)
        .limit(MAX)
        .get()
      allRecords = allRecords.concat(res.data)
      if (res.data.length < MAX) break
      offset += MAX
    }

    // 找脏数据 _id
    const seenMessageIds = new Map()  // message_id -> first _id
    const dirtyIds = new Set()

    for (const r of allRecords) {
      // 规则 1：content === '初始回合' 一律删
      if (r.content === '初始回合') {
        dirtyIds.add(r._id)
        continue
      }
      // 规则 2：同 message_id 重复，只留第一条
      if (r.message_id !== undefined && r.message_id !== null) {
        if (seenMessageIds.has(r.message_id)) {
          dirtyIds.add(r._id)
        } else {
          seenMessageIds.set(r.message_id, r._id)
        }
      }
    }

    const stats = {
      total: allRecords.length,
      dirty: dirtyIds.size,
      clean: allRecords.length - dirtyIds.size,
      sample_dirty_content: allRecords
        .filter(r => dirtyIds.has(r._id))
        .slice(0, 5)
        .map(r => ({ _id: r._id, content: (r.content || '').slice(0, 50), message_id: r.message_id, role: r.role })),
    }

    if (dryRun) {
      return { success: true, dryRun: true, stats }
    }

    // 真删：循环 remove（云数据库 remove 单次限 50 条）
    const dirtyArr = Array.from(dirtyIds)
    let deletedCount = 0
    const chunkSize = 50
    for (let i = 0; i < dirtyArr.length; i += chunkSize) {
      const chunk = dirtyArr.slice(i, i + chunkSize)
      const removeRes = await db.collection('narrate_history').where({ _id: _.in(chunk), openid }).remove()
      deletedCount += (removeRes.deleted || 0)
    }

    return { success: true, dryRun: false, stats, deleted: deletedCount }
  } catch (e) {
    console.error('[clean_narrate_history] failed:', e.message)
    return { success: false, error: e.message }
  }
}