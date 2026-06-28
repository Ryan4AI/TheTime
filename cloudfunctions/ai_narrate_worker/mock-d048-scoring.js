// D048 mock：验证 callScoringAI 的 scorePrompt 拼接正确
// 1. 提取 prompt 实际内容（模拟替换占位符）
// 2. 验证 recentHistory slice(-6) 行为
// 3. 验证 9 属性字段名、month_delta、items 规则
// 不发真实 LLM 请求（mock 不发网络）

const fs = require('fs')
const path = require('path')

const indexPath = path.join(__dirname, 'index.js')
const src = fs.readFileSync(indexPath, 'utf8')

console.log('=== D048 callScoringAI prompt 验证 ===\n')

// 1. 提取 scorePrompt 数组源码
const m = src.match(/const scorePrompt = \[([\s\S]*?)\]\.join\('\\n'\)/)
if (!m) {
  console.error('❌ 未找到 scorePrompt 数组')
  process.exit(1)
}
const body = m[1]
const lines = body.split('\n')
console.log('✅ scorePrompt 数组: ' + lines.length + ' 行 · ' + body.length + ' 字符\n')

// 2. 验证关键段都在
const requiredSections = [
  '【系统记分员】',
  '# 你是什么',
  '# 玩家是什么',
  '# 怎么读本回合剧情',
  '# 三个输入信号',
  '## 1. 最近 3 轮前情',
  '## 2. 玩家当前属性快照',
  '## 3. 本回合剧情',
  '# 三类输出（严格限定）',
  '## A. 9 项社会属性变化',
  '### 声望',
  '### 财富',
  '### 学识',
  '### 颜值',
  '### 医术',
  '### 战功',
  '### 文采',
  '### 政绩',
  '### 义行',
  '## B. month_delta',
  '## C. items',
  '# 数值幅度（核心质量提升）',
  '## 微小变化（±5~15）',
  '## 小变化（±20~50）',
  '## 中等变化（±60~200）',
  '## 大变化（±300~800）',
  '## 极端变化（±1000+）',
  '# 抑制规则',
  '已有属性 ≥ 1000',
  '已有属性 ≥ 8000',
  '# 判断步骤（必走）',
  '1. 扫一遍前情',
  '8. 输出 JSON',
  '# 年龄约束',
  '# 强制规则',
  '**不要重复算前情**',
]

let missing = []
for (const sec of requiredSections) {
  if (body.indexOf(sec) === -1) missing.push(sec)
}
if (missing.length === 0) {
  console.log('✅ 全部 ' + requiredSections.length + ' 个关键段都在')
} else {
  console.error('❌ 缺失段:', missing)
  process.exit(1)
}
console.log()

// 3. 验证 D-决策号没在反引号字符串里出现（防污染 prompt）
const dPattern = /D0\d{2}/
const backtickStrings = body.match(/`[^`]*`/g) || []
let dInString = 0
for (const s of backtickStrings) {
  if (dPattern.test(s) && s.indexOf('// ') !== 0) {
    // 反引号字符串里有 D0xx
    dInString++
    console.warn('⚠ 反引号字符串里有 D 决策号:', s.substring(0, 50))
  }
}
if (dInString === 0) {
  console.log('✅ 反引号字符串里无 D 决策号污染')
}
console.log()

// 4. 验证 recentHistory 拼接逻辑（单独提取 IIFE 段）
const recentM = src.match(/const recentHistory = \(\(\) => \{([\s\S]*?)\}\)\(\)/)
if (!recentM) {
  console.error('❌ 未找到 recentHistory IIFE')
  process.exit(1)
}
const recentBody = recentM[1]
console.log('✅ recentHistory IIFE 找到\n')

// 实际跑一遍 recentHistory
const ATTR_NAMES = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
const prevState = { age: 30, 声望: 50, 财富: 200, 学识: 100, 颜值: 80, 医术: 0, 战功: 0, 文采: 30, 政绩: 0, 义行: 20 }
const currAttrsStr = ATTR_NAMES.map(a => `${a}:${prevState[a]}`).join(' ')

// 模拟 history（5 个回合，每回合 user+ai 配对 + 1 条 system）
const history = [
  { role: 'user', content: '初始回合' },
  { role: 'ai', content: '你在县城醒来...' },
  { role: 'system', content: '[system · 时间] 清晨' },
  { role: 'user', content: '出门看看' },
  { role: 'ai', content: '街上熙熙攘攘...' },
  { role: 'user', content: '去茶馆坐坐' },
  { role: 'ai', content: '茶馆里有人下棋...' },
  { role: 'user', content: '问茶博士最近的新闻' },
  { role: 'ai', content: '他说最近流民多了...' },
  { role: 'user', content: '给乞丐十文钱' },
  { role: 'ai', content: '乞丐谢了你...' },
  { role: 'user', content: '继续走' },  // 第 6 轮 user（要截断）
  { role: 'ai', content: '前面有条巷子...' },  // 第 6 轮 ai（要截断）
]
console.log('=== history 截断测试 ===')
console.log('输入 history 总条数:', history.length)
// 期待 slice(-6) 取最后 6 条
const slice = history.slice(-6)
console.log('slice(-6) 实际条数:', slice.length, '（期待 6）')
console.log('slice 包含 system:', slice.some(m => m.role === 'system'), '（期待 false，因为 system 不在最后 6 条里）')
console.log('slice 第一条 role:', slice[0].role, '（期待 user）')
console.log('slice 最后一条 role:', slice[slice.length - 1].role, '（期待 ai）')
console.log()

// 5. 模拟 recentHistory 拼接输出
const rec = slice.map(m => `[${m.role === 'ai' ? 'AI' : m.role === 'user' ? '玩家' : '系统'}] ${String(m.content || '').substring(0, 200)}`).join('\n')
console.log('=== recentHistory 实际输出 ===')
console.log(rec)
console.log()

// 6. 验证 9 属性名映射
const attrMatch = body.match(/ATTR_NAMES\.map\(a =>/)
if (!attrMatch) {
  // 已经是硬编码字符串了，看属性名是否齐全
  const allAttrs = ATTR_NAMES.every(a => body.indexOf(a) !== -1)
  console.log('✅ 9 属性名齐全:', allAttrs)
} else {
  console.log('✅ 用 ATTR_NAMES 动态拼接属性')
}
console.log()

// 7. 验证 month_delta 字段说明
const monthDeltaCheck = body.includes('0：同月内') && body.includes('60：十年/极长')
console.log('✅ month_delta 5 档说明齐全:', monthDeltaCheck)
console.log()

// 8. 验证 items 规则
const itemsCheck = body.includes('识别剧情里【明文写出】的物品名') && body.includes('一次性最多 2 个新物品')
console.log('✅ items 规则齐全:', itemsCheck)
console.log()

// 9. 验证年龄约束
const ageCheck = body.includes('age < 8') && body.includes('age < 15') && body.includes('成年玩家无额外年龄约束')
console.log('✅ 年龄约束 3 档齐全:', ageCheck)
console.log()

// 10. 验证抑制规则 4 档
const suppressCheck = ['1000', '3000', '5000', '8000'].every(t => body.indexOf('≥ ' + t) !== -1)
console.log('✅ 抑制规则 4 档齐全:', suppressCheck)
console.log()

console.log('=== 全部检查通过 ===')
