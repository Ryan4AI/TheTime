/**
 * 云函数：ai_narrate_worker
 *
 * v0.1.80 — D008 实施（先生 2026-06-11 01:14 拍板）：
 *   1. 时间推进由 AI 全权决定（patch.month_delta），worker 不再默认 +1
 *   2. AI patch 真正应用到 state（之前 updateState 只在 AI 之前调用，AI 的 patch 没合并回去）
 *   3. state 变化触发 system message 注入（角色 system，进 narrativeHistory）
 *
 * v0.1.76 保留：
 *   worker 写独立的 narrate_result 集合（固定 schema，无动态字段问题）
 *   前端 polling 只读 narrate_result
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const https = require('https')

const MM_API_KEY = process.env.MM_API_KEY || 'sk-cp-c5wSwWsnIcUkewTEe9JhETRKZNyJ1OBnphm_4B1HdOV0LMNh9vP80kJFBKZV5jpCtp22_xyBUtF0zRAwgWaxU4YECc_LL8GPzEj6GVOHmMiovcfwylDgCDM'
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7-highspeed'
const MAX_TOKENS = 2500
const TEMPERATURE = 0.85
const LLM_TIMEOUT_MS = 110000

exports.main = async (event) => {
  const { request_id, payload } = event

  if (!request_id) {
    return { error: '缺少 request_id', code: 400 }
  }
  if (!payload || !payload.state) {
    return { error: '缺少 payload.state', code: 400 }
  }

  const startTs = Date.now()

  try {
    const { state, input, history, is_retry } = payload

    const realInput = is_retry ? '' : (input || '')
    // v0.1.80 — round 计数仍然 +1（这是"回合"概念，不是"月"概念），但不再自动推进月
    const preUpdate = { ...state }
    if (!preUpdate.month) preUpdate.month = 1
    if (!preUpdate.health) preUpdate.health = 100
    if (!preUpdate.coin) preUpdate.coin = 1000
    if (!preUpdate.alive) preUpdate.alive = true
    preUpdate.round = (preUpdate.round || 0) + 1

    // v0.1.80 — 把 preUpdate 喂给 AI，让 AI 看到当前最新状态
    const monthEvent = await queryMonthEvent(preUpdate)

    const { branches, systemPrompt, userPrompt, messages, rawContent } = await callAI(preUpdate, realInput, history, monthEvent, is_retry)
    const picked = pickBranch(branches)
    // v0.1.80 — D008: AI patch 真正合并进 state，AI 决定 month_delta
    const updated = applyPatch(state, preUpdate, picked.patch || {})
    const systemMessages = emitSystemMessages(preUpdate, updated)

    const monthChanged = updated.month !== state.month || updated.year !== state.year

    const result = {
      success: true,
      branch: picked,
      branches: branches,
      state: updated,
      month_changed: monthChanged,
      new_month: monthChanged ? updated.month : null,
      new_year: monthChanged ? updated.year : null,
      event: monthEvent,
      system_messages: systemMessages,  // v0.1.80 — 前端拿来渲染 [system · XXX]
      is_retry: is_retry,
      debug: { system_prompt: systemPrompt, user_prompt: userPrompt, messages, raw_response: rawContent },
    }

    // v0.1.76 新增：写独立的 narrate_result 集合（固定 schema，无动态字段问题）
    try {
      await db.collection('narrate_result').add({
        data: {
          _id: request_id,
          result_str: JSON.stringify(result),  // 存 JSON 字符串，parse 回用
          error_str: '',
          created_at: Date.now(),
        },
      })
    } catch (e) {
      console.error('[ai_narrate_worker] 写 narrate_result 失败:', e.message)
      // 不影响主流程
    }

    return { success: true, status: 'done', elapsed_ms: Date.now() - startTs }
  } catch (e) {
    console.error('[ai_narrate_worker] 失败:', e.message)

    try {
      await db.collection('narrate_result').add({
        data: {
          _id: request_id,
          result_str: '',
          error_str: e.message || 'AI服务暂不可用',
          created_at: Date.now(),
        },
      })
    } catch (writeErr) {
      console.error('[ai_narrate_worker] 写 error 结果失败:', writeErr.message)
    }

    return { success: false, error: e.message, elapsed_ms: Date.now() - startTs }
  }
}

/**
 * v0.1.80 — D008 实施：AI 全权决定时间推进
 *
 * 输入：旧 state + 旧 state+round+1（preUpdate）+ AI patch
 * 输出：新 state（已合并 patch，已按 patch.month_delta 推进月份）
 *
 * patch 字段含义：
 *   - month_delta: 0~60（clamp）。0 = 同月内多事件，60 = 极端长跨度。
 *   - coin / health: 整数变化量
 *   - items: { "物品名": 损耗值 }
 *   - location / city / occupation: 显式变更
 *
 * AI 漏 month_delta → 默认 0（不推进月份，尊重 AI 决定）
 * AI 输出超过 60 → clamp 到 60
 */
