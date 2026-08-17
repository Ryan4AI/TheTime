/**
 * parse-ai-output.test.js —— AI 叙事输出解析单测
 *
 * ⚠️ 规则（先生 2026-08-02 拍板）：
 *   1. 每遇到一次真实解析失败 → 往本文件加一个 case（用真实 AI 输出，标注 request_id/日期）
 *   2. 每次改动 parse-ai-output.js → 必须保证本文件所有 case 仍通过
 *
 * 运行：node cloudfunctions/ai_narrate_worker/parse-ai-output.test.js
 */

const assert = require('assert')
const { parseAIOutput, fixJSONContentQuotes, fallbackExtractBranch } = require('./parse-ai-output')

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

// 从 branches 里拿 options 的辅助：兼容单对象/数组
function getOptions(branches) {
  if (!branches) return null
  if (Array.isArray(branches)) return branches[0] && branches[0].options
  return branches.options
}
function getContent(branches) {
  if (!branches) return null
  if (Array.isArray(branches)) return branches[0] && branches[0].content
  return branches.content
}

console.log('\n=== 场景 1：完全正常（单对象）===')
test('正常单对象直接解析', () => {
  const { branches, parseError, repaired } = parseAIOutput('{"content":"正常内容","options":["a","b","c"]}')
  assert.ok(branches, 'branches 不应为 null')
  assert.strictEqual(parseError, null)
  assert.strictEqual(repaired, false, '正常输入不应标记 repaired')
  assert.deepStrictEqual(getOptions(branches), ['a', 'b', 'c'])
})

console.log('\n=== 场景 2：完全正常（数组格式）===')
test('正常数组格式解析', () => {
  const { branches } = parseAIOutput('[{"p":1,"content":"内容A","options":["x","y","z"],"patch":{}}]')
  assert.ok(branches)
  assert.deepStrictEqual(getOptions(branches), ['x', 'y', 'z'])
})

console.log('\n=== 场景 3：带 think 标签 + ```json 围栏 ===')
test('think 标签和围栏被剥离', () => {
  const { branches } = parseAIOutput('<think>思考内容</think>```json\n{"content":"内容B","options":["1","2","3"]}\n```')
  assert.ok(branches)
  assert.strictEqual(getContent(branches), '内容B')
})

console.log('\n=== 场景 4：content 裸英文引号（老问题，fixJSONContentQuotes 修复）===')
test('裸引号修复：他说"快跑"然后走了（未转义）', () => {
  // 注意：这里 \" 是 JS 字符串里的转义，最终 JSON 文本里是裸 "（非法 JSON，需修复）
  const { branches, parseError, repaired } = parseAIOutput('{"content":"他说"快跑"然后走了","options":["a","b","c"]}')
  assert.ok(branches, 'branches 不应为 null')
  assert.strictEqual(parseError, null)
  assert.strictEqual(repaired, true, '裸引号修复应标记 repaired')
  assert.deepStrictEqual(getOptions(branches), ['a', 'b', 'c'])
})

test('合法转义引号直接解析（不触发修复）', () => {
  // \" 是合法 JSON 转义，第一轮就成功，repaired=false
  const { branches, repaired } = parseAIOutput('{"content":"他说\\"快跑\\"，然后走了","options":["a","b","c"]}')
  assert.ok(branches)
  assert.strictEqual(repaired, false, '合法转义不应标记 repaired')
  assert.deepStrictEqual(getOptions(branches), ['a', 'b', 'c'])
})

