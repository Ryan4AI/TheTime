const cloud=require('wx-server-sdk'); cloud.init({env:cloud.DYNAMIC_CURRENT_ENV}); const db=cloud.database();
exports.main=async(e)=>{
  const collection = (e && e.collection) || 'player_life'
  const limit = (e && e.limit) || 5
  // 2026-08-02：支持 orderBy 参数（history_compress 无 created_at 字段，按 compressed_at 排序）
  const orderField = (e && e.orderBy) || 'created_at'
  // 2026-08-16：支持 openid 筛选（DBG llm_io tab 只看当前用户）
  const openid = (e && e.openid) || ''
  try {
    let query = db.collection(collection)
    if (openid) query = query.where({ openid })
    const a = await query.orderBy(orderField, 'desc').limit(limit).get()
    return { collection, count: a.data.length, data: a.data }
  } catch (err) {
    return { collection, count: 0, data: [], error: String(err.message || err).slice(0, 200) }
  }
}
