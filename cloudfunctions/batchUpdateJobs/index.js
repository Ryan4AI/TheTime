/**
 * 批量补全 social_structure.jobs 字段
 * 按朝代精细映射
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ERAS = [
  { name: '上古夏商', min: -2200, max: -1046 },
  { name: '西周', min: -1045, max: -771 },
  { name: '春秋', min: -770, max: -476 },
  { name: '战国', min: -475, max: -221 },
  { name: '秦汉', min: -220, max: 220 },
  { name: '魏晋南北朝', min: 221, max: 589 },
  { name: '隋唐', min: 581, max: 907 },
  { name: '宋', min: 960, max: 1279 },
  { name: '元', min: 1271, max: 1368 },
  { name: '明', min: 1368, max: 1644 },
  { name: '清初', min: 1644, max: 1840 },
  { name: '清末民国', min: 1840, max: 1949 },
]

const JOBS_MAP = {
  _上古夏商: {
    '夏后': ['夏后(王)', '摄政'],
    '诸夏': ['诸夏首领', '方伯', '卿士'],
    '部族首领': ['酋长', '长老', '巫师'],
    '祭司': ['祭司', '巫', '卜人'],
    '平民': ['农夫', '陶工', '青铜匠', '织工'],
    '奴隶': ['战俘', '仆役', '作坊奴隶'],
  },
  _秦汉: {
    '皇帝': ['皇帝', '太子', '诸王'],
    '诸侯': ['诸侯王', '列侯', '关内侯'],
    '卿大夫': ['丞相', '太尉', '御史大夫', '将军'],
    '士': ['郎中', '太学生', '县令', '郡吏'],
    '庶人': ['农夫', '商贩', '工匠', '戍卒'],
    '奴隶': ['官奴', '私奴', '奴婢'],
  },
  _魏晋南北朝: {
    '皇帝': ['皇帝', '太子', '藩王'],
    '诸侯': ['藩王', '州牧', '刺史'],
    '卿大夫': ['尚书', '大将军', '太尉'],
    '士': ['秀才', '县令', '参军', '文学'],
    '庶人': ['农夫', '织工', '渔夫', '猎户'],
    '部曲': ['部曲', '佃客'],
    '奴隶': ['部曲', '奴婢', '僮仆'],
  },
  _隋唐: {
    '皇帝': ['皇帝', '太子', '亲王'],
    '诸侯': ['节度使', '都督', '刺史'],
    '卿大夫': ['宰相', '尚书', '将军', '仆射'],
    '士': ['进士', '举人', '县令', '主簿'],
    '庶人': ['农夫', '织工', '商贩', '胡商', '脚夫'],
    '部曲': ['部曲', '佃客', '庄客'],
    '奴隶': ['部曲', '奴婢', '官奴'],
  },
  _宋: {
    '皇帝': ['皇帝', '太子', '亲王', '郡王'],
    '诸侯': ['知州', '安抚使', '转运使'],
    '卿大夫': ['宰相', '枢密使', '参知政事'],
    '士': ['进士', '举人', '秀才', '县令'],
    '庶人': ['农夫', '织工', '商贩', '佃户', '脚夫'],
    '农民': ['佃户', '自耕农', '菜农'],
    '工人': ['工匠', '矿工', '织工', '窑工'],
    '商人': ['商贾', '掌柜', '行商', '市舶'],
    '奴隶': ['佃仆', '奴婢', '僮仆'],
  },
  _元: {
    '皇帝': ['大汗', '可汗', '皇帝', '太子'],
    '诸侯': ['诸王', '行省丞相', '宣慰使', '万户'],
    '卿大夫': ['丞相', '平章政事', '元帅'],
    '士': ['儒生', '学正', '教授', '蒙古书吏'],
    '庶人': ['农夫', '牧民', '商贩', '匠户', '驱口'],
    '奴隶': ['驱口', '奴婢', '怯怜口'],
  },
  _明: {
    '皇帝': ['皇帝', '太子', '亲王', '郡王'],
    '诸侯': ['总督', '巡抚', '布政使', '知州'],
    '卿大夫': ['首辅', '尚书', '都督', '巡按御史'],
    '士': ['进士', '举人', '秀才', '县令'],
    '庶人': ['农夫', '织工', '商贩', '灶户', '脚夫'],
    '农民': ['佃户', '自耕农', '军户'],
    '工人': ['匠户', '矿工', '窑工', '织工'],
    '商人': ['商贾', '掌柜', '行商'],
    '奴隶': ['世仆', '奴婢', '伴当'],
  },
  _清初: {
    '皇帝': ['皇帝', '亲王', '郡王', '贝勒'],
    '诸侯': ['总督', '巡抚', '将军', '提督'],
    '卿大夫': ['大学士', '尚书', '都统', '大臣'],
    '士': ['进士', '举人', '秀才', '县令'],
    '庶人': ['农夫', '织工', '商贩', '旗丁', '脚夫'],
    '农民': ['佃户', '自耕农'],
    '工人': ['匠户', '矿工', '织工'],
    '商人': ['商贾', '掌柜', '行商', '票商'],
    '奴隶': ['包衣', '奴婢', '庄头'],
  },
  _清末民国: {
    '总统': ['大总统', '总统'],
    '主席': ['国家主席', '委员长', '主席'],
    '官僚': ['官员', '书吏', '师爷', '科长'],
    '干部': ['干部', '政委', '书记'],
    '知识分子': ['教授', '记者', '作家', '学生', '律师'],
    '士绅': ['乡绅', '举人', '私塾先生', '议员'],
    '士': ['学生', '教师', '文人'],
    '卿大夫': ['部长', '将军', '大臣'],
    '诸侯': ['总督', '巡抚', '都督'],
    '庶人': ['农夫', '工人', '小贩', '苦力'],
    '市民': ['店员', '手工艺者', '商贩', '人力车夫'],
    '农民': ['佃户', '自耕农', '雇农'],
    '工人': ['矿工', '纺织工', '铁路工', '苦力'],
    '商人': ['商贾', '掌柜', '买办'],
    '奴隶': ['仆役', '婢女', '役夫', '包衣'],
  },
}

// 通用兜底
const GENERIC = {
  '皇帝': ['皇帝', '太子', '亲王'],
  '总统': ['大总统', '总统', '主席'],
  '主席': ['国家主席', '委员长'],
  '官僚': ['官员', '书吏', '师爷'],
  '干部': ['干部', '政委', '书记'],
  '知识分子': ['文人', '学者', '教师', '记者'],
  '士绅': ['乡绅', '举人', '私塾先生'],
  '士': ['文人', '县吏', '武士'],
  '卿大夫': ['大夫', '将军', '御史'],
  '诸侯': ['诸侯王', '郡守', '太守'],
  '庶人': ['农夫', '工匠', '商贩'],
  '平民': ['农夫', '织工', '小贩'],
  '市民': ['商贩', '手工艺者', '店员'],
  '农民': ['农夫', '佃户', '自耕农'],
  '工人': ['工匠', '矿工', '织工'],
  '商人': ['商贾', '掌柜', '行商'],
  '奴隶': ['奴仆', '婢女', '役夫'],
}

function getEra(year) {
  for (const e of ERAS) {
    if (year >= e.min && year <= e.max) return e.name
  }
  return '未知'
}

function matchJobs(className, eraName) {
  // 精确朝代匹配
  for (const [key, map] of Object.entries(JOBS_MAP)) {
    const ek = key.replace('_', '')
    if (eraName.includes(ek) || ek.includes(eraName)) {
      if (map[className]) return map[className]
      for (const [k, v] of Object.entries(map)) {
        if (className.includes(k) || k.includes(className)) return v
      }
    }
  }
  // 通用兜底
  if (GENERIC[className]) return GENERIC[className]
  for (const [k, v] of Object.entries(GENERIC)) {
    if (className.includes(k) || k.includes(className)) return v
  }
  return null
}

exports.main = async (event, context) => {
  const { mode } = event || {}
  const isPreview = mode === 'preview'

  // 查所有空 jobs 记录
  const totalRes = await db.collection('social_structure')
    .where({ jobs: _.eq([]), _init_: _.neq(true) })
    .count()
  const total = totalRes.total
  console.log('空 jobs 记录数:', total)

  if (isPreview) {
    // 预览模式：只返回统计和映射
    const res = await db.collection('social_structure')
      .where({ jobs: _.eq([]), _init_: _.neq(true) })
      .limit(500)
      .get()
    const byEra = {}
    const unmatched = []
    let matchCount = 0
    for (const doc of res.data) {
      const eraName = getEra(doc.year)
      const jobs = matchJobs(doc.class, eraName)
      if (jobs) {
        matchCount++
        if (!byEra[eraName]) byEra[eraName] = { count: 0 }
        byEra[eraName].count++
      } else {
        unmatched.push({ year: doc.year, class: doc.class, era: eraName })
      }
    }
    return { total, matchCount, unmatched, byEra }
  }

  // 正式模式：批量 update
  let updated = 0
  let failed = 0
  const BATCH = 100
  let offset = 0

  while (true) {
    const res = await db.collection('social_structure')
      .where({ jobs: _.eq([]), _init_: _.neq(true) })
      .skip(offset)
      .limit(BATCH)
      .get()
    if (!res.data || res.data.length === 0) break
    offset += res.data.length

    // 逐条 update（先查 class/year 再 update）
    for (const doc of res.data) {
      const eraName = getEra(doc.year)
      const jobs = matchJobs(doc.class, eraName)
      if (jobs) {
        try {
          await db.collection('social_structure').doc(doc._id).update({
            data: { jobs: jobs }
          })
          updated++
        } catch (e) {
          failed++
          console.error('update err:', doc._id, e.message.slice(0, 100))
        }
      }
    }
  }

  return { total: total, updated, failed }
}
