/**
 * 云函数：init_pending
 *
 * 初始化 narrate_pending 集合（D008 异步轮询方案需要）
 *
 * 设计：
 * - _id: request_id（前端用这个查结果）
 * - status: processing / done / error
 * - payload: 完整 state/input/history（worker 自己读）
 * - result: AI 返回的完整 result（done 时填充）
 * - error: 错误信息（error 时填充）
 * - created_at: 创建时间戳（毫秒）
 * - finished_at: 完成时间戳（毫秒）
 *
 * 没有 TTL 自动清理 — 先生需要在云函数后台写一个定时清理脚本
 * 或者先生手动定期 db.collection('narrate_pending').where({created_at: _.lt(Date.now() - 86400000)}).remove()
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    // 测试：写入+读出一条
    const testId = `init_pending_${Date.now()}`
    await db.collection('narrate_pending').add({
      data: {
        _id: testId,
        status: 'done',
        payload: { state: null, input: '', history: [], is_retry: false },
        result: null,
        error: null,
        created_at: Date.now(),
        finished_at: Date.now(),
      },
    })
    const doc = await db.collection('narrate_pending').doc(testId).get()
    // 立即清理测试数据
    await db.collection('narrate_pending').doc(testId).remove()
    return { success: true, message: 'narrate_pending 集合就绪', tested: doc.data && doc.data[0] }
  } catch (e) {
    return { error: e.message, code: 500 }
  }
}
