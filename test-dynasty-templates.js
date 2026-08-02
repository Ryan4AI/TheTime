/**
 * test-dynasty-templates.js —— 朝代生图模板单测
 *
 * ⚠️ 规则（先生 2026-08-02 20:01 拍板）：
 *   1. era_meta / generate_identity ERA_TABLE 加新朝代 → 本文件 ERA_META_DYNASTIES 必须同步加
 *   2. elements 加人物词 → 本文件人物词断言会拦（18:28 美女图根因）
 *   3. 每次改动 minigame/data/dynasty-templates.js → 必须保证本文件所有 case 仍通过
 *
 * 运行：node test-dynasty-templates.js
 */

const assert = require('assert')
const { PROMPT_BY_DYNASTY, getDynastyTemplate } = require('./minigame/data/dynasty-templates')

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅', name)
  } catch (e) {
    failed++
    failures.push({ name, error: e })
    console.log('  ❌', name, '——', e.message)
  }
}

// 期望列表：来源 generate_identity/index.js ERA_TABLE（2026-08-02 20:01 核对，21 个，不含排除的「中华人民共和国」）
const ERA_META_DYNASTIES = [
  '夏', '商', '西周', '春秋', '战国', '秦',
  '西汉', '东汉', '三国', '西晋', '东晋', '南北朝',
  '隋', '唐', '五代十国', '北宋', '南宋', '元', '明', '清', '中华民国',
]

// 人物词黑名单（18:28 美女图根因：模板人物词每轮必进 prompt → flux 必画人）
// 匹配方式：elements 按非字母分词 → 还原单数（scholars→scholar, ladies→lady）→ 查黑名单
const PERSON_WORDS = ['scholar', 'hermit', 'lady', 'apsara', 'warrior', 'woman', 'girl', 'man', 'portrait', 'face', 'figure', 'person', 'character', 'people', 'human', 'horseman', 'courtier', 'maiden', 'princess', 'emperor', 'king', 'official', 'soldier', 'monk']

function normalizeWord(word) {
  let w = word.toLowerCase()
  if (w.endsWith('ies')) w = w.slice(0, -3) + 'y'
  else if (w.endsWith('es')) w = w.slice(0, -2)
  else if (w.endsWith('s')) w = w.slice(0, -1)
  return w
}

console.log('🧪 朝代生图模板单测\n')

console.log('── 1. 数据源全覆盖（era_meta 每个朝代都有专属模板，不静默走 default）──')
test('21 个朝代值全部有非 default 模板', () => {
  const miss = ERA_META_DYNASTIES.filter(e => !PROMPT_BY_DYNASTY[e])
  assert.strictEqual(miss.length, 0, '缺失朝代: ' + miss.join(','))
  const fallback = ERA_META_DYNASTIES.filter(e => getDynastyTemplate(e) === PROMPT_BY_DYNASTY['default'])
  assert.strictEqual(fallback.length, 0, '静默走 default 的朝代: ' + fallback.join(','))
})
test('模板 key 与期望列表完全一致（无多余无缺失）', () => {
  const keys = Object.keys(PROMPT_BY_DYNASTY).filter(k => k !== 'default').sort()
  const expected = [...ERA_META_DYNASTIES].sort()
  assert.deepStrictEqual(keys, expected, '模板 key=' + keys.join(',') + ' vs 期望=' + expected.join(','))
})

console.log('\n── 2. 模板质量（18:28 根因固化）──')
test('所有模板 style + elements 非空', () => {
  for (const [k, v] of Object.entries(PROMPT_BY_DYNASTY)) {
    assert.ok(v.style && v.style.length > 0, k + ' style 为空')
    assert.ok(v.elements && v.elements.length > 0, k + ' elements 为空')
  }
})
test('所有模板 elements 无人物词', () => {
  const bad = []
  for (const [k, v] of Object.entries(PROMPT_BY_DYNASTY)) {
    const words = v.elements.split(/[^a-z]+/i).map(normalizeWord)
    for (const w of PERSON_WORDS) {
      if (words.includes(w)) bad.push(k + '→' + w)
    }
  }
  assert.strictEqual(bad.length, 0, '含人物词: ' + bad.join(', '))
})

console.log('\n── 3. 匹配行为 ──')
test('先生当前朝代「五代十国」→ 五代山水模板', () => {
  const t = getDynastyTemplate('五代十国')
  assert.strictEqual(t.style, 'Five dynasties Chinese landscape')
  assert.ok(t.elements.includes('mountains'))
})
test('北宋 → 宋模板', () => {
  const t = getDynastyTemplate('北宋')
  assert.ok(t.style.includes('Song dynasty'))
})
test('未知朝代 → default 兜底（不崩）', () => {
  const t = getDynastyTemplate('外星文明')
  assert.strictEqual(t, PROMPT_BY_DYNASTY['default'])
})
test('空值 → default 兜底', () => {
  assert.strictEqual(getDynastyTemplate(''), PROMPT_BY_DYNASTY['default'])
  assert.strictEqual(getDynastyTemplate(undefined), PROMPT_BY_DYNASTY['default'])
})

console.log('\n──────────────────')
console.log(`结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('\n失败明细:')
  failures.forEach(f => console.log('  ❌', f.name, '\n    ', f.error.message))
  process.exit(1)
}
