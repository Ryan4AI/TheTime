// D058（2026-07-04 21:09 先生拍板）：云端 narrate_history 管理器
// 入参:
//   dryRun = true  → 只统计脏数据 _id，不删（默认 true）
//   mode = 'clean_dirty' (默认) → 删 content='初始回合' + message_id 重复
//         = 'by_ids'            → 只删入参 ids 数组里的 _id
//         = 'all'               → 全删（先生兜底用，慎用）
//   ids = []  (mode='by_ids' 必传)
// 返回: { success, mode, stats: { total, dirty/removed, clean, sample_dirty_content[] }, removed? }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 应用"脏数据规则"返回脏 _id Set（同时返回全部 record）
function classifyDirty(allRecords) {
  const seenMessageIds = new Map()
  const dirtyIds = new Set()
  for (const r of allRecords) {
    if (r.content === '初始回合') { dirtyIds.add(r._id); continue }
    if (r.message_id !== undefined && r.message_id !== null) {
      if (seenMessageIds.has(r.message_id)) dirtyIds.add(r._id)
      else seenMessageIds.set(r.message_id, r._id)
    }
  }
  return dirtyIds
}

// 精简 record 给前端展示（content 截 200 字）
// 2026-08-01 hotfix：content 强转 String——库里可能有 content 是对象/数字的脏记录，直接 .slice 会崩
// 2026-08-01 22:50 诊断：统计非字符串 content 的类型分布（排查脏数据来源）
const nonStrContentTypes = {}
function slimRecord(r) {
  if (typeof r.content !== 'string') {
    const t = Array.isArray(r.content) ? 'array' : (r.content === null ? 'null' : typeof r.content)
    nonStrContentTypes[t] = (nonStrContentTypes[t] || 0) + 1
  }
  return {
    _id: r._id,
    role: r.role,
    content: String(r.content == null ? '' : r.content).slice(0, 200),
    message_id: r.message_id,
    created_at: r.created_at,
    life_number: r.life_number,
  }
}

// 分批删除（云数据库 remove 单次限 50 条）
async function removeByChunks(ids) {
  let deletedCount = 0
  const chunkSize = 50
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const res = await db.collection('narrate_history').where({ _id: _.in(chunk), openid: wxCtx.OPENID }).remove()
    deletedCount += (res.deleted || 0)
  }
  return deletedCount
}

let wxCtx = null

exports.main = async (event) => {
  wxCtx = cloud.getWXContext()
  const openid = wxCtx.OPENID
  if (!openid) return { success: false, error: 'no_openid' }

  const dryRun = event.dryRun !== false
  const mode = event.mode || 'clean_dirty'
  const ids = Array.isArray(event.ids) ? event.ids : []

  try {
    // 拉全部（2026-08-02：orderBy desc 让数据 tab 默认显示最新，与 llm_io tab 一致）
    const MAX = 1000
    let allRecords = []
    let offset = 0
    while (true) {
      const res = await db.collection('narrate_history')
        .where({ openid })
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(MAX)
        .get()
      allRecords = allRecords.concat(res.data)
      if (res.data.length < MAX) break
      offset += MAX
    }

    // 选 ids 集合
    let targetIds = new Set()
    let statsSample = []

    if (mode === 'by_ids') {
      const idSet = new Set(ids)
      targetIds = new Set(allRecords.filter(r => idSet.has(r._id)).map(r => r._id))
      statsSample = allRecords.filter(r => targetIds.has(r._id)).slice(0, 5)
    } else if (mode === 'all') {
      targetIds = new Set(allRecords.map(r => r._id))
      statsSample = allRecords.slice(0, 5)
    } else {
      // clean_dirty (默认)
      targetIds = classifyDirty(allRecords)
      statsSample = allRecords.filter(r => targetIds.has(r._id)).slice(0, 5)
    }

    // D058（2026-07-04 21:09 先生拍板）：dryRun 模式下返回完整数据 + 全部脏 _id
    // 原因：前端数据 tab 要显示完整列表，需要 all_records 和 all_target_ids
    const stats = {
      total: allRecords.length,
      target: targetIds.size,
      clean: allRecords.length - targetIds.size,
      sample_target_content: statsSample.map(r => ({
        _id: r._id, content: String(r.content == null ? '' : r.content).slice(0, 50),
        message_id: r.message_id, role: r.role,
      })),
    }

    if (dryRun) {
      stats.all_target_ids = Array.from(targetIds)
      // 2026-08-02：先生拍板「全部显示 + 分页」——不再截断 100 条
      // all_records 返回当前页（page/pageSize 分页），total 给前端算总页数
      const page = Math.max(1, parseInt(event.page, 10) || 1)
      const pageSize = Math.min(500, Math.max(1, parseInt(event.pageSize, 10) || 100))
      const allSlim = allRecords.map(slimRecord)
      const total = allSlim.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const curPage = Math.min(page, totalPages)
      stats.all_records = allSlim.slice((curPage - 1) * pageSize, curPage * pageSize)
      stats.page = curPage
      stats.page_size = pageSize
      stats.total_pages = totalPages
      // 诊断：非字符串 content 类型分布（先生 22:50 问"怎么会有非字符串"）
      if (Object.keys(nonStrContentTypes).length > 0) {
        stats.non_str_content_types = nonStrContentTypes
      }
    }

    if (dryRun) {
      return { success: true, mode, dryRun: true, stats }
    }

    const targetArr = Array.from(targetIds)
    if (targetArr.length === 0) {
      return { success: true, mode, dryRun: false, stats, removed: 0, message: 'nothing_to_remove' }
    }

    const deleted = await removeByChunks(targetArr, openid)
    return { success: true, mode, dryRun: false, stats, removed: deleted }
  } catch (e) {
    console.error('[clean_narrate_history] failed:', e.message)
    return { success: false, error: e.message }
  }
}