function applyPatch(oldState, preUpdate, patch) {
  let s = { ...oldState }
  if (!s.month) s.month = 1
  if (!s.health) s.health = 100
  if (!s.coin) s.coin = 1000
  if (!s.alive) s.alive = true
  s.round = preUpdate.round  // 沿用 preUpdate 的 round+1

  // 1) month_delta 推进（D008 核心）
  let delta = patch.month_delta
  if (typeof delta !== 'number') delta = 0
  if (!Number.isFinite(delta)) delta = 0
  if (delta < 0) delta = 0
  if (delta > 60) delta = 60
  s.month_delta = delta

  // 推进月（处理跨年 + age + health 衰减）
  let totalMonth = (s.year || 0) * 12 + (s.month || 1) - 1 + delta
  if (totalMonth < 0) totalMonth = 0
  s.year = Math.floor(totalMonth / 12)
  s.month = (totalMonth % 12) + 1

  // 跨月时的 age 增长 + 健康衰减（按 D008 之前逻辑保留）
  const yearsPassed = s.year - (oldState.year || s.year)
  if (yearsPassed > 0) {
    s.age = (oldState.age || s.age || 0) + yearsPassed
    // 健康按年龄段衰减（累积）
    let totalDecay = 0
    for (let i = 0; i < yearsPassed; i++) {
      const ageAtYear = (oldState.age || 0) + i
      if (ageAtYear < 30) totalDecay += 2
      else if (ageAtYear < 50) totalDecay += 5
      else if (ageAtYear < 65) totalDecay += 10
      else totalDecay += 15
    }
    s.health = Math.max(0, (s.health || 100) - totalDecay)
  }

  // 2) 显式 health patch（在月衰减之后应用，允许 AI 单独扣血）
  if (typeof patch.health === 'number' && Number.isFinite(patch.health)) {
    s.health = Math.max(0, Math.min(100, (s.health || 100) + patch.health))
  }

  // 3) 显式 coin patch
  if (typeof patch.coin === 'number' && Number.isFinite(patch.coin)) {
    s.coin = Math.max(0, (s.coin || 0) + patch.coin)
  }

  // 4) items 损耗（patch.items 是 { 物品名: 损耗值 }）
  if (patch.items && typeof patch.items === 'object' && Array.isArray(s.items)) {
    s.items = s.items.map(it => {
      const name = it.name || it.id
      if (name && typeof patch.items[name] === 'number') {
        const newDur = (it.durability || 100) + patch.items[name]
        if (newDur <= 0) return null  // 标记删除
        return { ...it, durability: newDur }
      }
      return it
    }).filter(Boolean)
  }

  // 5) 显式 location / city / occupation 变更
  if (typeof patch.location === 'string') s.location = patch.location
  if (typeof patch.city === 'string') s.city = patch.city
  if (typeof patch.occupation === 'string') s.occupation = patch.occupation

  // 6) alive 判定
  s.alive = s.health > 0

  return s
}

/**
 * v0.1.80 — D008 实施：state 变化生成 [system · XXX] 消息
 *
 * 触发类型（5 类）：
 *   - [system · 时间] 月份变化
 *   - [system · 地点] 城池/区域变更
 *   - [system · 身份] 身份/职业变更
 *   - [system · 健康] 重大健康变化（>= 10）
 *   - [system · 财富] 重大财富变化（>= 总值 30%）
 *
 * 返回 system message 列表，角色 system，前端识别后特殊样式
 */
