/**
 * v0.6.8: 按朝代精细补全 social_structure.jobs
 * 
 * 先生拍板方案B精细版 — 先输出预览，确认后再写数据库
 * 
 * 使用方式: node scripts/update_social_jobs.js [--apply]
 * 不加 --apply 只预览，加 --apply 才写数据库
 */
const { execSync } = require('child_process')
const path = require('path')

// ───── 朝代年份范围 ─────
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

// ───── 朝代×阶层 → jobs 精细映射表 ─────
// 按 "阶层名" 匹配（大部分朝代通用，少数朝代有差异）
const JOBS_MAP = {
  // 通用：所有朝代都适用的阶层映射（作为兜底）
  _通用: {
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
  },

  // ── 上古夏商 ──
  _上古夏商: {
    '夏后': ['夏后(王)', '摄政'],
    '诸夏': ['诸夏首领', '方伯', '卿士'],
    '部族首领': ['酋长', '长老', '巫师'],
    '祭司': ['祭司', '巫', '卜人'],
    '平民': ['农夫', '陶工', '青铜匠', '织工'],
    '奴隶': ['战俘', '仆役', '作坊奴隶'],
  },

  // ── 秦汉 ──
  _秦汉: {
    '皇帝': ['皇帝', '太子', '诸王'],
    '诸侯': ['诸侯王', '列侯', '关内侯'],
    '卿大夫': ['丞相', '太尉', '御史大夫', '将军'],
    '士': ['郎中', '太学生', '县令', '郡吏'],
    '庶人': ['农夫', '商贩', '工匠', '戍卒'],
    '奴隶': ['官奴', '私奴', '奴婢'],
  },

  // ── 魏晋南北朝 ──
  _魏晋南北朝: {
    '皇帝': ['皇帝', '太子', '藩王'],
    '诸侯': ['藩王', '州牧', '刺史'],
    '卿大夫': ['尚书', '大将军', '太尉'],
    '士': ['秀才', '县令', '参军', '文学'],
    '庶人': ['农夫', '织工', '渔夫', '猎户'],
    '部曲': ['部曲', '佃客'],
    '奴隶': ['部曲', '奴婢', '僮仆'],
  },

  // ── 隋唐 ──
  _隋唐: {
    '皇帝': ['皇帝', '太子', '亲王'],
    '诸侯': ['节度使', '都督', '刺史'],
    '卿大夫': ['宰相', '尚书', '将军', '仆射'],
    '士': ['进士', '举人', '县令', '主簿'],
    '庶人': ['农夫', '织工', '商贩', '胡商', '脚夫'],
    '部曲': ['部曲', '佃客', '庄客'],
    '奴隶': ['部曲', '奴婢', '官奴'],
  },

  // ── 宋 ──
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

  // ── 元 ──
  _元: {
    '皇帝': ['大汗', '可汗', '皇帝', '太子'],
    '诸侯': ['诸王', '行省丞相', '宣慰使', '万户'],
    '卿大夫': ['丞相', '平章政事', '元帅'],
    '士': ['儒生', '学正', '教授', '蒙古书吏'],
    '庶人': ['农夫', '牧民', '商贩', '匠户', '驱口'],
    '奴隶': ['驱口', '奴婢', '怯怜口'],
  },

  // ── 明 ──
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

  // ── 清初 ──
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

  // ── 清末民国 ──
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

// ───── 工具函数 ─────
function getEra(year) {
  for (const e of ERAS) {
    if (year >= e.min && year <= e.max) return e.name
  }
  return '未知'
}

function getJobs(className, eraName) {
  // 先按朝代找
  for (const [key, map] of Object.entries(JOBS_MAP)) {
    if (key === '_通用') continue
    const eraKey = key.replace('_', '')
    if (eraKey === eraName || eraName.includes(eraKey) || eraKey.includes(eraName)) {
      if (map[className]) return map[className]
      // 模糊匹配：如果实存的阶层名包含映射键，或相反
      for (const [k, v] of Object.entries(map)) {
        if (className.includes(k) || k.includes(className)) return v
      }
    }
  }
  // 用通用表
  const generic = JOBS_MAP._通用
  if (generic[className]) return generic[className]
  for (const [k, v] of Object.entries(generic)) {
    if (className.includes(k) || k.includes(className)) return v
  }
  return null
}

// ───── 主流程 ─────
async function main() {
  const apply = process.argv.includes('--apply')
  
  // 1. 先查所有空 jobs 记录
  console.log(`模式: ${apply ? '✅ 写入数据库' : '🔍 预览（加 --apply 写入）'}`)
  if (apply) {
    console.log('⚠️  注意：这将会直接修改数据库！')
    console.log()
  }

  // 用 tcb CLI 拉数据
  console.log('正在查询 social_structure 集合...')
  let retries = 3
  let data
  while (retries > 0) {
    try {
      const out = execSync(`npx tcb db nosql execute --command '[{"TableName":"social_structure","CommandType":"QUERY","Command":"{\\\"find\\\":\\\"social_structure\\\",\\\"filter\\\":{},\\\"limit\\\":1000}"}]' --json`, {
        encoding: 'utf8',
        cwd: '/home/admin/workspace/TheTime',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      data = JSON.parse(out)
      break
    } catch (e) {
      retries--
      if (retries === 0) {
        console.error('查询失败:', e.message)
        process.exit(1)
      }
      console.log('重试...')
    }
  }

  const docs = data?.data?.results?.[0] || []
  console.log(`共 ${docs.length} 条记录`)

  // 2. 找出空 jobs 的记录
  const emptyDocs = docs.filter(d => !d._init_ && !d.jobs)
  console.log(`空 jobs 记录: ${emptyDocs.length}`)

  // 3. 按朝代分组 + 预览映射
  const total = 0
  const succeeded = []
  const failed = []

  for (const doc of emptyDocs) {
    const id = doc._id
    const year = doc.year?.$numberInt || doc.year
    const className = doc.class
    const eraName = getEra(year)
    
    const jobs = getJobs(className, eraName)
    if (!jobs) {
      failed.push({ id, year, className, era: eraName })
      continue
    }
    succeeded.push({ id, year, className, era: eraName, jobs, weight: doc.weight })
  }

  // 4. 输出预览
  console.log(`\n=== 映射预览 ===`)
  console.log(`可补全: ${succeeded.length} / ${emptyDocs.length}`)
  console.log(`未匹配: ${failed.length}`)

  // 按朝代分组统计
  const byEra = {}
  for (const s of succeeded) {
    if (!byEra[s.era]) byEra[s.era] = { total: 0, classes: new Set() }
    byEra[s.era].total++
    byEra[s.era].classes.add(s.className)
  }
  console.log('\n按朝代统计:')
  for (const [era, stat] of Object.entries(byEra).sort()) {
    console.log(`  ${era}: ${stat.total} 条, 阶层=${[...stat.classes].join(', ')}`)
  }

  // 输出未匹配
  if (failed.length > 0) {
    console.log('\n未匹配的阶层（需要人工补映射表）:')
    for (const f of failed.slice(0, 20)) {
      console.log(`  year=${f.year} ${f.era} | class=${f.className}`)
    }
    if (failed.length > 20) console.log(`  ...还有 ${failed.length - 20} 条`)
  }

  // 5. 批量 update
  if (apply && succeeded.length > 0) {
    console.log('\n=== 正在写入数据库 ===')
    let updated = 0
    for (const s of succeeded) {
      const cmd = JSON.stringify([{
        TableName: 'social_structure',
        CommandType: 'UPDATE',
        Command: JSON.stringify({
          filter: { _id: s.id },
          update: { $set: { jobs: s.jobs } }
        })
      }])
      try {
        execSync(`echo "y" | npx tcb db nosql execute --command '${cmd}' --json`, {
          encoding: 'utf8',
          cwd: '/home/admin/workspace/TheTime',
          timeout: 15000,
          stdio: ['pipe', 'pipe', 'pipe']
        })
        updated++
        if (updated % 100 === 0) console.log(`  ${updated}/${succeeded.length}`)
      } catch (e) {
        console.error(`  更新失败 ${s.id}: ${e.message.slice(0, 200)}`)
      }
    }
    console.log(`\n✅ 更新完成: ${updated}/${succeeded.length}`)
  }

  // 6. 输出 3 个样本
  console.log('\n=== 映射样本 ===')
  for (const s of succeeded.slice(0, 5)) {
    console.log(`  ${s.era} | ${s.className} → ${s.jobs.join('/')}`)
  }
}

main().catch(e => console.error('Error:', e))
