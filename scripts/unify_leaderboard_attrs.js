/**
 * v0.6.48: 统一标准重算所有榜单历史人物属性
 *
 * 修复 v1 的问题：
 * - 只往上拉（oldMin < newMin 时提升），不往下压（oldMin > newMin 时保持不动）
 * - 顶级人物保持不动
 * - 排名保持顺序不变
 */

const fs = require('fs')
const data = JSON.parse(fs.readFileSync(__dirname + '/../data/leaderboards.json', 'utf8'))

// ============ 评分公式 ============

const FORMULAS = {
  '名医榜': c => Math.round((c.医术 || 0) * 0.7 + (c.声望 || 0) * 0.3),
  '名将榜': c => Math.round((c.战功 || 0) * 0.7 + (c.声望 || 0) * 0.3),
  '富商榜': c => c.财富 || 0,
  '文豪榜': c => Math.round((c.文采 || 0) * 0.7 + (c.学识 || 0) * 0.3),
  '能臣榜': c => Math.round((c.政绩 || 0) * 0.7 + (c.声望 || 0) * 0.3),
  '义士榜': c => Math.round((c.义行 || 0) * 0.7 + (c.声望 || 0) * 0.3),
  '全能榜': c => (c.声望 || 0) + (c.财富 || 0) + (c.学识 || 0) + (c.颜值 || 0),
  '颜值榜': c => c.颜值 || 0,
}

// ============ 榜单配置 ============

/**
 * 每个榜单需要映射的属性及其目标最小值。
 * 规则：只有 oldMin < targetMin 时才做往上映射。
 * 主要原则：新手玩家经过努力（~40-60轮）后能追上榜末历史人物。
 */
const BOARD_ATTRS = {
  '名医榜': {
    医术: { targetMin: 3000 },
    声望: { targetMin: 1500 },
  },
  '名将榜': {
    // 名将榜原始值已经合理(战功底5000，声望底4500)，不做映射
  },
  '富商榜': {
    财富: { targetMin: 3000 },
  },
  '文豪榜': {
    文采: { targetMin: 3000 },
    学识: { targetMin: 6200 },  // 学识原底6200，合理
  },
  '能臣榜': {
    政绩: { targetMin: 3000 },
    声望: { targetMin: 3000 },  // 声望原底3000，合理
  },
  '义士榜': {
    义行: { targetMin: 3000 },
    声望: { targetMin: 2000 },
  },
  '全能榜': {
    声望: { targetMin: 2000 },
    财富: { targetMin: 2000 },
    学识: { targetMin: 3000 },
    颜值: { targetMin: 6000 },
  },
}

// ============ 工具函数 ============

function linearMap(oldVal, oldMin, oldMax, newMin, newMax) {
  if (oldMax <= oldMin) return newMin
  const ratio = (oldVal - oldMin) / (oldMax - oldMin)
  return Math.round(ratio * (newMax - newMin) + newMin)
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ============ 执行 ============

for (const [boardName, attrConfig] of Object.entries(BOARD_ATTRS)) {
  const chars = data[boardName]
  if (!chars || chars.length === 0) {
    console.log(`${boardName}: 无数据，跳过`)
    continue
  }

  const n = chars.length
  console.log(`\n${boardName} (${n}人)`)

  for (const [attr, { targetMin }] of Object.entries(attrConfig)) {
    const vals = chars.map(c => c[attr] || 0)
    const oldMin = Math.min(...vals)
    const oldMax = Math.max(...vals)

    if (oldMin >= targetMin) {
      console.log(`  ${attr}: 无需映射（原底${oldMin} ≥ 目标${targetMin}）`)
      continue
    }

    const newMin = targetMin
    const newMax = oldMax  // 顶部不动

    console.log(`  ${attr}: [${oldMin}, ${oldMax}] → [${newMin}, ${newMax}]`)

    for (const c of chars) {
      const oldVal = c[attr] || 0
      if (oldVal >= oldMax) continue  // 保持顶值
      const newVal = clamp(linearMap(oldVal, oldMin, oldMax, newMin, newMax), 0, 10000)
      c[attr] = newVal
    }

    // 验证
    const newVals = chars.map(c => c[attr] || 0)
    console.log(`    结果: top=${newVals[0]}, bottom=${newVals[n-1]}`)
  }
}

// ———— 重算综合分 & 重排 ————

for (const [boardName, chars] of Object.entries(data)) {
  if (!chars || chars.length === 0) continue

  const formula = FORMULAS[boardName]
  if (formula) {
    for (const c of chars) {
      c.综合分 = formula(c)
    }
  }

  // 按综合分降序重排
  chars.sort((a, b) => (b.综合分 || 0) - (a.综合分 || 0))
  chars.forEach((c, i) => { c.排名 = i + 1 })
}

// ============ 保存 ============

fs.writeFileSync(__dirname + '/../data/leaderboards_unified.json', JSON.stringify(data, null, 2), 'utf8')
console.log('\n✅ 已写入 data/leaderboards_unified.json')

// ============ 摘要 ============

console.log('\n============ 摘要 ============')
for (const [boardName, chars] of Object.entries(data)) {
  if (!chars || chars.length === 0) continue
  const scores = chars.map(c => c.综合分 || 0)
  const minS = Math.min(...scores)
  const maxS = Math.max(...scores)

  // 只显示被改过的榜单的底部
  const wasModified = BOARD_ATTRS[boardName] && Object.keys(BOARD_ATTRS[boardName]).length > 0
  const unmod = !wasModified ? '(未修改)' : ''

  console.log(`${boardName} (${chars.length}人)${unmod}: 综合分[${minS}, ${maxS}]`)
  if (wasModified) {
    const last = chars[chars.length - 1]
    const first = chars[0]
    const attrInfo = Object.keys(BOARD_ATTRS[boardName]).map(a => `${a}=${last[a]}`).join('/')
    console.log(`  榜末: #${chars.length} ${last.name} ${attrInfo} → 综合分=${last.综合分}`)
    const attrTop = Object.keys(BOARD_ATTRS[boardName]).map(a => `${a}=${first[a]}`).join('/')
    console.log(`  榜首: #1 ${first.name} ${attrTop} → 综合分=${first.综合分}`)
  }
}
