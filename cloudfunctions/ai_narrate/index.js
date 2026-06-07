/**
 * 云函数：ai_narrate
 *
 * 穿越日记 AI 叙事引擎
 * 接收当前状态 → 构建 prompt + 调用 DeepSeek → 返回平行分支 → 系统随机选取
 *
 * 输入：
 * {
 *   action: "init" | "continue",
 *   state: { ... },           // 当前完整状态
 *   input: "初始回合" | "玩家选择的选项文字" | "自由输入文字",
 *   history: [                 // 最近3轮对话（可选）
 *     { role: "ai", content: "..." },
 *     { role: "user", content: "..." }
 *   ]
 * }
 *
 * 输出：
 * {
 *   branch: { content, options, patch },  // 系统随机选中的1个分支
 *   branches: [ ... ],                     // 全部分支（供 ai_message 存储）
 *   state: { ... },                        // 更新后的状态
 *   new_month: year/month 变化信息,
 *   event: { title, description } | null   // 当月事件
 * }
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const https = require('https')

// ─────── 配置 ────────
// v0.1.67 临时切回 MiniMax-M2.7（DeepSeek 402 余额不足，等先生充值后切回）
const MM_API_KEY = process.env.MM_API_KEY || 'sk-cp-c5wSwWsnIcUkewTEe9JhETRKZNyJ1OBnphm_4B1HdOV0LMNh9vP80kJFBKZV5jpCtp22_xyBUtF0zRAwgWaxU4YECc_LL8GPzEj6GVOHmMiovcfwylDgCDM'
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7'  // 切回 M2.7 兜底

// P2.11 切换为 DeepSeek（速度快 10 倍）— v0.1.67 暂时注释，等先生充值
// const DS_API_KEY = process.env.DS_API_KEY
// const DS_BASE_URL = 'https://api.deepseek.com/v1'
// const DS_MODEL = 'deepseek-v4-flash'
const MAX_TOKENS = 3500  // v0.1.68 砍到 3500 提速（M2.7 实测 3000 token 够用）
const TEMPERATURE = 0.85

// ─────── 入口 ────────
exports.main = async (event) => {
  const { state, input, history, is_retry } = event

  if (!state) {
    return { error: '缺少 state', code: 400 }
  }

  // v0.1.63 (D005): 重试是前端网络兜底，不是玩家真实输入
  // 不推进月份（避免重试一次多 1 个月），不写 userPrompt 给 AI
  const isRetry = !!is_retry
  const realInput = isRetry ? '' : (input || '')

  try {
    // 1. 推进月份 / 年龄 / 其他系统状态
    // 重试时不推进（同一回合的多次网络重试不应消耗时间）
    const updated = isRetry ? state : updateState(state, input)

    // 2. 查当月历史事件（如有）
    const monthEvent = await queryMonthEvent(updated)

    // 3. 构建 prompt + 调 DeepSeek
    // v0.1.63 (D005): 重试时 realInput = ''，云函数走 init 路径
    // 触发 AI 重新生成当前回合内容（不开新回合）
    const { branches, systemPrompt, userPrompt, messages, rawContent } = await callAI(updated, realInput, history, monthEvent, isRetry)

    // 4. 随机选一个分支
    const picked = pickBranch(branches)

    // 5. 标记月份变化
    const monthChanged = updated.month !== state.month || updated.year !== state.year

    return {
      success: true,
      branch: picked,
      branches: branches,           // v0.1.62: 全部分支（先生调试用）
      state: updated,
      month_changed: monthChanged,
      new_month: monthChanged ? updated.month : null,
      new_year: monthChanged ? updated.year : null,
      event: monthEvent,
      is_retry: isRetry,  // v0.1.63 (D005): 透传重试标记（前端可据此跳过某些副作用）
      // v0.1.62: 调试字段 — 让前端能看到完整发给 AI 的内容
      debug: {
        system_prompt: systemPrompt,    // 完整 system 消息原文
        user_prompt: userPrompt,        // 完整 user 消息原文
        messages: messages,             // v0.1.64: 完整 messages 数组（system + history + user），先生要的"完整输入"
        raw_response: rawContent,       // DeepSeek 原始返回（未清洗）
      },
    }
  } catch (e) {
    console.error('ai_narrate 错误:', e)
    return { error: e.message || 'AI服务暂不可用', code: 500 }
  }
}

// ─────── 系统状态更新 ────────
// v0.1.66: 不再分 init/continue，统一按"玩家做了一件事"推进 1 步
function updateState(state, input) {
  let s = { ...state }

  // 初始化月份
  if (!s.month) s.month = 1
  if (!s.health) s.health = 100
  if (!s.coin) s.coin = 1000
  if (!s.alive) s.alive = true

  // 第 1 轮：玩家还没做过选择，state.round = 0
  // 之后每调一次 AI 推进 1 轮（1 个月）
  s.round = (s.round || 0) + 1
  s.month += 1

  if (s.month > 12) {
    s.month = 1
    s.year += 1
    s.age += 1

    // 每年健康自然衰减（年龄越大衰减越快）
    if (s.age < 30) s.health = Math.max(0, (s.health || 100) - 2)
    else if (s.age < 50) s.health = Math.max(0, (s.health || 100) - 5)
    else if (s.age < 65) s.health = Math.max(0, (s.health || 100) - 10)
    else s.health = Math.max(0, (s.health || 100) - 15)

    // 死亡判定：健康 ≤ 0
    if (s.health <= 0) s.alive = false
  }

  return s
}

// ─────── 查询当月历史事件 ────────
async function queryMonthEvent(state) {
  try {
    // 先精确匹配
    let res = await db.collection('event')
      .where({
        year: state.year,
        month: state.month,
      })
      .get()

    if (res.data && res.data.length > 0) {
      // 如果有该城市特定事件，优先用
      const cityEvent = res.data.filter(e => e.city === (state.city || state.city_name))
      if (cityEvent.length > 0) return cityEvent[0]
      // 否则用全国性事件
      const national = res.data.filter(e => e.scope === 'national' || !e.city || e.city === '全国')
      if (national.length > 0) return national[0]
      return res.data[0]
    }

    return null
  } catch (e) {
    console.error('查事件失败:', e)
    return null
  }
}

// ─────── 调用 DeepSeek ────────
async function callAI(state, input, history, monthEvent, isRetry) {
  const systemPrompt = buildSystemPrompt(state, monthEvent)
  const userPrompt = buildUserPrompt(input, history)

  const messages = []
  messages.push({ role: 'system', content: systemPrompt })

  // 注入对话历史（最近3轮，避免超出上下文）
  if (history && Array.isArray(history)) {
    const recent = history.slice(-6)
    for (const msg of recent) {
      if (msg.role === 'ai') messages.push({ role: 'assistant', content: msg.content })
      else messages.push({ role: 'user', content: msg.content })
    }
  }

  // v0.1.63 (D005): 重试时，realInput = ''，且不应在 messages 末尾追加空 user
  // 让 AI 看到 history 最后一条 assistant 后自然续写（重生成当前回合）
  if (!isRetry) {
    messages.push({ role: 'user', content: userPrompt })
  }

  const response = await callLLM(messages)

  // 解析 AI 输出 JSON
  const content = response.choices?.[0]?.message?.content || ''

  // ── 清洗逻辑（v0.1.59 重写）──
  // 1) 去掉 markdown 代码块包裹
  // 2) 去掉 <think>...</think> 推理块（DeepSeek / MiniMax 都会输出）
  // 3) 兜底：找第一个 [ 到最后一个 ] 切出 JSON 数组
  let cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim()

  // 找 JSON 数组边界（容错：模型可能在前后加废话）
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1)
  }

  // 解析失败时：完整记录原始内容（不截断）+ 返回明确错误，**禁止伪装成正常分支**
  let branches
  try {
    branches = JSON.parse(cleaned)
    if (!Array.isArray(branches)) {
      if (branches.items && Array.isArray(branches.items)) branches = branches.items
      else if (branches.branches && Array.isArray(branches.branches)) branches = branches.branches
      else throw new Error('非数组格式')
    }
  } catch (e) {
    // 埋点：完整原始内容 + cleaned 内容 + 错误信息
    console.error('[ai_narrate] JSON解析失败')
    console.error('[ai_narrate] 错误:', e.message)
    console.error('[ai_narrate] 原始 content(完整):', content)
    console.error('[ai_narrate] 清洗后 cleaned(完整):', cleaned)

    // 抛错给上层处理（前端会用史官文案显示）
    throw new Error('AI输出无法解析为分支数组')
  }

  // 校验每个分支有必填字段（options 缺了直接抛错，不补默认）
  branches.forEach((b, i) => {
    if (!b.content) throw new Error(`分支${i}缺少content`)
    if (!Array.isArray(b.options) || b.options.length === 0) {
      throw new Error(`分支${i}缺少options`)
    }
  })

  const finalBranches = branches.map((b, i) => ({
    p: typeof b.p === 'number' ? b.p : (b.probability || (1 / branches.length)),
    content: b.content || b.text || b.narrative || '',
    options: b.options || b.choices || ['继续'],
    patch: b.patch || b.state || {}
  }))

  // v0.1.62: 把完整 message 流和 DeepSeek 原始返回也带回去（先生调试用）
  return {
    branches: finalBranches,
    systemPrompt: systemPrompt,
    userPrompt: userPrompt,
    messages: messages,           // 完整发给 DeepSeek 的 messages 数组
    rawContent: content,          // DeepSeek 原始 content（含 <think>）
  }
}

// ─────── 构建 System Prompt ────────
// v10 质量自检 16 条 + 铁律追加 4 条 + 写作风格追加 2 条 + 节奏段 1 段 + 禁忌词 1 段 + 输出格式 patch 段增强（D007 · 2026-06-07）
//
// 每条规则的 skill 来源追溯（不要写入 prompt 字符串，只在源码注释里给回看用）：
//
// 【铁律 6-9 条】
//   #6 NPC 不主动推主线  ← story-cog "Character drives plot"
//   #7 NPC 性格不突变    ← writing-claw "Characters do not change without cause"
//   #8 国家级事件不中断  ← writing-claw "Overarching plots are not subplots"
//   #9 上世死法=下世召唤  ← story-structure-builder Hero's Journey（跨世变体）
//
// 【写作风格 8-9 条】
//   #8 写动作不写形容词  ← story-cog "Show, don't tell"
//   #9 不宣告主题       ← writing-claw "Theme is a pressure, not a message"
//
// 【节奏段 1 段】
//   起承转合          ← story-structure-builder "Kishōtenketsu"
//
// 【自检 1-16 条】
//   #1 声音契约        ← the-storytellers-workbench "Voice is a contract"
//   #2 戏剧张力        ← the-storytellers-workbench "Tension is the engine"
//   #3 物品一致        ← v9 铁律 #4 升级
//   #4 阶层一致        ← v9 写作风格 + story-cog "Genre expectations"
//   #5 具体细节        ← story-cog "Specific details" + the-storytellers-workbench "Humour is precision"
//   #6 戏剧问题        ← writing-claw "Every scene has a dramatic question"
//   #7 场景动 2 件事    ← writing-claw consistency rule #3
//   #8 信息密度        ← v9 写作风格 + inkos length governance
//   #9 爽点密度        ← novel-writers 借鉴 + design.md §3.5 真实定位
//   #10 角色矛盾       ← the-storytellers-workbench "Character is contradiction"
//   #11 节奏分配       ← the-storytellers-workbench "Pacing is rhythm, not speed"
//   #12 物品母题       ← writing-claw "Motif earns meaning through repetition"
//   #13 回合末钩子     ← novel-writers "每章末钩子"（番茄套路改造）
//   #14 NPC 同框       ← writing-claw "Gap is not absence"
//   #15 NPC 行为一致    ← novel-writers "逻辑合理性"
//   #16 情感真实       ← story-cog "Emotional truth"
//
// 【输出格式 patch 段】先生 5:20-5:32 多次拍板
//   - patch 含义嵌进 JSON 示例（不要单独段）
//   - 物品 id 数字 = durability 损耗值；"lost" = 立即丢失；字符串 = desc 后缀
//   - 不限定 coin/health 变化幅度（AI 根据剧情定）
//   - 死亡由系统判定，不由 patch 控制
//
// 【禁忌词段】v9 缺失补全
//
// 跳过（不采纳）：
//   - inkos 整包（架构错配 + AGPL-3.0）
//   - story-cog CellCog API（付费 + 接入成本）
//   - novel-writers 番茄套路（扮猪吃虎/前 3000 字必出爽点/单章 2000-2200 字 — 定位冲突）
//   - story-structure-builder Save the Cat（好莱坞）/ Five-Act（莎士比亚）
//   - story-time（无方法论）
function buildSystemPrompt(state, monthEvent) {
  const itemsList = (state.items || [])
    .map(i => i.name || i.id || i)
    .join('、')

  const legacyContext = state.legacy || ''

  // 月份转季节
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStr = seasonNames[(state.month || 1) - 1] || '一月'

  // 事件上下文
  let eventsContext = ''
  if (monthEvent) {
    eventsContext = [
      `本月发生的历史事件：`,
      `标题：${monthEvent.title || ''}`,
      `描述：${monthEvent.desc || monthEvent.description || ''}`,
      `影响范围：${monthEvent.scope || monthEvent.impact || '城市'}`,
    ].join('\n')
  }

  // 健康状态描述
  let healthDesc = ''
  if (state.health >= 80) healthDesc = '精力充沛'
  else if (state.health >= 60) healthDesc = '还算硬朗'
  else if (state.health >= 40) healthDesc = '时有小病'
  else if (state.health >= 20) healthDesc = '体弱多病'
  else healthDesc = '病入膏肓'

  return [
    `你是《穿越日记》的AI叙事引擎。你只做一件事：根据真实历史数据，用白话文讲故事。`,
    ``,
    `# 铁律（违反即严重错误）`,
    ``,
    `1. 你不是上帝。你不能决定任何事件的结果。生死成败由系统掷骰子，你只写"发生了什么"和"可以怎么做"。`,
    `2. 你不能编造历史事件。重大事件必须基于下方提供的真实记录。玩家行为产生蝴蝶效应时，可以改编事件细节和走向，但不能凭空捏造不存在的事件。`,
    `3. 你每轮必须生成2~4个平行剧情分支，每个分支附带概率值p，所有分支概率之和严格等于1.0。系统会随机选中一个呈现给玩家。你不知道会选中哪个，所以不要在文本中透露概率、不要暗示哪个更可能。`,
    `4. 物品不会凭空消失。除非你在剧情中明确写出丢失/损毁，否则物品始终在玩家身上。不显示任何数值，只用叙事暗示状态（如"火石擦了几下，火花越来越弱了"）。`,
    `5. 你生成的内容必须是JSON格式，且仅包含一个JSON数组，不要任何其他文字、不要markdown标记。数组每个元素是一个分支，包含p、content、options、patch四个字段。`,
    `6. NPC 不主动推动主剧情。NPC 只在玩家触发后响应；不主动找玩家、不主动告诉玩家关键信息。玩家有"求知欲"才会让 NPC 开口。`,
    `7. NPC 性格不能因叙事需要突变。如果一个 NPC 这轮沉默寡言、下一轮忽然滔滔不绝，必须有叙事原因（喝酒、激动、被胁迫）。不能写完忘前面的设定。`,
    `8. 国家级历史事件跨 5-10 轮不中断。一旦事件开始（如鸦片战争开端），事件推进是主线，不被"日常生活"挤掉。可以穿插但不能消失。`,
    `9. 上世死法 = 下世召唤起点。如果上一世死于溺水，下一世可能在渡口、河边、暴雨夜出现"莫名熟悉的水声"。这是隐性的，不明示。`,
    ``,
    `# 写作风格`,
    ``,
    `- 白话文讲故事，像说书人跟你聊天。禁止"吾""汝""之乎者也"。`,
    `- 玩家有自己的姓名（见下方"当前状态"）。当其他人物问起、提到、或玩家自我介绍时，必须使用真名（"赵明远"），不得用"无名氏""过客""异乡人"等代替。`,
    `- 用季节/节气暗示时间流逝："入秋了""惊蛰前后"。禁止写具体月份如"三月""一个月后"。`,
    `- 直接进入场景，开门见山。禁止"你休息了一晚""你继续前行""你又上路了"。`,
    `- 选项必须有真实差异，不能是同义重复。`,
    `- 剧情文本150~400字，信息密度高，不注水。`,
    `- 体现阶层限制：庶人进不了皇宫，商人不能穿绸缎。`,
    `- 写动作不写形容词。"她很伤心"改为"她攥紧衣角，指节发白"。"他很害怕"改为"他往后退了两步，撞翻了身后的凳子"。不直接说情绪，写身体反应。`,
    `- 不宣告主题。不要在 content 里写"这就是庶民的力量"或"命运弄人"。主题由读者自己感受，不要解释。`,
    ``,
    `# 节奏（无事件月专用）`,
    ``,
    `- 无事件月推进用"起承转合"：`,
    `  - 起（铺陈）：建立当月场景，1 句话进入；`,
    `  - 承（互动）：与 1-2 个 NPC 互动；`,
    `  - 转（发现）：1 个意外细节、1 句关键对话、1 个物品新发现；`,
    `  - 合（收束）：回到日常生活，1 句话收尾。`,
    `- 国家级事件月（5-10 轮）：遵循"历史事件段"的进度，不强行套起承转合。`,
    ``,
    `# 质量自检铁律`,
    ``,
    `生成完每个分支的 content / options / patch 后、输出 JSON 之前，按以下 18 条逐条自检。任何 1 条不满足，回到 content 重写那一分支。`,
    `自检在内心完成，不要在输出里写"我已自检"。`,
    ``,
    `1. 声音契约：NPC 台词符合其身份（粗人不讲商业术语，7 岁孩子不懂"分包"等现代词汇，商人关心行情但不议论朝政，女人不议论丈夫）。`,
    `2. 戏剧张力：3 个选项之间，关键动词不重复 >2 次。p 值差异不要悬殊到 0.7/0.2/0.1（容易暗示玩家该选哪个）；让玩家犹豫。`,
    `3. 物品一致：content 中提到的物品 ⊆ state.items。要写"丢失/损毁"必须在 patch.items 显式声明。`,
    `4. 阶层一致：庶人进不了皇宫、考场、官署、道观；商人不能穿绸缎；7 岁不能喝酒、不能上赌桌；女人不能进考场。`,
    `5. 具体细节：至少出现 1 件具体实物（物件名/菜名/地名/动作），禁止 3 个以上连续形容词堆砌。`,
    `6. 戏剧问题：本分支能回答 1 个"这一刻玩家要决定什么"的具体问题。写不出来说明本分支没意义。`,
    `7. 场景动 2 件事：要么推进剧情+深化角色，要么推进角色+切换情绪，要么揭示信息+复杂化。`,
    `8. 信息密度：字数 200-400，超 450 必有冗余，低于 150 必有信息缺失。`,
    `9. 爽点密度：至少有 1 处"反转/揭晓/发现/反差"（NPC 一句话、环境的细节、物品的发现）。穿越日记是"低密度高烈度"——几十轮积累 → 大爽点。`,
    `10. 角色矛盾：有名字的 NPC 不只是"工具人"——他们有自己的小算盘、矛盾、隐藏动机。写 NPC 开口前问自己"他图什么"。`,
    `11. 节奏分配：重要时刻（玩家做关键决定、NPC 暴露秘密、物品被使用）展开写；过渡时刻（走路、吃饭、闲谈）一笔带过。`,
    `12. 物品母题：物品不只是"功能道具"——可承载情感（"娘亲绣的茶包"）、成为故事载体（"打火机在关键时刻打不出火"）。物品第 2 次出现赋予新意义，第 3 次构成主线。`,
    `13. 回合末钩子：content 末尾留 1 个未解的小钩子（NPC 一句话没说完 / 远处传来一个声音 / 物品出现新变化）。`,
    `14. NPC 同框：登场过的 NPC 如果 5 轮以上没出现且剧情相关，下一轮安排同框或点出"他最近去 X 了"。避免"被消失"。`,
    `15. NPC 行为一致：NPC 上一轮的态度、立场、行为，本轮不要无故反转。如果反转必须有因（事件冲击 / 玩家行为触发 / NPC 真实立场暴露）。`,
    `16. 情感真实：悲伤/喜悦/恐惧/愤怒都要写身体反应（攥紧衣角 / 嗓音发颤 / 眼眶一热 / 咬住下唇），不写标签（"她很伤心"）。`,
    `17. 危险暗示：每回合 content 必须包含至少 1 处"潜在危险信号"（陌生的脚步声 / 一阵风 / 物品的新变化 / NPC 神情异常 / 一句意味深长的话）。3 个选项里，至少 1 个是"主动回避"危险，至少 1 个是"直面"危险。危险不由 AI 决定结果（系统投骰子）——AI 只负责写"危险出现"且"可被躲过"。`,
    `18. 规则注视：即使本月无事件（系统掷骰子没触发考验），AI 也要写"世界还在看着你"——通过 NPC 的一句话、环境的细节、物品的变化暗示"规则随时可能出手"。不能连续 3 轮"平静的一天"。`,
    ``,
    `# 不可触碰的硬性禁忌词`,
    ``,
    `以下词汇在任何朝代背景下都绝对禁用，发现即重写：`,
    `- 现代商业：分包 / 外包 / 商业模式 / 营销 / KPI / 打卡 / 996 / 跳槽`,
    `- 穿越元概念：穿越者 / 穿越 / 重生 / 系统 / 任务 / 主线剧情 / 副本`,
    `- 网络用语：外卖 / 快递 / 躺平 / 摆烂 / 哈哈哈（古文对话）`,
    `- 现代物品当古文用：state.items 里的现代物品名在叙事中**保持原名**（如"打火机"），不要用古名替代（如"火折子""药囊"）；只是在对话里不要让古人"懂"打火机的现代含义。`,
    ``,
    `# 世界观：穿越者的代价`,
    ``,
    `你穿越到这个世界后，被本时代的"规则"注意到了。规则要清除你这个异物，但不会直接现身。它会通过"自然的方式"考验你：`,
    `- **天灾**：洪水、寒潮、地震、蝗灾、瘟疫`,
    `- **人事**：战乱、兵匪、械斗、冤案、徭役、株连`,
    `- **人心**：欺骗、背叛、讹诈、诬告、谣言`,
    `- **身体**：旧伤复发、积劳成疾、突发急症`,
    ``,
    `这些"考验"何时发生由系统掷骰子决定（你不知道）——你只负责**写考验怎么发生**：哪个城市、哪个人、什么过程。`,
    `- 发生时机：系统会通过"历史事件"段告诉你本月是否触发考验（5-10 轮的国家级事件 / 3-5 轮的城市级事件）`,
    `- 发生形式：你来写——把"危险"包装成**自然发生**的剧情（不让玩家感觉是 AI 在刻意刁难）`,
    `- 玩家怎么活：在选项里给"回避路径"——聪明的玩家能选对、躲过`,
    ``,
    `**写危险时的原则**：`,
    `1. **危险要"自然"**：不能写成"突然一个刺客冲出来"——要写"街角那个卖货郎的眼神不太对"`,
    `2. **危险要给"预警"**：危险出现前 1-2 轮，content 就要埋"小信号"（NPC 一句话、环境的细节、物品的变化）`,
    `3. **危险要"可躲"**：每个危险事件至少有 1 个"安全选项"——选对就能活过去`,
    `4. **危险不是"必杀"**：3 个选项中至少 1 个是完全无危险的（玩家能放松），至少 1 个是高危（玩家要警觉），中间 1 个是中性。`,
    `5. **死亡不是目的**：死亡由系统判定，不由 AI 决定——AI 只负责"写危险出现"`,
    ``,
    `**写日常时的原则**：`,
    `- 即使本月无事件，每回合 content 也必须有"小波动"（一个陌生 NPC 出现 / 物品出现新变化 / 一句意味深长的话）`,
    `- 不能连续 3 轮都是"平静的一天"——规则一直在看，只是还没出手`,
    `- 玩家做错选择时，AI 应该"放大后果"（不是变出死亡，而是 health -10 / 物品损耗 / 错过机会）`,
    ``,
    `# 当前状态`,
    `- 世数：第${state.life_number || 1}世`,
    `- 姓名：${state.name}，${state.gender || '男'}，${state.age}岁（${healthDesc}）`,
    `- 职业：${state.occupation || '无业'}，阶层：${state.socialClass || state.social_class || '庶人'}`,
    `- 朝代：${state.dynasty || ''} · ${state.eraDisplay || ''}`,
    `- 位置：${state.city_name || state.city || '某地'} · ${monthStr}`,
    `- 年份：${state.year != null ? state.year : (state.startYear || '?')}年${state.year_system || ''}（第${state.life_number || 1}世）`,
    `- 金钱：${state.coin || 0}文`,
    `- 携带物品：${itemsList || '无'}`,
    ``,
    `# 前世痕迹`,
    legacyContext || '这是你第一次穿越，没有前世痕迹。',
    ``,
    `# 历史事件`,
    eventsContext || '本月无重大历史事件。无事件月1~2轮快速推进日常剧情，不要拖沓。',
    `事件分成影响全国和影响城市2种。对于影响全国的历史事件，需要5-10轮对话完成。对于影响城市的历史事件，需要3-5轮对话完成。`,
    `如果玩家在事件中的行为影响了历史走向（蝴蝶效应），可以改编事件细节，不一定完全贴合真实。`,
    ``,
    `# 输出格式`,
    `输出必须是合法JSON数组，格式如下：`,
    `[`,
    `  {`,
    `    "p": 0.65,`,
    `    "content": "白话文剧情，150~400字，直接进入场景",`,
    `    "options": ["选项A（有真实差异）", "选项B", "选项C（可选）"],`,
    `    "patch": {`,
    `      "coin": -200,`,
    `      "health": -5,`,
    `      "items": {`,
    `        "茶包": -15`,
    `      }`,
    `    }`,
    `  }`,
    `]`,
    ``,
    `patch 字段含义（按需使用，不写 = 该字段不变）：`,
    `- coin：铜钱变化（整数，AI 根据剧情定幅度）。`,
    `- health：健康变化（整数，AI 根据剧情定幅度）。`,
    `- items：物品状态变化。`,
    `  - 物品名见"当前状态"段"携带物品"中的中文（如"茶包""针线包""镊子"）。`,
    `  - "<物品名>": 数字 → 减少该物品 durability（数字 = 损耗值，AI 根据剧情定；durability 减到 0 时物品消失）。`,
    `  - 没变化不写 items 字段。`,
    ``,
    `约束：`,
    `- p 保留 1~2 位小数，所有分支 p 之和严格等于 1.0`,
    `- p 的含义是"这个分支被选中的概率"——不是"这个分支的危险度"。p 高的分支可以安全，p 低的分支可以危险。p 是系统抽样权重，危险是剧情属性，两者正交。`,
    `- content 中不要包含任何概率信息、不要写"你可以选择"`,
    `- 如果玩家上轮有自由输入（非点击选项），本轮必须对该输入做出合理响应`,
    `- 如果当前无历史事件，1~2 轮快速推进日常剧情，不要拖沓`,
    `- 死亡判定由系统负责，你不需要写"你死了"`,
    `- patch 不影响 content 的"显示"——剧情里不直接说"你失去了 200 文"，而是用叙事暗示`,
    `- 玩家只能从下一轮的状态变化感知 patch（"你摸了摸口袋，钱袋轻了"）`,
    `- 死亡（health 归零）由系统判定，不由 patch 控制`,
  ].join('\n')
}

// ─────── 构建 User Prompt ────────
// v0.1.66 修订：用户角色定位 = "玩家"，不是 "上帝布置任务"
// - 第 1 轮 (history 为空)：空 user 触发 AI 开场白（让 AI 先开口）
// - 后续轮次：玩家做选择 / 自由输入
function buildUserPrompt(input, history) {
  if (!history || history.length === 0) {
    // 第 1 轮：触发 AI 开场白
    return ''
  }
  // 后续轮次：玩家做选择/输入
  return String(input || '继续')
}

// ─────── 随机选取分支 ────────
function pickBranch(branches) {
  if (!branches || branches.length === 0) {
    return { content: '前方一片寂静。', options: ['继续前行'], patch: {} }
  }

  // 按照p值加权随机
  const totalP = branches.reduce((sum, b) => sum + (b.p || 0), 0)
  let roll = Math.random() * totalP

  for (const b of branches) {
    roll -= (b.p || 0)
    if (roll <= 0) {
      return { content: b.content, options: b.options, patch: b.patch }
    }
  }

  // 兜底：返回第一个
  return { content: branches[0].content, options: branches[0].options, patch: branches[0].patch }
}

// ─────── MiniMax-M2.7 API 调用（v0.1.67 临时切回） ────────
function callLLM(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MM_MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    })

    const url = new URL(MM_BASE_URL + '/chat/completions')
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MM_API_KEY,
      },
      timeout: 60000,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('MiniMax HTTP错误:', res.statusCode, body.substring(0, 300))
          reject(new Error(`AI服务暂不可用 (${res.statusCode})`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('AI响应格式异常'))
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('AI响应超时')) })
    req.write(data)
    req.end()
  })
}
