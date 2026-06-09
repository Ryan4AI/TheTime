/**
 * 云函数：init_pending
 *
 * D008 narrate_pending 集合初始化
 * 用 wx-server-sdk 的 db.createCollection API（不是 add 自动建表）
 *
 * 用法：tcb fn invoke init_pending
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const COLLECTION_NAME = 'narrate_pending'

  // 1. 尝试 createCollection（SDK 原生 API）
  try {
    const res = await db.createCollection(COLLECTION_NAME)
    return {
      success: true,
      method: 'createCollection',
      message: `${COLLECTION_NAME} 集合已创建`,
      sdk_response: res,
    }
  } catch (e) {
    // 集合已存在不算错
    if (e.message && (e.message.includes('already exist') || e.message.includes('already exists') || e.errCode === -502005)) {
      // 已存在 — 验证一下能 add 即可
      try {
        const testId = `test_${Date.now()}`
        await db.collection(COLLECTION_NAME).add({
          data: { _id: testId, status: 'test', payload: null, result: null, error: null, created_at: Date.now(), finished_at: null }
        })
        await db.collection(COLLECTION_NAME).doc(testId).remove()
        return { success: true, method: 'already_exists', message: `${COLLECTION_NAME} 集合已存在，读写验证 OK` }
      } catch (e2) {
        return { success: false, error: e2.message, hint: '集合已存在但读写失败' }
      }
    }
    return { success: false, error: e.message, code: 500 }
  }
}
