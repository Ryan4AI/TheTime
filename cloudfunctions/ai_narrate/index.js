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
    `    "patch": {"coin": -300, "health": 0}`,
    `  }`,
    `]`,
    `规则：`,
    `- p保留1~2位小数，所有分支p之和严格等于1.0`,
    `- content中不要包含任何概率信息、不要写"你可以选择"`,
    `- patch仅含coin（整数）、health（整数）、items（仅当物品状态明确变化时）`,
    `- 如果玩家上轮有自由输入（非点击选项），本轮必须对该输入做出合理响应`,
    `- 如果当前无历史事件，1~2轮快速推进日常剧情，不要拖沓`,
    `- 死亡判定由系统负责，你不需要写"你死了"`,
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