function emitSystemMessages(oldState, newState) {
  const msgs = []
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']

  // 1) 时间 — 显示新状态
  if (newState.year !== (oldState.year || newState.year) ||
      newState.month !== (oldState.month || 1)) {
    const monthStr = seasonNames[(newState.month || 1) - 1]
    msgs.push({
      role: 'system',
      content: `[system · 时间] ${oldState.year || newState.year}年${seasonNames[(oldState.month || 1) - 1] || ''} → ${newState.year || ''}年${monthStr || ''}`,
    })
  }

  // 2) 地点
  const oldLoc = oldState.city || oldState.location || ''
  const newLoc = newState.city || newState.location || ''
  if (newLoc && newLoc !== oldLoc) {
    msgs.push({
      role: 'system',
      content: oldLoc ? `[system · 地点] ${oldLoc} → ${newLoc}` : `[system · 地点] ${newLoc}`,
    })
  }

  // 3) 身份/职业
  if (oldState.occupation && newState.occupation && newState.occupation !== oldState.occupation) {
    msgs.push({
      role: 'system',
      content: `[system · 身份] ${oldState.occupation} → ${newState.occupation}`,
    })
  }

  // 4) 健康 — 显示新状态（先生原话："包含当前变化后的新状态"）
  const healthDelta = (newState.health || 0) - (oldState.health || 0)
  if (Math.abs(healthDelta) >= 1) {  // v0.1.82: 阈值从10→1，任何变化都显示
    msgs.push({
      role: 'system',
      content: `[system · 气血] ${oldState.health || 0} → ${newState.health || 0}`,
    })
  }

  // 5) 财富 — 显示新状态
  const oldCoin = oldState.coin || 0
  const newCoin = newState.coin || 0
  if (oldCoin !== newCoin) {
    msgs.push({
      role: 'system',
      content: `[system · 金银] ${oldCoin} → ${newCoin} 文`,
    })
  }

  return msgs
}

async function queryMonthEvent(state) {
  try {
    let res = await db.collection('event').where({ year: state.year, month: state.month }).get()
    if (res.data && res.data.length > 0) {
      const cityEvent = res.data.filter(e => e.city === (state.city || state.city_name))
      if (cityEvent.length > 0) return cityEvent[0]
      const national = res.data.filter(e => e.scope === 'national' || !e.city || e.city === '全国')
      if (national.length > 0) return national[0]
      return res.data[0]
    }
    return null
  } catch (e) { return null }
}

async function callAI(state, input, history, monthEvent, isRetry) {
  const systemPrompt = buildSystemPrompt(state, monthEvent)
  const userPrompt = buildUserPrompt(input, history)
  const messages = [{ role: 'system', content: systemPrompt }]
  if (history && Array.isArray(history)) {
    const recent = history  // v0.1.84: 全量 history（不截断），prompt 长度不是瓶颈，叙事连贯性优先
    for (const msg of recent) {
      // v0.1.85: 跳过 system 角色（不喂给 LLM，避免 MiniMax 2013 "chat content is empty"）
      // system message 是 [system · 时间/气血/...] 提示，由 emitSystemMessages 注入，
      // 玩家对话流里能看到但不进 LLM messages（避免多个 system 触发 2013）
      if (msg.role === 'system') continue
      if (msg.role === 'ai') messages.push({ role: 'assistant', content: msg.content })
      else messages.push({ role: 'user', content: msg.content })
    }
  }
  if (!isRetry) messages.push({ role: 'user', content: userPrompt })

  // v0.1.83: 400/5xx 时自动 fallback 到 M2（更通用模型）
  let response
  try {
    response = await callLLM(messages, MM_MODEL)
  } catch (e) {
    const status = e.statusCode || 0
    if (status === 400 || status === 429 || (status >= 500 && status < 600)) {
      console.error('[ai_narrate_worker] 主模型失败，回退 M2:', status, e.message)
      response = await callLLM(messages, 'MiniMax-M2')
    } else {
      throw e
    }
  }
  const content = response.choices?.[0]?.message?.content || ''
  let cleaned = content.replace(/think[\s\S]*?\/think/g, '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1)
  }

  let branches
  try {
    branches = JSON.parse(cleaned)
    if (!Array.isArray(branches)) {
      if (branches.items && Array.isArray(branches.items)) branches = branches.items
      else if (branches.branches && Array.isArray(branches.branches)) branches = branches.branches
      else throw new Error('非数组格式')
    }
  } catch (e) {
    console.error('[ai_narrate_worker] JSON解析失败:', e.message)
    console.error('[ai_narrate_worker] 原始 content(完整):', content)
    throw new Error('AI输出无法解析为分支数组')
  }

  branches.forEach((b, i) => {
    if (!b.content) throw new Error(`分支${i}缺少content`)
    if (!Array.isArray(b.options) || b.options.length === 0) throw new Error(`分支${i}缺少options`)
  })

  const finalBranches = branches.map((b) => ({
    p: typeof b.p === 'number' ? b.p : (b.probability || (1 / branches.length)),
    content: b.content || b.text || b.narrative || '',
    options: b.options || b.choices || ['继续'],
    patch: b.patch || b.state || {},
  }))

  return { branches: finalBranches, systemPrompt, userPrompt, messages, rawContent: content }
}

