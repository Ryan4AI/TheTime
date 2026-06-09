/**
 * 云函数：ai_narrate_submit
 *
 * v0.1.77 — 最终方案
 *
 * 关键发现：cloudbase callFunction 客户端 15s，**服务端 → 服务端也是 15s**
 * 因此 submit **不能 await worker**（worker 跑 30+ 秒会超时）
 *
 * 流程：
 *   1. submit 写 narrate_pending（status=processing）—— 立即完成
 *   2. submit fire-and-forget 触发 worker（不等）
 *   3. submit 立即返回 { success, request_id }（< 2s）
 *   4. worker 后台跑 LLM（30-40s），完成后写 narrate_result（独立集合）
 *   5. 前端 5s 轮询 get_result，读 narrate_result
 *
 * 关键修复（v0.1.76 → v0.1.77）：
 *   - submit 不再 await cloud.callFunction（fire-and-forget）
 *   - worker 写独立的 narrate_result 集合（固定 schema，无字段冲突）
 *   - get_result 读 narrate_result（不是 narrate_pending）
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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

  // 2. fire-and-forget 触发 worker（**不 await**，否则会 15s 超时）
  // worker 自己会写 narrate_result 集合
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
  }).catch(e => {
    console.error('[ai_narrate_submit] worker 触发失败:', e.message)
  })

  // 3. 立即返回
  return { success: true, request_id: requestId }
}