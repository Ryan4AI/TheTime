// v0.1.0 — D049a 阶段 1（2026-06-29 01:13 拍板）
// 玩家数据存盘：先生 wx.login 拿 openid 后，每回合结束调此函数
// 业务：upsert player + player_life + 增 narrate_history
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ATTRS = ['reputation', 'wealth', 'knowledge', 'appearance', 'medical', 'military', 'literary', 'political', 'righteous']
const VALID_ROLES = ['user', 'ai', 'system']

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
  for (const attr of ATTRS) {
    const v = record[attr]
    if (typeof v !== 'number' || v < 0 || v > 10000) return `invalid_${attr}`
  }
  if (!Array.isArray(record.current_items)) return 'invalid_current_items'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
  if (typeof record.updated_at !== 'number') return 'invalid_updated_at'
  return null
}

// schema 校验：narrate_history 入库前必走
function validateNarrateHistory(record) {
  if (!record || typeof record !== 'object') return 'record_not_object'
  if (!record.openid || typeof record.openid !== 'string') return 'invalid_openid'
  if (typeof record.life_number !== 'number' || record.life_number < 1) return 'invalid_life_number'
  if (typeof record.message_id !== 'number' || record.message_id <= 0) return 'invalid_message_id'
  if (!VALID_ROLES.includes(record.role)) return 'invalid_role'
  if (typeof record.content !== 'string') return 'invalid_content'
  if (record.patch !== undefined && record.patch !== null && !Array.isArray(record.patch)) return 'invalid_patch'
  if (record.options !== undefined && record.options !== null && !Array.isArray(record.options)) return 'invalid_options'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
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
  const { action, player, player_life, narrate_history_list } = event
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
      // _id 由云数据库自动生成（前端不传）
      await db.collection('player_life').where({ openid, life_number: player_life.life_number }).update({ data: player_life })
      // 如果没记录就 add
      const exists = await db.collection('player_life').where({ openid, life_number: player_life.life_number }).count()
      if (exists.total === 0) {
        await db.collection('player_life').add({ data: { ...player_life, openid } })
      }
    }

    // 3) add narrate_history（多条）
    if (Array.isArray(narrate_history_list)) {
      for (const nh of narrate_history_list) {
        const nhErr = validateNarrateHistory(nh)
        if (nhErr) return { success: false, error: 'narrate_history:' + nhErr }
        await db.collection('narrate_history').add({ data: { ...nh, openid } })
      }
    }

    return { success: true, updated_at: Date.now() }
  } catch (e) {
    console.error('[player_save] failed:', e.message)
    return { success: false, error: e.message }
  }
}