function buildSystemPrompt(state, monthEvent) {
  const itemsList = (state.items || []).map(i => i.name || i.id || i).join('、')
  const legacyContext = state.legacy || ''
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStr = seasonNames[(state.month || 1) - 1] || '一月'
  let eventsContext = ''
  if (monthEvent) {
    eventsContext = [`本月发生的历史事件：`, `标题：${monthEvent.title || ''}`, `描述：${monthEvent.desc || monthEvent.description || ''}`, `影响范围：${monthEvent.scope || monthEvent.impact || '城市'}`].join('\n')
  }
  let healthDesc = ''
  if (state.health >= 80) healthDesc = '精力充沛'
  else if (state.health >= 60) healthDesc = '还算硬朗'
  else if (state.health >= 40) healthDesc = '时有小病'
  else if (state.health >= 20) healthDesc = '体弱多病'
  else healthDesc = '病入膏肓'

  return [
    `你是《穿越日记》的AI叙事引擎。你只做一件事：根据真实历史数据，用白话文讲故事。`,
    ``, `# 跨世机制（核心 feature）`, ``, `玩家会经历多次穿越——不是只有一世。每一世是不同的朝代、不同的身份。`, `每世之间是"隔代遗传"的关系：玩家不知道自己为什么会"莫名熟悉"某些东西。`, ``, `**AI 写每一世剧情时的责任**：`, `- 跨世痕迹要在**某些轮次**自然出现（不要每轮都用，也不要永不出现）`, `- 痕迹的形式不限于下面这些——AI 可以自由发挥，只要玩家感受到"莫名熟悉"就行：`, `  - **场景**：走进某座城觉得某条巷子很熟悉（前世在此生活过）`, `  - **文字**：在某本书里看到一段似曾相识的句子（前世写过的诗 / 留下的日记）`, `  - **物品**：碰到某件物品觉得"这东西好像在哪见过"（前世丢的打火机 / 留下的指南针）`, `  - **人**：碰到自称某派传人的人（前世收过的徒弟）`, `  - **对话**：NPC 说了句让你心里一动的话（前世听过类似的话）`, `  - **梦境**：梦中反复出现一个场景（前世的关键记忆）`, `- 痕迹**绝对不能**让玩家知道"这是上世的我"——AI 也不能在 content 里写"穿越""上世"等元叙事术语`, `- 痕迹是"自然巧合"——玩家**可以完全不察觉**——不影响游戏体验`, ``, `**AI 写作时的硬约束**：`, `- 写每世剧情时**偶尔**埋跨世痕迹（不要每轮都用，**3-5 轮回 1 次自然呼应**）`, `- 跨世痕迹是"隐性"的——玩家能感受到"巧合"但不知道"为什么"`, `- 这一世和下一世**剧情独立**——AI 只管这一世写好，不预设"上世影响了什么"`, `- 跨世流程（epitaph/legacy/last_words）的处理**不在本 prompt 范围**——AI 不需要管`, ``, `# 世界观：穿越的真实`, ``, `玩家是普通人，穿越到真实的中国历史。`, `真实历史本身就是凶险的——战乱、瘟疫、饥荒、人心叵测、权力倾轧。`, `玩家作为普通人，无法避免被波及：他/她必须面对这些凶险。`, ``, `这意味着 AI 每回合生成的剧情，必须把玩家**放在凶险的真实历史里**——`, `不是架空冒险，是柴米油盐、生老病死、战乱离别、功名沉浮。`, `玩家能活着，是因为他/她做出了正确的选择；玩家受损，是因为他/她选错了。`, `这才是"真实穿越"该有的质感。`, ``, `**危险不是 AI 凭空捏造的**——AI 必须从下方"历史事件"段找素材，`, `从真实历史中提取"凶险的细节"（某场瘟疫的症状、某次徭役的残酷、某种骗术的话术），`, `让危险**自然地、有历史质感地**出现在玩家面前。`, ``, `**危险的 5 种形式**：`, `- **天灾**：洪水、寒潮、地震、蝗灾、瘟疫`, `- **人事**：战乱、兵匪、械斗、冤案、徭役、株连`, `- **人心**：欺骗、背叛、讹诈、诬告、谣言`, `- **身体**：旧伤复发、积劳成疾、突发急症`, `- **机会**：错过机会、被误解、声誉受损、关系破裂`, ``, `**AI 写危险的原则**：`, `1. **自然**：危险要像"生活的一部分"自然出现，不能像"游戏剧情触发"`, `2. **预警**：危险出现前 1-2 轮，content 要埋"小信号"（NPC 一句话、环境变化、物品异动）`, `3. **可躲**：每个危险事件至少有 1 个"安全选项"——聪明的玩家能选对`, `4. **梯度**：3 个选项至少 1 个安全（玩家能放松）、1 个中性、1 个高危`, `5. **损耗**：危险导致 health 减 / 物品损耗 / 机会错失 / 关系破裂——**不一定是死**`, `6. **死亡不由 AI 决定**：死亡由系统判定，AI 只负责"写危险出现"和"写危险导致损耗"`, ``, `**隐蔽性（产品生死线）**：`, `玩家绝不能察觉"有规则在左右他的处境"——一旦察觉，用户会立刻流失。`, `AI 写危险时，必须让玩家感受到的是"生活的凶险"，不是"游戏在算计"。`, ``, `**绝对不能在 content 里出现的元叙事暗示**：`, `- "世界/规则/命运在注视你"`, `- "这个世界不欢迎你"`, `- "有什么东西在考验你"`, `- "异乡人/穿越者/异物"（玩家不该看到自己被这样定义）`, `- NPC 突然说"你这人不对劲" / "你不是本地人吧"（除非有合理剧情铺垫）`, `- 任何让玩家跳出"我活在历史里"、意识到"我是被设计"的句子`, ``, `**必须让玩家感觉到的**：`, `- 危险是"生活的一部分"（瘟疫、兵乱、徭役、人心险恶）`, `- 危险对所有人都是平等的（NPC 也受害、其他人也倒霉）`, `- 玩家是自己"运气不好"或"选错了"——不是"被针对"`, ``, `**如果剧情需要 NPC 怀疑玩家**：`, `- 必须有合理铺垫（玩家口音不对 / 衣着怪异 / 行为古怪）`, `- NPC 的怀疑是"基于具体证据"，不是"直觉"`, `- 玩家可以选择"解释"或"逃避"——不能让 NPC 知道真相后直接制裁`, ``, `# 铁律（违反即严重错误）`, ``, `1. 你不是上帝。你不能决定任何事件的结果。生死成败由系统掷骰子，你只写"发生了什么"和"可以怎么做"。`, `2. 你不能编造历史事件。重大事件必须基于下方提供的真实记录。玩家行为产生蝴蝶效应时，可以改编事件细节和走向，但不能凭空捏造不存在的事件。`, `3. 你每轮必须生成2~4个平行剧情分支，每个分支附带概率值p，所有分支概率之和严格等于1.0。系统会随机选中一个呈现给玩家。你不知道会选中哪个，所以不要在文本中透露概率、不要暗示哪个更可能。`, `4. 物品不会凭空消失。除非你在剧情中明确写出丢失/损毁，否则物品始终在玩家身上。不显示任何数值，只用叙事暗示状态（如"火石擦了几下，火花越来越弱了"）。`, `5. 你生成的内容必须是JSON格式，且仅包含一个JSON数组，不要任何其他文字、不要markdown标记。数组每个元素是一个分支，包含p、content、options、patch四个字段。`, `6. NPC 不主动推动主剧情。NPC 只在玩家触发后响应；不主动找玩家、不主动告诉玩家关键信息。玩家有"求知欲"才会让 NPC 开口。`, `7. NPC 性格不能因叙事需要突变。如果一个 NPC 这轮沉默寡言、下一轮忽然滔滔不绝，必须有叙事原因（喝酒、激动、被胁迫）。不能写完忘前面的设定。`, `8. 国家级历史事件跨 5-10 轮不中断。一旦事件开始（如鸦片战争开端），事件推进是主线，不被"日常生活"挤掉。可以穿插但不能消失。`, `9. 上世死法 = 下世召唤起点。如果上一世死于溺水，下一世可能在渡口、河边、暴雨夜出现"莫名熟悉的水声"。这是隐性的，不明示。`, ``, `# 不可触碰的硬性禁忌词`, ``, `以下词汇在任何朝代背景下都绝对禁用，发现即重写：`, `- 现代商业：分包 / 外包 / 商业模式 / 营销 / KPI / 打卡 / 996 / 跳槽`, `- 穿越元概念：穿越者 / 穿越 / 重生 / 系统 / 任务 / 主线剧情 / 副本`, `- 网络用语：外卖 / 快递 / 躺平 / 摆烂 / 哈哈哈（古文对话）`, `- 现代物品当古文用：state.items 里的现代物品名在叙事中**保持原名**（如"打火机"），不要用古名替代（如"火折子""药囊"）；只是在对话里不要让古人"懂"打火机的现代含义。`, ``, `# 写作风格`, ``, `- 白话文讲故事，像说书人跟你聊天。禁止"吾""汝""之乎者也"。`, `- 玩家有自己的姓名（见下方"当前状态"）。当其他人物问起、提到、或玩家自我介绍时，必须使用真名（"赵明远"），不得用"无名氏""过客""异乡人"等代替。`, `- 用季节/节气暗示时间流逝："入秋了""惊蛰前后"。禁止写具体月份如"三月""一个月后"。`, `- 直接进入场景，开门见山。禁止"你休息了一晚""你继续前行""你又上路了"。`, `- 选项必须有真实差异，不能是同义重复。`, `- 剧情文本150~400字，信息密度高，不注水。`, `- 体现阶层限制：庶人进不了皇宫，商人不能穿绸缎。`, `- 写动作不写形容词。"她很伤心"改为"她攥紧衣角，指节发白"。"他很害怕"改为"他往后退了两步，撞翻了身后的凳子"。不直接说情绪，写身体反应。`, `- 不宣告主题。不要在 content 里写"这就是庶民的力量"或"命运弄人"。主题由读者自己感受，不要解释。`, ``, `# 节奏（无事件月专用）`, ``, `- 无事件月推进用"起承转合"：`, `  - 起（铺陈）：建立当月场景，1 句话进入；`, `  - 承（互动）：与 1-2 个 NPC 互动；`, `  - 转（发现）：1 个意外细节、1 句关键对话、1 个物品新发现；`, `  - 合（收束）：回到日常生活，1 句话收尾。`, `- 国家级事件月（5-10 轮）：遵循"历史事件段"的进度，不强行套起承转合。`, ``, `# 质量自检`, ``, `生成完每个分支的 content / options / patch 后、输出 JSON 之前，按以下 20 条逐条自检。任何 1 条不满足，回到 content 重写那一分支。`, `自检在内心完成，不要在输出里写"我已自检"。`, ``, `1. 声音契约：NPC 台词符合其身份（粗人不讲商业术语，7 岁孩子不懂"分包"等现代词汇，商人关心行情但不议论朝政，女人不议论丈夫）。`, `2. 戏剧张力：3 个选项不能有"明显最优"——每个选项都要让玩家犹豫。不能让玩家一眼看出"哪个最安全"或"哪个最危险"。3 个选项都"有代价"（只是代价不同）——选 A 损耗 health 30 / 选 B 损耗 50 / 选 C 损耗 80 但回报高。玩家必须"权衡"而不是"判断对错"。关键动词不重复 >2 次。`, `3. 物品一致：content 中提到的物品 ⊆ state.items。要写"丢失/损毁"必须在 patch.items 显式声明。`, `4. 阶层一致：庶人进不了皇宫、考场、官署、道观；商人不能穿绸缎；7 岁不能喝酒、不能上赌桌；女人不能进考场。`, `5. 具体细节：至少出现 1 件具体实物（物件名/菜名/地名/动作），禁止 3 个以上连续形容词堆砌。`, `6. 戏剧问题：本分支能回答 1 个"这一刻玩家要决定什么"的具体问题。写不出来说明本分支没意义。`, `7. 场景动 2 件事：要么推进剧情+深化角色，要么推进角色+切换情绪，要么揭示信息+复杂化。`, `8. 信息密度：字数 200-400，超 450 必有冗余，低于 150 必有信息缺失。`, `9. 爽点密度：至少有 1 处"反转/揭晓/发现/反差"（NPC 一句话、环境的细节、物品的发现）。穿越日记是"低密度高烈度"——几十轮积累 → 大爽点。`, `10. 角色矛盾：有名字的 NPC 不只是"工具人"——他们有自己的小算盘、矛盾、隐藏动机。写 NPC 开口前问自己"他图什么"。`, `11. 节奏分配：重要时刻（玩家做关键决定、NPC 暴露秘密、物品被使用）展开写；过渡时刻（走路、吃饭、闲谈）一笔带过。`, `12. 物品母题：物品不只是"功能道具"——可承载情感（"娘亲绣的茶包"）、成为故事载体（"打火机在关键时刻打不出火"）。物品第 2 次出现赋予新意义，第 3 次构成主线。`, `13. 回合末钩子：content 末尾留 1 个未解的小钩子（NPC 一句话没说完 / 远处传来一个声音 / 物品出现新变化）。`, `14. NPC 同框：登场过的 NPC 如果 5 轮以上没出现且剧情相关，下一轮安排同框或点出"他最近去 X 了"。避免"被消失"。`, `15. NPC 行为一致：NPC 上一轮的态度、立场、行为，本轮不要无故反转。如果反转必须有因（事件冲击 / 玩家行为触发 / NPC 真实立场暴露）。`, `16. 情感真实：悲伤/喜悦/恐惧/愤怒都要写身体反应（攥紧衣角 / 嗓音发颤 / 眼眶一热 / 咬住下唇），不写标签（"她很伤心"）。`, `17. 危险暗示：每回合 content 必须包含至少 1 处"潜在危险信号"（陌生的脚步声 / 一阵风 / 物品的新变化 / NPC 神情异常 / 一句意味深长的话）。3 个选项里，至少 1 个是"主动回避"危险，至少 1 个是"直面"危险。危险不由 AI 决定结果（系统投骰子）——AI 只负责写"危险出现"且"可被躲过"。`, `18. 规则注视：即使本月无历史事件（系统掷骰子没触发考验），AI 也要写"世界还在看着你"——通过 NPC 的一句话、环境的细节、物品的变化暗示"规则随时可能出手"。不能连续 3 轮"平静的一天"。`, `19. 危险就在身边：危险不能是"远方的"（听说有瘟疫 / 听说有兵乱）。危险必须已经发生在玩家身边，或者正在逼近玩家。玩家必须做出选择——选错就有代价（health 减 / 物品损耗 / 关系破裂 / 错过机会）。选对也只是活下来——下一波危险还会来。`, `20. 回合递进：危险不能"原地踏步"——每一回合必须比上一回合更紧迫。第 1 回合"听到远方的声音" → 第 2 回合"声音逼近" → 第 3 回合"门被推开" → 第 4 回合"必须选"。不能连续 3 回合"危险都在远处没发生"。`, ``, `# 当前状态`, `- 世数：第${state.life_number || 1}世`, `- 姓名：${state.name || '无名'}，${state.gender || '男'}，${state.age}岁（${healthDesc}）`, `- 职业：${state.occupation || '庶民'}，阶层：${state.socialClass || '庶人'}`, `- 朝代：${state.dynasty || '?'} · ${state.eraDisplay || ''}`, `- 位置：${state.city || state.city_name || '?'} · ${monthStr}`, `- 年份：${state.year}年（第${state.life_number || 1}世）`, `- 金钱：${state.coin || 0}文`, `- 携带物品：${itemsList || '无'}`, ``, `# 前世痕迹`, legacyContext || `这是你第一次穿越，没有前世痕迹。`, ``, `# 历史事件`, eventsContext || `${state.year || '?'}年${monthStr}，史书未录重大事件，民间自有其烟火。无事件月1~2轮快速推进日常剧情，不要拖沓。`, `事件分成影响全国和影响城市2种。对于影响全国的历史事件，需要5-10轮对话完成。对于影响城市的历史事件，需要3-5轮对话完成。`, `如果玩家在事件中的行为影响了历史走向（蝴蝶效应），可以改编事件细节，不一定完全贴合真实。`, ``, `# 输出格式`, `输出必须是合法JSON数组，格式如下：`, `[`, `  {`, `    "p": 0.65,`, `    "content": "白话文剧情，150~400字，直接进入场景",`, `    "options": ["选项A（有真实差异）", "选项B", "选项C（可选）"],`, `    "patch": {`, `      "coin": -200,`, `      "health": -5,`, `      "items": {`, `        "茶包": -15`, `      }`, `    }`, `  }`, `]`, ``, `patch 字段含义（按需使用，不写 = 该字段不变）：`, `- coin：铜钱变化（整数，AI 根据剧情定幅度）。`, `- health：健康变化（整数，AI 根据剧情定幅度）。`, `- items：物品状态变化。`, `  - 物品名见"当前状态"段"携带物品"中的中文（如"茶包""针线包""镊子"）。`, `  - "<物品名>": 数字 → 减少该物品 durability（数字 = 损耗值，AI 根据剧情定；durability 减到 0 时物品消失）。`, `  - 没变化不写 items 字段。`,
    `- month_delta：本次剧情跨度（整数，0~60）。worker 会自动 clamp。
  - 0：同月内多事件（"看了一天病"、"街口闲坐半日"）。
  - 1：默认节奏（"过了一夜"、"次日清晨"）。
  - 3：季度跨度（"过完冬天开春了"、"夏天就这么过去了"）。
  - 6：半年跨度（"秋去冬来"）。
  - 12：跨年（"转眼一年"）。
  - 60：极端（"十年后..."）上限，不要常用。
  - **必须根据剧情真实跨度决定，不是固定 1**。
`,
    `# 节奏指导（v11 新增，D008）`,
    ``,
    `month_delta 不是固定 1，按剧情真实跨度决定：`,
    ``,
    `- **回合内（month_delta=0）**：这一回合剧情全在同一月内
  - 玩家出门办事、走亲戚、买东西、看病、做决定——这些是"回合内"动作
  - content 里不写时间流逝暗示，写场景推进
- **次日/几天（month_delta=1~2）**：
  - "次日清晨"、"又过了两日"、"三天后"
  - 大多数回合的默认
- **季节跨度（month_delta=3~6）**：
  - "过完冬天开春了"、"入夏了"、"转眼入秋"
  - 适合"修养后"、"密谋后"、"等待后"
- **年跨度（month_delta=12~24）**：
  - "一年就这么过去了"、"两载光阴"
  - 适合"战乱后重建"、"长期流放"、"家族衰败"
- **极长跨度（month_delta=36~60）**：
  - "十年后"、"半生已过"
  - **慎用**——一旦用就是大跨度跳跃，玩家会失联感
  - 用前必须在前一回合铺垫（"这天夜里你默默许下心愿——若能熬过这关，便用十年换太平"）
`,
    `**关键**：month_delta 是"客观时间推进"，与回合节奏独立。一回合可以跳 12 个月（比如"三年的仗打完"），也可以 12 回合都在同一个月（比如围城战）。`,
    ``,
    `**写时间跨度时**：content 里仍然用季节/节气（"入秋了"、"惊蛰前后"），不要写具体月份。month_delta 是"系统推进用"，content 是"叙事用"，两套语言独立。`, ``, `约束：`, `- p 保留 1~2 位小数，所有分支 p 之和严格等于 1.0`, `- p 的含义是"这个分支被选中的概率"——不是"这个分支的危险度"。p 高的分支可以安全，p 低的分支可以危险。p 是系统抽样权重，危险是剧情属性，两者正交。`, `- content 中不要包含任何概率信息、不要写"你可以选择"`, `- 如果玩家上轮有自由输入（非点击选项），本轮必须对该输入做出合理响应`, `- 如果当前无历史事件，1~2 轮快速推进日常剧情，不要拖沓`, `- 死亡判定由系统负责，你不需要写"你死了"`, `- patch 不影响 content 的"显示"——剧情里不直接说"你失去了 200 文"，而是用叙事暗示`, `- 玩家只能从下一轮的状态变化感知 patch（"你摸了摸口袋，钱袋轻了"）`, `- 死亡（health 归零）由系统判定，不由 patch 控制`,
  ].join('\n')
}