console.log('\n=== 场景 5：AI 二次转义（2026-08-02 01:06 真实案例 narrate_1785603959545_kkwb3y）===')
test('options 部分二次转义 \\"options\\":[\\"a\\"...]', () => {
  const raw = '{"content":"你屏住呼吸，没有答话。坑口探出一张脸来——是个年轻妇人，约莫二十出头，衣衫破旧，脸上全是灰。她看见你，愣了一下，随即压低声音：「真的是人，不是鬼？」\\n\\n你警惕地打量她：「你是谁？」\\n\\n妇人往坑口蹲了蹲，泪珠滚落：「我是被抓去衙门问话的那个……他们没追上我，我躲在林子里，听见这边有动静……」她抹了把脸，「恩公，你是谁？为何也在这里？」\\n\\n你心中一凛——这就是城东那户人家的新娘子，手电筒的事还没撇清。\\n\\n她探头往坑底看了一眼，忽然浑身一震，指向你怀里的手电筒：「那、那个东西……你也有一个？」\\n\\n她的眼神变得复杂：「我爹临死前给过我一个，说是从北边淘来的……和你们的一模一样。」她攥紧衣角，「他们追我，就是追的这个。」\\n\\n林子那头传来马蹄声，由远及近。妇人的脸色刷地白了：「他们又来了！」",\\"options\\":[\\"让她下来躲，先问清楚她知道什么\\", \\"让她赶紧跑，自己另找出路\\", \\"把手电筒和铁匣子的事告诉她，看她反应\\"]}'
  const { branches, parseError, fallbackUsed, repaired } = parseAIOutput(raw)
  assert.ok(branches, 'branches 不应为 null')
  assert.strictEqual(parseError, null)
  assert.strictEqual(fallbackUsed, false, '应走去转义路径而非 fallback')
  assert.strictEqual(repaired, true, '去转义成功应标记 repaired')
  assert.deepStrictEqual(getOptions(branches), [
    '让她下来躲，先问清楚她知道什么',
    '让她赶紧跑，自己另找出路',
    '把手电筒和铁匣子的事告诉她，看她反应',
  ])
  // content 完整保留
  assert.ok(getContent(branches).includes('你屏住呼吸'), 'content 应完整')
  assert.ok(getContent(branches).includes('他们又来了'), 'content 应到结尾')
})

console.log('\n=== 场景 6：content 合法转义 + options 二次转义（混合最坏情况）===')
test('混合错误：content \\" 合法 + options \\" 二次转义', () => {
  const raw = '{"content":"他说\\"快跑\\"，然后走了",\\"options\\":[\\"a\\", \\"b\\"]}'
  const { branches, parseError } = parseAIOutput(raw)
  assert.ok(branches, 'branches 不应为 null')
  assert.strictEqual(parseError, null)
  // fallback 路径应保住真实 options
  assert.deepStrictEqual(getOptions(branches), ['a', 'b'])
})

console.log('\n=== 场景 7：整段二次转义（content 也被转义）===')
test('整段 \\" 转义也能恢复', () => {
  const raw = '{\\"content\\":\\"你好世界\\",\\"options\\":[\\"a\\", \\"b\\"]}'
  const { branches, parseError } = parseAIOutput(raw)
  assert.ok(branches, 'branches 不应为 null')
  assert.strictEqual(parseError, null)
  assert.deepStrictEqual(getOptions(branches), ['a', 'b'])
})

console.log('\n=== 场景 8：前后有废话文本（AI 输出前带解释）===')
test('前后废话被截取逻辑剥离', () => {
  const { branches } = parseAIOutput('好的，这是你的下一段经历：\n{"content":"故事内容","options":["甲","乙","丙"]}\n希望你喜欢！')
  assert.ok(branches)
  assert.strictEqual(getContent(branches), '故事内容')
})

console.log('\n=== 场景 9：完全无法解析（应返回 null + parseError）===')
test('短纯文本无 JSON 结构', () => {
  const { branches, parseError } = parseAIOutput('你走进一片树林，四周静悄悄的。')
  // 无 { / [ / "content" 且 <20 字 → 解析彻底失败
  assert.strictEqual(branches, null)
  assert.ok(parseError, '应有 parseError')
})

console.log('\n=== 场景 10：空输入 ===')
test('空字符串返回 null', () => {
  const { branches, parseError } = parseAIOutput('')
  assert.strictEqual(branches, null)
  assert.ok(parseError, '空输入应有 parseError')
})

console.log('\n=== 场景 11：options 里含中文引号（「」）不受影响 ===')
test('中文引号选项正常解析', () => {
  const { branches } = parseAIOutput('{"content":"内容","options":["他说「快跑」","别动","等"]}')
  assert.ok(branches)
  assert.deepStrictEqual(getOptions(branches), ['他说「快跑」', '别动', '等'])
})

console.log('\n=== 场景 12：AI 输出数组带 p 字段（v3.0.9 单分支格式）===')
test('数组 [{p:1,content,options,patch}] 正常', () => {
  const { branches } = parseAIOutput('[{"p":1,"content":"内容","options":["继续观察","尝试离开","寻找机会"],"patch":{}}]')
  assert.ok(branches)
  assert.deepStrictEqual(getOptions(branches), ['继续观察', '尝试离开', '寻找机会'])
})

