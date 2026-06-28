/**
 * 云函数：ai_narrate_submit
 *
 * D049a 阶段 2（2026-06-29 01:16 拍板）：
 * - 删 narrate_pending 引用（D049 设计：日志用 narrate_result 已经覆盖，narrate_pending 冗余）
 * - 改写 llm_io 替代 narrate_result
 *
 * v0.2.4 — NOT_FOUND 根因修复
 * v0.2.4 修复：
 *   - submit 触发 worker 用 Promise.race + 5 秒超时
 *   - worker main() 启动后立即 return（剩下的 LLM 调用是 worker 自己异步）
 *   - 5 秒后还没收到 worker return → 写 llm_io 标记 trigger_fail
 *   - 前端立即返回 request_id 开始轮询
 *
 * 流程：
 *   1. submit 写 llm_io (status=pending, category=narrate)
 *   2. submit 用 Promise.race 触发 worker（5s 超时）
 *   3. submit 立即返回 { success, request_id }（< 3s）
 *   4. worker 后台跑 LLM，完成后写 llm_io (status=success/error)
 *   5. 前端 5s 轮询 get_result
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CALL_WORKER_TIMEOUT_MS = 5000

exports.main = async (event) => {
  if (!event || !event.state) {
    return { error: '缺少 state', code: 400 }
  }

  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const requestId = `narrate_${ts}_${rand}`

  // 1. D049a: 写 llm_io (status=pending) 替代 narrate_pending + narrate_result
  // 校验：input/output/error 都填默认值
  try {
    await db.collection('llm_io').add({
      data: {
        request_id: requestId,
        category: 'narrate',
        status: 'pending',
        input: { state_round: event.state.round, life_number: event.state.life_number, is_retry: !!event.is_retry },
        output: {},
        error: '',
        created_at: ts,
      },
    })
  } catch (e) {
    console.error('[ai_narrate_submit] 写 llm_io pending 失败:', e.message)
  }

  // 2. 触发 worker
  try {
    await Promise.race([
      cloud.callFunction({
        name: 'ai_narrate_worker',
        data: {
          request_id: requestId,
          payload: {
            state: event.state,
            input: event.input || '',
            history: event.history || [],
            is_retry: !!event.is_retry,
          },
        },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('trigger_worker_timeout_' + CALL_WORKER_TIMEOUT_MS + 'ms')), CALL_WORKER_TIMEOUT_MS)
      ),
    ])
    console.log('[ai_narrate_submit] worker 触发成功, request_id=', requestId)
  } catch (e) {
    // worker 触发失败/超时 → 写 llm_io 标记 trigger_fail
    console.error('[ai_narrate_submit] worker 触发失败:', e.message)
    try {
      await db.collection('llm_io').where({ request_id: requestId }).update({
        data: {
          status: 'trigger_fail',
          error: '[submit_trigger_fail] ' + e.message,
        },
      })
    } catch (writeErr) {
      console.error('[ai_narrate_submit] 写 trigger_fail 失败:', writeErr.message)
    }
  }

  return { success: true, request_id: requestId }
}
