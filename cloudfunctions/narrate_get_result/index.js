/**
 * 云函数：narrate_get_result
 *
 * D008 异步轮询方案 — 第 3 步：前端轮询结果
 *
 * 输入：{ request_id: "narrate_xxx" }
 * 输出：
 *   - { status: 'processing', elapsed_ms: ... }  // 还在跑
 *   - { status: 'done', result: { ... } }        // 完成，带完整 result
 *   - { status: 'error', error: '...' }          // 失败
 *   - { status: 'not_found' }                    // request_id 不存在（TTL 过期被清理）
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { request_id } = event

  if (!request_id) {
    return { error: '缺少 request_id', code: 400 }
  }

  try {
    const doc = await db.collection('narrate_pending').doc(request_id).get()
    const record = doc.data && doc.data[0]

    if (!record) {
      return { status: 'not_found' }
    }

    if (record.status === 'done') {
      return { status: 'done', result: record.result }
    }

    if (record.status === 'error') {
      return { status: 'error', error: record.error || 'AI服务暂不可用' }
    }

    // processing — 返回已等待时长
    return {
      status: 'processing',
      elapsed_ms: Date.now() - (record.created_at || Date.now()),
    }
  } catch (e) {
    console.error('[narrate_get_result] 查询失败:', e.message)
    return { status: 'error', error: '查询失败' }
  }
}
