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

    // 3) 查 narrate_history（D072 2026-07-05 13:18 先生拍板·C 方案）
    // 之前：永远返回全量 asc（D062 拍板），前端 narrativeHistory 累积用
    // 现在：默认返回轻量"最近 1 条 ai + 最近 1 条消息 role"，前端 game.init 只渲染最后一条
    //       全量 history 由 worker（D067）自己拉，前端不再缓存全量
    // mode='full' 时仍返回全量 asc（兜底兼容旧调用方）
    const mode = (event && event.mode) || 'last_ai'

    if (mode === 'full') {
      // 兜底：返回全量（D055 拍板：不截断，给前端完整上下文）
      const nhRes = await db.collection('narrate_history')
        .where({ openid, life_number: player.life_number })
        .orderBy('created_at', 'asc')
        .get()
      return { success: true, player, player_life, narrate_history_list: nhRes.data, openid }
    }

    // 默认 mode='last_ai'：只查最后 1 条 ai + 最后 1 条消息 role
    // 查最后 1 条消息（任何 role），用于 D060/D065 判定
    const lastMsgRes = await db.collection('narrate_history')
      .where({ openid, life_number: player.life_number })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get()
    const lastMsg = (lastMsgRes.data && lastMsgRes.data[0]) || null
    const last_role = lastMsg ? lastMsg.role : null

    // 查最后 1 条 ai（如果最后一条消息本身是 ai，就用同一条；否则再查）
    let lastAi = null
    if (lastMsg && lastMsg.role === 'ai') {
      lastAi = lastMsg
    } else {
      const lastAiRes = await db.collection('narrate_history')
        .where({ openid, life_number: player.life_number, role: 'ai' })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get()
      lastAi = (lastAiRes.data && lastAiRes.data[0]) || null
    }

    // 2026-08-02 12:54 先生实测：ai1 写完剧情但 ai2 没跑就重进 → 剧情已到新地点、state 还是旧的
    // 修法：返回最后一条 user 消息（玩家上一轮输入），前端检测 is_scoring=true 时补跑 ai2 用
    let lastUserInput = ''
    const lastUserRes = await db.collection('narrate_history')
      .where({ openid, life_number: player.life_number, role: 'user' })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get()
    if (lastUserRes.data && lastUserRes.data[0]) {
      lastUserInput = lastUserRes.data[0].content || ''
    }

    return { success: true, player, player_life, last_ai: lastAi, last_role, last_user_input: lastUserInput, openid }
  } catch (e) {
    console.error('[player_load] failed:', e.message)
    return { success: false, error: e.message }
  }
}
