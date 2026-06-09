/**
 * 云函数：ai_narrate_submit
 *
 * D008 异步轮询方案 — 第 1 步：立即返回 request_id
 * 接收完整 payload → 写入 narrate_pending → 触发 worker → 返回 request_id
 *
 * 设计要点：
 * - 2 秒内必须返回（客户端 15s 限制有 13 秒缓冲）
 * - worker 调用不 await（fire-and-forget），即使 worker 触发失败也返回成功
 *   （worker 触发失败 → 先生可以在云函数日志看到 + 重传机制后续加）
 * - payload 完整写入 pending 表，worker 自己去读
 *
 * 输入：{ state, input, history, is_retry }（同 ai_narrate）
 * 输出：{ success: true, request_id: "narrate_xxx" }
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  if (!event || !event.state) {
    return { error: '缺少 state', code: 400 }
  }

  // 生成唯一 request_id
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const requestId = `narrate_${ts}_${rand}`

  try {
    // 写入 pending 表
    await db.collection('narrate_pending').add({
      data: {
        _id: requestId,
        status: 'processing',     // processing / done / error
        payload: {
          state: event.state,
          input: event.input || '',
          history: event.history || [],
          is_retry: !!event.is_retry,
        },
        result: null,
        error: null,
        created_at: ts,
        finished_at: null,
      },
    })
  } catch (e) {
    console.error('[ai_narrate_submit] 写入 pending 失败:', e.message)
    return { error: '提交失败，请重试', code: 500 }
  }

  // 触发 worker（不 await）
  // 注意：cloud.callFunction 内部用云开发内部通道，通常 < 1 秒
  cloud.callFunction({
    name: 'ai_narrate_worker',
    data: { request_id: requestId },
  }).catch(e => {
    console.error('[ai_narrate_submit] worker 触发失败:', e.message)
    // 不返回错误 — request_id 已经返回，前端会轮询发现 status='processing'
    // 后续先生可以加定时器捡"超时未完成"的 pending 重启 worker
  })

  return { success: true, request_id: requestId }
}