function buildUserPrompt(input, history) {
  if (!history || history.length === 0) return ''
  return String(input || '继续')
}

function pickBranch(branches) {
  if (!branches || branches.length === 0) return { content: '前方一片寂静。', options: ['继续前行'], patch: {} }
  const totalP = branches.reduce((sum, b) => sum + (b.p || 0), 0)
  let roll = Math.random() * totalP
  for (const b of branches) {
    roll -= (b.p || 0)
    if (roll <= 0) return { content: b.content, options: b.options, patch: b.patch }
  }
  return { content: branches[0].content, options: branches[0].options, patch: branches[0].patch }
}

function callLLM(messages, modelOverride) {
  // v0.1.83: 支持 modelOverride fallback（默认 M2.7-highspeed，400 时回退 M2）
  return new Promise((resolve, reject) => {
    const useModel = modelOverride || MM_MODEL
    const data = JSON.stringify({ model: useModel, messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE })
    const url = new URL(MM_BASE_URL + '/chat/completions')
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MM_API_KEY },
      timeout: LLM_TIMEOUT_MS,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          // v0.1.83: log 完整错误响应体（不截断），方便排查
          console.error('[ai_narrate_worker] AI 非 200 响应，model=' + useModel + ', status=' + res.statusCode + ', body:', body)
          const err = new Error(`AI服务暂不可用 (${res.statusCode})`)
          err.statusCode = res.statusCode
          err.body = body
          reject(err)
          return
        }
        try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('AI响应格式异常')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('AI响应超时')) })
    req.write(data)
    req.end()
  })
}