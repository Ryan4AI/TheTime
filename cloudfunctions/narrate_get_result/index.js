/**
 * 云函数：narrate_get_result
 *
 * v0.1.76 — 读独立的 narrate_result 集合（固定 schema）
 * 读 narrate_result（不在 narrate_pending）
 *
 * 输入：{ request_id: "narrate_xxx" }
 * 输出：
 *   - { status: 'done', result: {...} }
 *   - { status: 'error', error: '...' }
 *   - { status: 'not_found' }
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { request_id } = event
  if (!request_id) return { error: '缺少 request_id', code: 400 }

  try {
    // v0.1.77 修：用 where().get() 而非 doc().get()
    // cloudbase NoSQL 用 add() 写入的数据，doc().get() 查不到（疑似 bug）
    // where({_id: x}).get() 才能正确查到
    const res = await db.collection('narrate_result').where({ _id: request_id }).get()
    const record = res.data && res.data[0]
    if (!record) return { status: 'not_found' }

    if (record.error_str) {
      return { status: 'error', error: record.error_str }
    }

    if (record.result_str) {
      let result
      try { result = JSON.parse(record.result_str) } catch (e) { result = record.result_str }
      return { status: 'done', result }
    }

    return { status: 'not_found' }
  } catch (e) {
    console.error('[narrate_get_result] 查询失败:', e.message)
    return { status: 'error', error: '查询失败' }
  }
}