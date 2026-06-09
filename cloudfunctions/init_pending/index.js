/**
 * 云函数：init_pending
 * 调试用：列出 narrate_result 集合的所有记录
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    const res = await db.collection('narrate_result').limit(10).get()
    return {
      success: true,
      count: res.data.length,
      records: res.data.map(r => ({
        _id: r._id,
        result_str_len: r.result_str ? r.result_str.length : 0,
        error_str: r.error_str,
        created_at: r.created_at,
        has_result: !!r.result_str,
      })),
    }
  } catch (e) {
    return { error: e.message }
  }
}