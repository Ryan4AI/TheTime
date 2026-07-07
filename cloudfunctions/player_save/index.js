// v0.1.0 — D049a 阶段 1（2026-06-29 01:13 拍板）
// 玩家数据存盘：先生 wx.login 拿 openid 后，每回合结束调此函数
// 业务：upsert player + player_life
// D057（2026-07-04 08:21 拍板）：删 narrate_history 写入路径
// 真因：D056 重构后 narrate_history 由 worker 实时 add，前端不再写
// 修法：player_save 只管 player + player_life，validateNarrateHistory + add narrate_history 整段删
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ATTRS = ['reputation', 'wealth', 'knowledge', 'appearance', 'medical', 'military', 'literary', 'political', 'righteous']

// schema 校验：player_life 入库前必走
function validatePlayerLife(record) {
  if (!record || typeof record !== 'object') return 'record_not_object'
  if (!record.openid || typeof record.openid !== 'string') return 'invalid_openid'
  if (typeof record.life_number !== 'number' || record.life_number < 1) return 'invalid_life_number'
  if (typeof record.alive !== 'boolean') return 'invalid_alive'
  if (typeof record.name !== 'string' || record.name.length < 1 || record.name.length > 20) return 'invalid_name'
  if (record.gender !== 'male' && record.gender !== 'female') return 'invalid_gender'
  if (typeof record.age !== 'number' || record.age < 0 || record.age > 150) return 'invalid_age'
  if (typeof record.health !== 'number' || record.health < 0 || record.health > 100) return 'invalid_health'
  if (typeof record.lifespan !== 'number' || record.lifespan < 55 || record.lifespan > 150) return 'invalid_lifespan'
  // D081（2026-07-05 17:17 先生拍板）：补 month/year/occupation/dynasty/city/social_class 必填
  // 真因：之前没必填这些字段 → identity.js 漏塞时 state 月份/年份/朝代/职业变成默认值 → system 消息对不上
  if (typeof record.month !== 'number' || record.month < 1 || record.month > 12) return 'invalid_month'
  if (typeof record.year !== 'number' || record.year < 1 || record.year > 9999) return 'invalid_year'
  if (typeof record.occupation !== 'string' || record.occupation.length < 1) return 'invalid_occupation'
  if (typeof record.dynasty !== 'string' || record.dynasty.length < 1) return 'invalid_dynasty'
  if (typeof record.city !== 'string' || record.city.length < 1) return 'invalid_city'
  if (typeof record.social_class !== 'string' || record.social_class.length < 1) return 'invalid_social_class'
  for (const attr of ATTRS) {
    const v = record[attr]
    if (typeof v !== 'number' || v < 0 || v > 10000) return `invalid_${attr}`
  }
  if (!Array.isArray(record.current_items)) return 'invalid_current_items'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
  if (typeof record.updated_at !== 'number') return 'invalid_updated_at'
  return null
}

// schema 校验：player 入库前必走
function validatePlayer(record) {
  if (!record || typeof record !== 'object') return 'record_not_object'
  if (!record._id) return 'invalid_id'  // _id 必填（云数据库自动给，但显式检查）
  if (typeof record.life_number !== 'number' || record.life_number < 1) return 'invalid_life_number'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
  if (typeof record.updated_at !== 'number') return 'invalid_updated_at'
  return null
}

exports.main = async (event) => {
  const { player, player_life } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, error: 'no_openid' }

  try {
    // 1) upsert player
    if (player) {
      const playerErr = validatePlayer(player)
      if (playerErr) return { success: false, error: 'player:' + playerErr }
      // D049 修复 v4（2026-06-30 00:32 拍板）：set 时去掉 _id 字段
      // 真因：set({ data: player }) 含 _id → -501007 invalid parameters. 不能更新_id的值
      // 微信云数据库：set 不允许包含 _id 字段（_id 是 doc 第一个参数指定的）
      const { _id, ...playerData } = player
      await db.collection('player').doc(_id).set({ data: playerData })
    }

    // 2) upsert player_life
    if (player_life) {
      const lifeErr = validatePlayerLife(player_life)
      if (lifeErr) return { success: false, error: 'player_life:' + lifeErr }
      // D079（2026-07-05 17:03 先生拍板）：update 时剥掉 created_at
      // 真因：前端 stateToPlayerLife 输出 created_at（即使 state 没这字段也会用 Date.now() 兜底）
      //       → player_save update 把云端原 created_at 覆盖成调用时间
      //       → 玩家看起来被"重生"（created_at = updated_at = 调用时间）
      // 修法：剥掉 created_at（云端保留原值），updated_at 强制覆盖
      const { created_at: _ignored, ...lifeData } = player_life
      await db.collection('player_life').where({ openid, life_number: player_life.life_number }).update({ data: lifeData })
      // 如果没记录就 add（add 时 created_at 用 player_life 原值）
      const exists = await db.collection('player_life').where({ openid, life_number: player_life.life_number }).count()
      if (exists.total === 0) {
        await db.collection('player_life').add({ data: { ...player_life, openid } })
      }
    }

    // D057（2026-07-04 08:21 拍板）：player_save 不再写 narrate_history
    // narrate_history 由 ai_narrate_worker 实时 add（云数据库 _id 自带去重）
    // 删了原 line 91-96 add 循环 + validateNarrateHistory + VALID_ROLES

    return { success: true, updated_at: Date.now() }
  } catch (e) {
    console.error('[player_save] failed:', e.message)
    return { success: false, error: e.message }
  }
}