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
      // D049a: 业务数据现在不存 llm_io（只存 AI IO）—— 业务数据从 player_life 拉
      // 但前端 D048 时代业务数据从 result_str 读—— 这里要兼容
      // D049a 阶段 2：暂时 result 字段返回空，前端用 player_load 自己拉
      return {
        status: 'success',
        llm_io: {
          request_id: record.request_id,
          category: record.category,
          output: record.output,  // {raw_response, parsed}
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