console.log('\n=== 场景 13：fallback 抽 content 成功但 options 是兜底（D090-hotfix5 纯文本）===')
test('纯叙事文本 fallback 兜底 options', () => {
  const { branches, fallbackUsed } = parseAIOutput('你推开后窗，翻身跳了出去。窗外是一片荒废的菜园子，杂草没过膝盖。身后传来破门声，你不敢回头。')
  assert.ok(branches)
  assert.ok(fallbackUsed, '应走 fallback')
  assert.deepStrictEqual(getOptions(branches), ['继续观察', '尝试离开', '寻找机会'])
})

console.log('\n=== 场景 14：截断 JSON——只有 content 没有闭合（2026-08-03 真实 case narrate_1785685119028_8txzez）===')
test('截断 JSON 不再把 JSON 原文当 content', () => {
  const raw = '{"content":"营地里一片混乱，士兵们急匆匆地往前方赶。你逆着人流往回走，远远看见王朴站在辎重车旁，正朝你使眼色。\\n\\n「出事了，」他压低声音，「先锋遭伏，陛下召各将议事。这是千载难逢的机会——趁营中空虚，你现在就走。」\\n\\n「可城门守卫——」\\n\\n「我已安排好了。」王朴塞过来一块令牌，「凭这个出营，路上有人接应。你连夜赶回汴京，潜入内库取铁器。天亮前必须离开汴京城。」\\n\\n他看着你，目光复杂：「记住，铁器到手后，直接去城南的铁匠铺。铺主是我的人，他会帮你熔毁。」\\n\\n远处号角声响，大军正在集结。你攥紧令牌，正要动身，忽然瞥见那个报信的禁军正站在人群中盯着你，眼神阴沉。'
  const { branches, fallbackUsed } = parseAIOutput(raw)
  assert.ok(branches, '应解析出分支')
  assert.ok(fallbackUsed, '截断 JSON 应走 fallback')
  const content = getContent(branches)
  assert.ok(content, '应有 content')
  assert.ok(content.startsWith('营地里一片混乱'), 'content 应是正文而不是 JSON 原文')
  assert.ok(!content.startsWith('{"content"'), 'content 不应是 JSON 原文')
  assert.deepStrictEqual(getOptions(branches), ['继续观察', '尝试离开', '寻找机会'])
})

console.log('\n=== 场景 15：双重嵌套完整 JSON（2026-08-03，AI 把 content 值又序列化一次）===')
test('双重嵌套完整 JSON 剥出内层 content/options', () => {
  const raw = '{"content":"{\\"content\\":\\"双重嵌套正文测试\\",\\"options\\":[\\"甲\\",\\"乙\\",\\"丙\\"]}"}'
  const { branches } = parseAIOutput(raw)
  assert.ok(branches, '应解析出分支')
  assert.strictEqual(getContent(branches), '双重嵌套正文测试')
  assert.deepStrictEqual(getOptions(branches), ['甲', '乙', '丙'])
})

console.log('\n=== 场景 16：截断的双重嵌套（内层也没闭合）===')
test('截断双重嵌套剥壳', () => {
  const raw = '{"content":"{\\"content\\":\\"截断的嵌套正文测试，写到一半就没了。\\"}"}'
  const { branches, fallbackUsed } = parseAIOutput(raw)
  assert.ok(branches, '应解析出分支')
  const content = getContent(branches)
  assert.ok(content.startsWith('截断的嵌套正文测试'), 'content 应是内层正文')
  assert.ok(!content.startsWith('{"content"'), 'content 不应是 JSON 原文')
})

console.log('\n=== 场景 17：options 含转义引号（\"门\"）===')
test('options 里有转义引号不被拆断', () => {
  const raw = '{content "你走到翠姑身边。", "options ["追问更多关于\\"门\\"的秘密", "让哑巴师父先休息", "把翠姑叫醒告诉她真相"]}'
  const { branches } = parseAIOutput(raw)
  assert.ok(branches, '应解析出分支')
  const opts = getOptions(branches)
  assert.strictEqual(opts.length, 3, '应有3个选项')
  assert.ok(opts[0].includes('门'), '第一个选项应包含"门"')
})

// ═══════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50))
console.log(`结果：${passed} 通过，${failed} 失败`)
if (failed > 0) {
  console.log('\n失败明细：')
  failures.forEach(f => console.log('  ❌', f.name, '\n    ', f.error.message))
  process.exit(1)
} else {
  console.log('全部通过 ✅')
}
