// v0.1.0 — D049a 阶段 1（2026-06-29 01:13 拍板）
// 玩家数据加载：先生 wx.login 拿 openid 后，启动时调此函数
// 返回：player + 当前世 player_life + 最近 50 条 narrate_history
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, error: 'no_openid' }

  try {
    // 1) 查 player
    const playerRes = await db.collection('player').where({ _id: openid }).get()
    if (playerRes.data.length === 0) {
      return { success: false, error: 'no_player', openid }
    }
    const player = playerRes.data[0]

    // 2) 查当前世 player_life
    const lifeRes = await db.collection('player_life').where({ openid, life_number: player.life_number }).get()
    if (lifeRes.data.length === 0) {
      return { success: false, error: 'no_player_life', openid, life_number: player.life_number }
    }
    const player_life = lifeRes.data[0]

    // 3) 查全部 narrate_history（D055 拍板：不截断，给前端完整上下文）
    // D062（2026-07-05 10:13 先生拍板）：按 created_at asc 排序（worker 写库时设的 Date.now() 毫秒时间戳）
    // 真因：D056 注释误判"云数据库 _id 包含时间戳"——CloudBase 的 _id 是 32 hex 随机字符串，无时间信息
    //   → player_load 用 .orderBy('_id', 'asc') 实际是字典序随机排序，不是时间顺序
    //   → 先生重进游戏 narrative 显示的不是"最近一条 ai"，而是 _id 字典序随机一条
    // 修复：按 created_at 升序（先生每条 ai 消息都有此字段），让 narrativeHistory = 真实时间顺序
    // 不改字段名 / 不建索引 / 不动 schema（先生 2026-07-05 10:10 拍板"不动数据库设计"）
    const nhRes = await db.collection('narrate_history')
      .where({ openid, life_number: player.life_number })
      .orderBy('created_at', 'asc')  // 旧→新（D062）
      .get()
    const narrate_history_list = nhRes.data

    return { success: true, player, player_life, narrate_history_list, openid }
  } catch (e) {
    console.error('[player_load] failed:', e.message)
    return { success: false, error: e.message }
  }
}
