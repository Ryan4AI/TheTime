/**
 * 云函数：ai_narrate_submit
 *
 * v0.2.4 — NOT_FOUND 根因修复
 *
 * 之前的 bug（v0.1.77 fire-and-forget）：
 *   - cloud.callFunction 不 await，submit立即返回
 *   - 如果 fire-and-forget 没真正发出去，worker 没启动 → 前端 NOT_FOUND（永久找不到）
 *
 * v0.2.4 修复：
 *   - submit 触发 worker 用 Promise.race + 5 秒超时
 *   - worker main() 启动后立即 return（剩下的 LLM 调用是 worker 自己异步）
 *   - 所以 await 实际只等 1-2 秒（worker 启动），不会真等 LLM 30+ 秒
 *   - 5 秒后还没收到 worker return → 写 narrate_result 标记 trigger_fail
 *   - 前端立即返回 request_id 开始轮询（用户体验不变）
 *
 * 流程：
 *   1. submit 写 narrate_pending
 *   2. submit 用 Promise.race 触发 worker（5s 超时），捕获触发失败
 *   3. submit 立即返回 { success, request_id }（< 3s）
 *   4. worker 后台跑 LLM（30-40s），完成后写 narrate_result
 *   5. 前端 5s 轮询 get_result
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CALL_WORKER_TIMEOUT_MS = 5000  // 触发 worker 超时（worker main 启动后立即 return，5秒足够）

exports.main = async (event) => {
  if (!event || !event.state) {
    return { error: '缺少 state', code: 400 }
  }

  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const requestId = `narrate_${ts}_${rand}`

  // 1. 写 narrate_pending（status 标记，仅供监控）
  try {
    await db.collection('narrate_pending').add({
      data: {
        _id: requestId,
        status: 'processing',
        payload_summary: {
          round: event.state.round,
          life_number: event.state.life_number,
          dynasty: event.state.dynasty,
          is_retry: !!event.is_retry,
        },
        result: '',
        error: '',
        created_at: ts,
        finished_at: 0,
      },
    })
  } catch (e) {
    console.error('[ai_narrate_submit] 写 pending 失败（不影响主流程）:', e.message)
  }

  // 2. v0.2.4: 触发 worker + 5秒超时控制
  // cloud.callFunction 触发失败/超时时，写 narrate_result 标记 trigger_fail
  // 之前的 fire-and-forget 永远写不了 error，前端只能 NOT_FOUND
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
    // v0.2.4: worker 触发失败 / 超时 → 写 narrate_result 标记
    console.error('[ai_narrate_submit] worker 触发失败:', e.message)
    try {
      await db.collection('narrate_result').add({
        data: {
          _id: requestId,
          result_str: '',
          error_str: '[submit_trigger_fail] ' + e.message,
          created_at: Date.now(),
        },
      })
    } catch (writeErr) {
      console.error('[ai_narrate_submit] 写 error 结果失败:', writeErr.message)
    }
  }

  // 3. 立即返回（不管 worker 触发是否成功，都返回 request_id 让前端轮询）
  return { success: true, request_id: requestId }
}