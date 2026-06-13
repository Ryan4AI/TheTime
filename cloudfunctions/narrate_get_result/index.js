/**
 * 云函数：narrate_get_result
 *
 * v0.1.76 — 读独立的 narrate_result 集合（固定 schema）
 * 读 narrate_result（不在 narrate_pending）
 *
 * v0.2.5-H（先生 2026-06-13 拍板）：result_str 优先于 error_str
 * worker v0.2.5-H 在 JSON 解析失败时，会把 fakeResult（含 raw_response）写进 result_str
 * 同时 error_str 也写了"AI输出无法解析..."
 * 但 status=error 时前端忽略 result_str 走 [WORKER_ERROR] 分支，看不到 raw_response
 * 改：result_str 存在就优先返回 done + result，前端能渲染 debug 信息
 *
 * 输入：{ request_id: "narrate_xxx" }
 * 输出：
 *   - { status: 'done', result: {...} }
 *   - { status: 'error', error: '...' }（仅 result_str 也为空时才返回 error）
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

    // v0.2.5-H：result_str 优先（即使 error_str 也有内容）
    // 让前端 status=done 能拿到 fakeResult，渲染 raw_response
    if (record.result_str) {
      let result
      try { result = JSON.parse(record.result_str) } catch (e) { result = record.result_str }
      // 如果 result 含 error 字段，也带 error 字段返回，前端 [RESPONSE_ERROR] 识别
      return { status: 'done', result, error: record.error_str || null }
    }

    if (record.error_str) {
      return { status: 'error', error: record.error_str }
    }

    return { status: 'not_found' }
  } catch (e) {
    console.error('[narrate_get_result] 查询失败:', e.message)
    return { status: 'error', error: '查询失败' }
  }
}