/**
 * 云函数：narrate_get_result
 *
 * D049a 阶段 2（2026-06-29 01:16 拍板）：读 llm_io 集合（替代 narrate_result）
 * llm_io 单一职责：AI 接口调用 IO（input/output/status/error/category）
 * 业务数据（state/branch/attr_patch）全在 player_life
 *
 * 输入：{ request_id: "narrate_xxx" }
 * 输出：
 *   - { status: 'success', llm_io: {...}, result: {...} }  // 业务数据从 result_str 读
 *   - { status: 'error', error: '...' }
 *   - { status: 'pending' }  // 还在跑
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
    // D049a 改：读 llm_io 集合（替代 narrate_result）
    const res = await db.collection('llm_io').where({ request_id }).get()
    const record = res.data && res.data[0]
    if (!record) return { status: 'not_found' }

    // 按 status 字段分发
    if (record.status === 'pending') {
      return { status: 'pending' }
    }

    if (record.status === 'success') {
      // D050 修复（2026-07-03 01:01 先生拍板·B 方案）：透传 result 字段给前端
      // 真因：D049a 阶段 2 只存 llm_io 不存业务数据，前端轮询拿不到 result 字段
      // 修复：把 llm_io.output.result（worker 写入的完整业务快照）透传给前端
      // 前端 game.js 等 pollResult.result || {} → 现在能拿到完整 result 对象
      const output = record.output || {}
      return {
        status: 'success',
        result: output.result || null,  // D050: 完整业务数据快照（branch/state/month_changed/event/system_messages/closest_board/attr_patch）
        llm_io: {
          request_id: record.request_id,
          category: record.category,
          output: output,  // {raw_response, parsed, result}
          created_at: record.created_at,
        }
      }
    }

    if (record.status === 'trigger_fail' || record.status === 'error') {
      return { status: 'error', error: record.error || 'AI 调用失败' }
    }

    return { status: 'not_found' }
  } catch (e) {
    console.error('[narrate_get_result] 查询失败:', e.message)
    return { status: 'error', error: '查询失败' }
  }
}
