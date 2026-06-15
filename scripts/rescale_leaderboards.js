/**
 * v0.6.47: 将榜单历史人物综合分重算到游戏内合理量级
 * 
 * 背景：榜单数据底层人物分数极低（孔伯华148分、伍崇曜200分）
 * 但游戏三层池模型初始化属性很高（郎中开局医术~4000）
 * → 玩家开局就秒杀历史名医，阈值完全不合理
 * 
 * 方案：对综合分做线性重映射
 *   old [old_min, old_max] → new [new_min, ~old_max]
 *   保持排序不变，顶部不变，底部抬高到游戏合理门槛
 */
const fs = require('fs')

// 各榜单的重映射目标
const RESCALE = {
  '名医榜': { newMin: 2000 },
  '名将榜': null,       // 5200→5000 差距不大，保持不变
  '富商榜': { newMin: 3000 },
  '文豪榜': null,       // 2390 合理
  '能臣榜': null,       // 2300 合理
  '义士榜': { newMin: 2500 },
  '全能榜': null,       // 19000 合理
  '颜值榜': null,       // 8000 合理
}

const data = JSON.parse(fs.readFileSync(__dirname + '/../data/leaderboards.json', 'utf8'))

for (const [boardName, cfg] of Object.entries(RESCALE)) {
  if (!cfg) {
    console.log(boardName + ': 跳过（分数已合理）')
    continue
  }
  const chars = data[boardName]
  if (!chars || chars.length === 0) {
    console.log(boardName + ': 无数据，跳过')
    continue
  }

  const oldMin = chars[chars.length - 1].综合分
  const oldMax = chars[0].综合分
  const newMin = cfg.newMin
  const newMax = oldMax  // 保持顶部分数不变

  const oldSpan = oldMax - oldMin
  const newSpan = newMax - newMin

  if (oldSpan <= 0) {
    console.log(boardName + ': oldSpan=0，跳过')
    continue
  }

  const scale = newSpan / oldSpan

  console.log(boardName + ': [', oldMin, ',', oldMax, '] → [', newMin, ',', newMax, '], scale=', scale.toFixed(4))

  // 找出当前综合分对应的原始属性，确定需要缩放哪些属性字段
  // 名医榜: 医术,声望 → 综合分=医术*0.7+声望*0.3
  // 富商榜: 财富
  // 义士榜: 义行,声望

  for (const char of chars) {
    const oldScore = char.综合分
    const newScore = Math.round((oldScore - oldMin) * scale + newMin)
    char.综合分 = newScore
  }

  console.log('  重算后: #1=' + chars[0].综合分 + '  #' + chars.length + '=' + chars[chars.length-1].综合分)
}

// 验证数据有效性
fs.writeFileSync(__dirname + '/../data/leaderboards_rescaled.json', JSON.stringify(data, null, 2), 'utf8')
console.log('\n✅ 写入 data/leaderboards_rescaled.json')
console.log('⚠️  请执行下述命令导入云数据库:')
console.log('   cd /home/admin/workspace/TheTime && python3 scripts/check-db-state.py')
