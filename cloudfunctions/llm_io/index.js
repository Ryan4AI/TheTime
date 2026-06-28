// v0.1.0 — D049a 阶段 1（2026-06-29 01:13 拍板）
// llm_io 集合的云函数入口
// 当前只提供"初始化"和"调试查询"，实际写入由 worker / submit 完成
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const VALID_CATEGORIES = ['narrate', 'score', 'death', 'poem']
const VALID_STATUS = ['success', 'error', 'pending', 'trigger_fail']

// schema 校验：llm_io 入库前必走
function validateLlmIo(record) {
  if (!record || typeof record !== 'object') return 'record_not_object'
  if (!record.request_id || typeof record.request_id !== 'string') return 'invalid_request_id'
  if (!record.openid || typeof record.openid !== 'string') return 'invalid_openid'
  if (!VALID_CATEGORIES.includes(record.category)) return 'invalid_category'
  if (!VALID_STATUS.includes(record.status)) return 'invalid_status'
  if (typeof record.input !== 'object' || record.input === null) return 'invalid_input'
  if (typeof record.output !== 'object' || record.output === null) return 'invalid_output'
  if (typeof record.error !== 'string') return 'invalid_error'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
  return null  // 校验通过
}

exports.main = async (event) => {
  const { action } = event
  if (action === 'validate') {
    const err = validateLlmIo(event.record)
    return { success: !err, error: err }
  }
  return { error: 'unknown action' }
}
