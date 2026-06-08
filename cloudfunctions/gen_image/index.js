/**
 * 云函数：gen_image
 *
 * 穿越日记 · 水墨场景图生成
 * 接收朝代+场景类型 → 调用 Pollinations API → 返回图片 URL
 *
 * 输入：
 * { era: "宋代", scene_type: "city", mood: "繁华" }
 *
 * 输出：
 * { url: "https://...", success: true }
 * 或 { url: null, success: false, fallback: true }
 *
 * 引擎：Pollinations.ai（免费，无需 key）
 * 备用：返回 null，前端用纯黑背景
 */

// Pollinations 支持的场景类型 prompt 模板（英文）
const SCENE_PROMPTS = {
  city:       '%s city street scene, traditional Chinese shuimo ink wash painting, misty, monochrome brushstrokes, ancient China architecture, atmospheric',
  palace:     '%s palace courtyard, Chinese ink wash painting, shuimo style, ancient architecture, misty, minimal brushwork, traditional China',
  battlefield:'%s battlefield, Chinese ink wash painting, shuimo, ancient warfare, dramatic sky, monochrome brushstrokes',
  countryside:'%s countryside village, Chinese ink wash painting, shuimo, misty mountains, rice paddies, traditional China, atmospheric perspective',
  river:      '%s river scene, Chinese ink wash painting, shuimo, boats, willows, misty water, ancient China landscape',
  temple:     '%s temple mountain path, Chinese ink wash painting, shuimo, misty forest, ancient architecture, minimal brushwork',
  market:     '%s market street, Chinese ink wash painting, shuimo, bustling crowd, traditional shops, misty atmosphere, ancient China',
  night:      '%s night scene moonlight, Chinese ink wash painting, shuimo, ancient buildings, moonlit, misty, traditional China landscape',
  winter:     '%s winter snow scene, Chinese ink wash painting, shuimo, snow covered ancient buildings, bare trees, misty monochrome',
  storm:      '%s storm scene, Chinese ink wash painting, shuimo, dramatic clouds, rain, ancient buildings, dark brushstrokes',
}

// 朝代名称映射（中文→英文）
const ERA_MAP = {
  '秦': 'Qin Dynasty',
  '汉': 'Han Dynasty', '西汉': 'Han Dynasty', '东汉': 'Han Dynasty',
  '三国': 'Three Kingdoms',
  '晋': 'Jin Dynasty', '西晋': 'Jin Dynasty', '东晋': 'Jin Dynasty',
  '南北朝': 'Southern and Northern Dynasties',
  '隋': 'Sui Dynasty',
  '唐': 'Tang Dynasty',
  '五代': 'Five Dynasties',
  '宋': 'Song Dynasty', '北宋': 'Song Dynasty', '南宋': 'Song Dynasty',
  '辽': 'Liao Dynasty',
  '金': 'Jin Dynasty',
  '元': 'Yuan Dynasty',
  '明': 'Ming Dynasty',
  '清': 'Qing Dynasty',
  '民国': 'Republic of China',
}

function getEraEn(nameCn) {
  for (const [cn, en] of Object.entries(ERA_MAP)) {
    if (nameCn.includes(cn)) return en
  }
  return 'Ancient China'
}

function getSceneType(sceneDescribe) {
  const kw = sceneDescribe.toLowerCase()
  if (kw.includes('战') || kw.includes('杀') || kw.includes('战场') || kw.includes('刀') || kw.includes('兵')) return 'battlefield'
  if (kw.includes('宫') || kw.includes('殿') || kw.includes('皇') || kw.includes('龙')) return 'palace'
  if (kw.includes('寺') || kw.includes('庙') || kw.includes('观') || kw.includes('佛') || kw.includes('道')) return 'temple'
  if (kw.includes('村') || kw.includes('田') || kw.includes('乡') || kw.includes('农')) return 'countryside'
  if (kw.includes('河') || kw.includes('江') || kw.includes('湖') || kw.includes('舟') || kw.includes('船') || kw.includes('水') || kw.includes('渡')) return 'river'
  if (kw.includes('市') || kw.includes('集') || kw.includes('商') || kw.includes('街') || kw.includes('闹')) return 'market'
  if (kw.includes('夜') || kw.includes('月') || kw.includes('宵') || kw.includes('晚')) return 'night'
  if (kw.includes('冬') || kw.includes('雪') || kw.includes('寒') || kw.includes('冰')) return 'winter'
  if (kw.includes('雷') || kw.includes('暴') || kw.includes('雨') || kw.includes('风')) return 'storm'
  return 'city'
}

// 主函数
exports.main = async (event) => {
  const { era, scene_describe, mood } = event

  // 生成 prompt
  const eraEn = getEraEn(era || '')
  const sceneType = getSceneType(scene_describe || '')
  const promptTemplate = SCENE_PROMPTS[sceneType] || SCENE_PROMPTS.city
  const prompt = promptTemplate.replace('%s', eraEn)

  // 加 mood
  const fullPrompt = mood ? `${prompt}, ${mood}` : prompt

  // 种子：用 era+sceneType 的 hash 确保同一场景出图一致
  const seed = (fullPrompt.length * 7 + sceneType.length * 31) % 10000

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=540&height=960&seed=${seed}&nologo=true`

  return {
    url: url,
    prompt: fullPrompt,
    seed: seed,
    scene_type: sceneType,
    success: true,
  }
}
