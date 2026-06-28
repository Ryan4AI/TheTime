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

    // 3) 查最近 50 条 narrate_history
    const nhRes = await db.collection('narrate_history')
      .where({ openid, life_number: player.life_number })
      .orderBy('message_id', 'asc')
      .limit(50)
      .get()
    const narrate_history_list = nhRes.data

    return { success: true, player, player_life, narrate_history_list, openid }
  } catch (e) {
    console.error('[player_load] failed:', e.message)
    return { success: false, error: e.message }
  }
}
