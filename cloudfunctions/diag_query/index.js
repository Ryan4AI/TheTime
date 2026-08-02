const cloud=require('wx-server-sdk'); cloud.init({env:cloud.DYNAMIC_CURRENT_ENV}); const db=cloud.database();
exports.main=async(e)=>{
  const collection = (e && e.collection) || 'player_life'
  const limit = (e && e.limit) || 5
  // 2026-08-02：支持 orderBy 参数（history_compress 无 created_at 字段，按 compressed_at 排序）
  const orderField = (e && e.orderBy) || 'created_at'
  try {
    const a=await db.collection(collection).orderBy(orderField,'desc').limit(limit).get();
    // llm_io 集合：新 schema 已精简（~1KB/条），直接返回
    // 其他集合原样返回
    return { collection, count: a.data.length, data: a.data }
  } catch (err) {
    // 2026-08-02：集合不存在（-502005）等错误 → 返回空列表不抛异常（DBG 只读展示，空状态即可）
    return { collection, count: 0, data: [], error: String(err.message || err).slice(0, 200) }
  }
}
