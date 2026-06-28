/**
 * 云函数：dump_result
 * 调试用：D049a 阶段 2 改读 llm_io 集合（替代 narrate_result）
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    // 列出前 10 条 llm_io
    const res = await db.collection('llm_io').limit(10).get()
    return {
      success: true,
      count: res.data ? res.data.length : 0,
      data: res.data || [],
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
