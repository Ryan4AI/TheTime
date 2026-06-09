/**
 * 云函数：dump_result
 * 调试用：直接列出 narrate_result 集合里的所有文档
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    // 列出前 10 条
    const res = await db.collection('narrate_result').limit(10).get()
    return {
      success: true,
      count: res.data ? res.data.length : 0,
      data: res.data || [],
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}