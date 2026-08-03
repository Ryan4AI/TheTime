/**
 * test-scene-fallback.js —— 生图兜底场景匹配单测
 *
 * 覆盖：sceneTypeFromChinese 关键词表 + SCENE_EN_FALLBACK 模板完整性
 * 2026-08-04 01:35 巡检补写：08-03 两次修改（兵字误命中/河床优先）无单测，防回归
 *
 * 运行：node minigame/data/test-scene-fallback.js
 * 维护规则：改 sceneTypeFromChinese 关键词或 SCENE_EN_FALLBACK 模板 → 同步更新本文件
 */

// ── 与 game.js 保持一致（提取自 buildPollinationsPrompt 相关代码） ──
const SCENE_EN_FALLBACK = {
  battlefield: 'ancient battlefield, banners, misty plain, distant war drums',
  palace: 'ancient palace courtyard, carved columns, misty morning light',
  temple: 'ancient temple on a mountain path, misty forest, stone steps',
  countryside: 'ancient countryside village, rice paddies, misty mountains',
  river: 'ancient river scene, wooden boats, misty water, willow trees',
  market: 'ancient market street, stalls, lanterns, busy crowd in distance',
  night: 'ancient city at night, moonlight, shadowy rooftops, lantern glow',
  winter: 'ancient buildings in snow, bare trees, grey sky',
  storm: 'storm over ancient city, dark clouds, rain, banners whipping',
  city: 'ancient Chinese city street, misty morning, rooftops and walls',
}

function sceneTypeFromChinese(text) {
  if (/战|杀|战场|刀|兵刃|厮杀|打仗|交战|冲锋|攻城|兵器|厮杀声/.test(text)) return 'battlefield'
  if (/宫|殿|皇|龙/.test(text)) return 'palace'
  if (/寺|庙|观|佛|道/.test(text)) return 'temple'
  if (/村|田|乡|农/.test(text)) return 'countryside'
  if (/河|江|湖|舟|船|水|渡|溪|河床|滩/.test(text)) return 'river'
  if (/市|集|商|街|闹|坊/.test(text)) return 'market'
  if (/夜|月|宵|晚/.test(text)) return 'night'
  if (/冬|雪|寒|冰/.test(text)) return 'winter'
  if (/雷|暴|雨|风/.test(text)) return 'storm'
  return 'city'
}

// ── 用例 ──
const CASES = [
  // 08-03 18:46 先生案例：河床乱石躲藏 + 追兵 → 必须 river（兵字不得误命中战场）
  ['你一把拉过翠姑和哑巴师父，三人钻进河床的乱石堆里。石头被日头晒得发烫，趴在上面烫得皮肤生疼。追兵的脚步声从崖上传来', 'river'],
  // 强战场词 → battlefield
  ['士兵们冲向敌阵，刀光剑影，厮杀声震天', 'battlefield'],
  ['两军交战，攻城锤撞向城门', 'battlefield'],
  // 常规场景
  ['城门口挤满了人，商贩叫卖', 'market'],
  ['月光洒在屋顶上，万籁俱寂', 'night'],
  ['山间古寺，钟声悠扬', 'temple'],
  ['田间稻浪，农夫劳作', 'countryside'],
  ['暴雨如注，电闪雷鸣', 'storm'],
  ['大雪封山，寒风刺骨', 'winter'],
  ['大殿之上，龙椅高悬', 'palace'],
  // 无场景词 → city 兜底
  ['他沉默不语，只是点头', 'city'],
]

let pass = 0
let fail = 0
for (const [input, expect] of CASES) {
  const got = sceneTypeFromChinese(input)
  if (got === expect) {
    pass++
    console.log(`✅ ${input.slice(0, 30)}… → ${got}`)
  } else {
    fail++
    console.log(`❌ ${input.slice(0, 30)}… → ${got}（期望 ${expect}）`)
  }
}

// 模板完整性：每个类型必须有非空模板，且不含人物词（08-02 18:28 美女图根因，防回归）
const FORBIDDEN = ['lady', 'woman', 'girl', 'man portrait', 'scholar', 'hermit', 'apsara', 'court lady', 'warrior']
let tmplOk = true
for (const type of Object.keys(SCENE_EN_FALLBACK)) {
  const t = SCENE_EN_FALLBACK[type]
  if (!t || t.length < 10) { tmplOk = false; console.log(`❌ 模板缺失/过短: ${type}`); continue }
  for (const f of FORBIDDEN) {
    if (t.toLowerCase().includes(f)) { tmplOk = false; console.log(`❌ 模板含人物词「${f}」: ${type}`) }
  }
}
if (tmplOk) console.log(`✅ 模板 ${Object.keys(SCENE_EN_FALLBACK).length} 个全有效且无人物词`)

console.log(`\n结果：${pass}/${CASES.length} 通过，模板${tmplOk ? 'OK' : 'FAIL'}${fail ? '，失败 ' + fail : ''}`)
process.exit(fail > 0 || !tmplOk ? 1 : 0)
