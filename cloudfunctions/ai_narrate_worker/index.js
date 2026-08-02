/**
 * 云函数：ai_narrate_worker
 *
 * ⚠️⚠️⚠️ 改 prompt 的人必须先读这一段 ⚠️⚠️⚠️
 * 硬性红线（先生 2026-06-28 拍板）：
 *   **prompt 模板字符串(反引号包裹)内禁止出现**：
 *     ① 决策编号
 *     ② "先生拍板"开头注释
 *     ③ 任何"对人解释"的注释（即使看起来对 AI 有帮助）
 *   改前必 grep 影响范围（本文件搜 patch/health/coin/拍板/决策号 关键字, 排除 // 与 * 注释行）
 *   改后必查：扫描整个文件反引号字符串内是否还有"对该字段的旧引用"（之前漏清多起违规注释）
 *
 * v0.2.5-H（先生 2026-06-13 10:30 拍板）：JSON 解析失败时，把原始 AI 输出写进 DB
 *   - 解析失败抛特殊 Error（带 parseFailed=true + debugInfo）
 *   - 外层 catch 识别后，构造 fakeResult 写 result_str + error_str
 *   - fakeResult 含 result.debug.raw_response（前端 DBG 浮窗能渲染 AI 原始输出）
 *   - 配合 narrate_get_result v0.2.5-H 的"result_str 优先于 error_str"修复
 *
 * v0.2.5-G（先生 2026-06-13 10:08 拍板）：重试不污染 AI 输入
 *   - isRetry 时不再 push 额外 message（history 自动包含上轮 user）
 *   - history 为空（首轮 init）时才补"开始"防 MiniMax 2013
 *
 * v0.2.5 — 按 docs/prompt.md 完整替换 buildSystemPrompt 字符串（先生 2026-06-12 09:31 拍板）
 *   - AI 角色定位："死神"（先生 prompt.md 开场白）—— 玩家逗留越久 AI 越差劲
 *   - 跨世机制：v0.2.4 改写版 → 先生 v9 原文（4 层痕迹：文字/血脉/物品/念念不忘）
 *   - 世界观：5 种危险 → 6 种（多了"其它"）；写危险原则 #3 加"诱导玩家进圈套"
 *   - 写危险原则 #4："梯度" 删掉（先生 prompt.md 没这条）
 *   - 写作风格：9 条 → 8 条（删"信息密度 200-400"那条；先生写"200 字左右"）
 *   - 质量自检 #2：恢复 v9 原文（去掉 v0.2.5 强化）
 *   - 删除：v0.2.5 的"# 你的暗线"段 / "在世收紧"#18-20 强化 / "元叙事暗线"禁忌词
 *   - month_delta 字段说明 + 节奏指导段保留（先生 prompt.md 也有，照搬）
 *   - 删除：v0.1.86 的"# 历史消息格式说明"段（先生 prompt.md 没有）
 *
 *   ⚠️ 重要：v0.2.4 NOT_FOUND 修复后，前端走 submit → worker → get_result 三段
 *      我之前只改了 cloudfunctions/ai_narrate/index.js（死代码），先生 DBG 看不到新 prompt
 *      现已同步到 ai_narrate_worker
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
// 2026-08-02：AI 输出解析链路独立成模块（配单测 parse-ai-output.test.js）
// 规则：每遇解析失败加测试 case；改解析函数必须保证历史 case 全过
const { parseAIOutput } = require('./parse-ai-output')

// v0.6.9x（先生 2026-06-19 04:27 拍板）：换回 MiniMax-M2.7-highspeed
// 之前用 DeepSeek v4 Flash（v0.6.9 切到 DS；本次反向回滚）
// 思考链：think=false 关闭，保留前端 think 剥离作为兜底
const MM_API_KEY = process.env.MM_API_KEY
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7-highspeed'
const MM_FALLBACK_MODEL = 'MiniMax-M2.7-highspeed'
const MAX_TOKENS = 1500  // v3.0.9: 单分支 narrative 只需 ~500 token，1500 给 LLM 推理余量
const SCORE_MAX_TOKENS = 800  // D045：AI₂ JSON 9 属性 + month_delta + items 至少 200 token, 300 太短经常截断
const TEMPERATURE = 0.85
const LLM_TIMEOUT_MS = 110000

// 榜单阈值（硬编码，从 data/leaderboards.json 预计算，数据不变）
// v0.6.47: 各榜单末位历史人物的实际综合分（数据已重算到游戏量级）
const BOARD_THRESHOLDS = {
  '名医榜': 2550,   '名将榜': 5200,   '富商榜': 3000,
  '文豪榜': 4350,   '能臣榜': 3445,   '义士榜': 2700,
  '全能榜': 19978,  '颜值榜': 8000,
}
const BOARD_TARGET_PERSON = {
  '名医榜': '孔伯华(民国)', '名将榜': '林冲(宋)', '富商榜': '伍崇曜(清)',
  '文豪榜': '黄景仁(清)', '能臣榜': '赵高(秦)', '义士榜': '王光兴(明末)',
  '全能榜': '关汉卿(元)', '颜值榜': '岳飞(南宋)',
}
const ATTR_NAMES = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']

// ─────── 年号表（2026-08-02 从 generate_identity 复制，补显德；用于跨年后动态重算 eraDisplay）───────
// 键 = '起始年|朝代'，值 = [年号名, 起始年]
const ERA_TABLE = new Map([
  ['-202|西汉', ['高祖', -202]], ['-180|西汉', ['文帝', -180]], ['-141|西汉', ['建元', -140]], ['-119|西汉', ['元狩', -122]], ['-87|西汉', ['后元', -88]], ['9|西汉', ['始建国', 9]],
  ['25|东汉', ['建武', 25]], ['89|东汉', ['永元', 89]], ['184|东汉', ['中平', 184]], ['220|东汉', ['延康', 220]],
  ['220|三国', ['黄初', 220]], ['221|三国', ['章武', 221]], ['229|三国', ['黄龙', 229]], ['263|三国', ['景元', 260]], ['280|三国', ['咸宁', 275]],
  ['265|西晋', ['泰始', 265]], ['290|西晋', ['永熙', 290]], ['316|西晋', ['建兴', 313]],
  ['317|东晋', ['建武', 317]], ['383|东晋', ['太元', 376]], ['420|东晋', ['元熙', 419]],
  ['420|南北朝', ['永初', 420]], ['439|南北朝', ['太延', 435]], ['493|南北朝', ['太和', 477]], ['523|南北朝', ['正光', 520]], ['548|南北朝', ['太清', 547]], ['577|南北朝', ['建德', 572]],
  ['589|隋', ['开皇', 581]],
  ['618|唐', ['武德', 618]], ['626|唐', ['贞观', 627]], ['690|唐', ['天授', 690]], ['713|唐', ['开元', 713]], ['755|唐', ['天宝', 742]], ['875|唐', ['乾符', 874]], ['907|唐', ['天祐', 904]],
  ['907|五代十国', ['开平', 907]], ['923|五代十国', ['同光', 923]], ['936|五代十国', ['天福', 936]], ['947|五代十国', ['天福', 947]], ['951|五代十国', ['广顺', 951]], ['954|五代十国', ['显德', 954]],
  ['960|北宋', ['建隆', 960]], ['1005|北宋', ['景德', 1004]], ['1069|北宋', ['熙宁', 1068]], ['1127|北宋', ['靖康', 1126]],
  ['1127|南宋', ['建炎', 1127]], ['1141|南宋', ['绍兴', 1131]], ['1234|南宋', ['端平', 1234]], ['1279|南宋', ['祥兴', 1278]],
  ['1271|元', ['至元', 1264]], ['1280|元', ['至元', 1264]], ['1344|元', ['至正', 1341]], ['1368|元', ['至正', 1341]],
  ['1368|明', ['洪武', 1368]], ['1420|明', ['永乐', 1403]], ['1449|明', ['正统', 1436]], ['1572|明', ['万历', 1573]], ['1644|明', ['崇祯', 1628]],
  ['1644|清', ['顺治', 1644]], ['1689|清', ['康熙', 1662]], ['1759|清', ['乾隆', 1736]], ['1840|清', ['道光', 1821]], ['1898|清', ['光绪', 1875]], ['1912|清', ['宣统', 1909]],
  ['1912|中华民国', ['民国', 1912]], ['1928|中华民国', ['民国', 1912]], ['1937|中华民国', ['民国', 1912]], ['1949|中华民国', ['民国', 1912]],
])

function _eraToCN(n) {
  const YN = ['零','一','二','三','四','五','六','七','八','九']
  if (n < 10) return YN[n]
  if (n < 20) return '十' + (n > 10 ? YN[n-10] : '')
  if (n < 100) { const t = Math.floor(n/10), u = n%10; return (t>1 ? YN[t] : '') + '十' + (u>0 ? YN[u] : '') }
  if (n < 1000) { const h = Math.floor(n/100), r = n%100; return YN[h] + '百' + (r>0 ? _eraToCN(r) : '') }
  return String(n)
}

// 2026-08-02：根据年份+朝代动态算年号显示（修复 eraDisplay 出生后不更新的 bug）
// 与 generate_identity 口径一致：v[1] = 年号起始年，offset = year - v[1] + 1
// 例：954|五代十国 → ['显德', 954]，955 年 → 显德二年
function computeEraDisplay(year, dynasty) {
  if (!year || !dynasty) return ''
  if (dynasty === '中华人民共和国') return '公元' + year + '年'
  let best = null
  for (const [key, v] of ERA_TABLE) {
    const [kYear, kDyn] = key.split('|')
    if (kDyn === dynasty && Number(kYear) <= year) {
      if (!best || Number(v[1]) > best.start) best = { name: v[0], start: Number(v[1]) }
    }
  }
  if (!best) return ''
  const offset = year - best.start + 1
  return offset <= 1 ? best.name + '元年' : best.name + _eraToCN(offset) + '年'
}

function calcBoardScore(state, board) {
  const s = (a) => state[a] || 0
  switch(board) {
    case '名医榜': return Math.round(s('医术')*0.7 + s('声望')*0.3)
    case '名将榜': return Math.round(s('战功')*0.7 + s('声望')*0.3)
    case '富商榜': return s('财富')
    case '文豪榜': return Math.round(s('文采')*0.7 + s('学识')*0.3)
    case '能臣榜': return Math.round(s('政绩')*0.7 + s('声望')*0.3)
    case '义士榜': return Math.round(s('义行')*0.7 + s('声望')*0.3)
    case '全能榜': return s('声望')+s('财富')+s('学识')+s('颜值')
    case '颜值榜': return s('颜值')
    default: return 0
  }
}

function computeClosestBoard(state) {
  let best = null, bestDiff = Infinity
  for (const [name, threshold] of Object.entries(BOARD_THRESHOLDS)) {
    const score = calcBoardScore(state, name)
    const diff = threshold - score
    if (diff <= 0) { best = { name, diff:0, on:true }; break }  // 已上榜
    if (diff < bestDiff) { best = { name, diff, on:false }; bestDiff = diff }
  }
  return best
}

// D094-async（2026-07-23 先生拍板）：拆两段同步调用
// 真因：D089 fire-and-forget 假设云函数实例存活跑完 finalizeTask，但先生云函数 Runtime=2-4ms 立即结束
//       → finalizeTask 从来没跑过 → llm_io 永远 partial=true → 前端 state.month 永远不更新
// 修法：worker main 函数改成同步 await，根据 phase 跑对应阶段
//   - phase='ai1'：跑 AI₁（生成叙事），return {content, options, state, ...}
//   - phase='ai2'：跑 AI₂（评分结算属性），return {attrPatch, newState, ...}
//   - phase='scene'：跑场景抽取（独立 AI 调用，2026-08-02 23:35 先生拍板），return {scene}
//   前端分两次调 worker（先生 D089 partial 体验保留：ai1 1-3 秒先看到叙事，ai2 20-30 秒后看到属性）
exports.main = async (event) => {
  const { phase, openid, input, is_retry } = event || {}

  if (!openid && phase !== 'scene') {
    return { error: '缺少 openid', code: 400 }
  }
  if (phase !== 'ai1' && phase !== 'ai2' && phase !== 'scene') {
    return { error: '缺少 phase（必须是 ai1 / ai2 / scene）', code: 400 }
  }

  const t0 = Date.now()
  console.log('[ai_narrate_worker] 启动 phase=', phase, ' openid=', openid)

  try {
    if (phase === 'ai1') {
      const narrateRequestId = `narrate_${t0}_${Math.random().toString(36).slice(2, 8)}`
      const result = await runPhase1({ openid, input, is_retry, narrateRequestId })
      console.log('[ai_narrate_worker] ai1 完成, elapsed_ms=', Date.now() - t0)
      return { success: true, phase: 'ai1', ...result }
    } else if (phase === 'scene') {
      const sceneRequestId = `scene_${t0}_${Math.random().toString(36).slice(2, 8)}`
      const result = await runPhaseScene({ openid: openid || 'scene', sceneRequestId, input })
      console.log('[ai_narrate_worker] scene 完成, elapsed_ms=', Date.now() - t0)
      return { success: true, phase: 'scene', ...result }
    } else {
      const scoreRequestId = `score_${t0}_${Math.random().toString(36).slice(2, 8)}`
      const result = await runPhase2({ openid, scoreRequestId, input })
      console.log('[ai_narrate_worker] ai2 完成, elapsed_ms=', Date.now() - t0)
      return { success: true, phase: 'ai2', ...result }
    }
  } catch (e) {
    console.error('[ai_narrate_worker] phase=', phase, ' 异常:', e.message, '\n', e.stack)
    // 写 error llm_io（精简版）
    const errRequestId = `${phase === 'ai1' ? 'narrate' : phase === 'scene' ? 'scene' : 'score'}_${t0}_${Math.random().toString(36).slice(2, 8)}`
    await writeLlmIo(errRequestId, openid || 'scene', phase === 'ai1' ? 'narrate' : phase === 'scene' ? 'scene' : 'score', 'error', {
      error: e.message,
    })
    return { success: false, phase, error: e.message, partial: phase === 'ai1' }
  }
}

// ─────── D090（2026-07-20）：后端自治 state，player_life 是真值 ───────
// 从 player_life 拉 openid 最新世 state + life_number
async function loadLatestLife(openid) {
  const res = await db.collection('player_life')
    .where({ openid })
    .orderBy('life_number', 'desc')
    .limit(1)
    .get()
  const rec = res.data && res.data[0]
  if (!rec) return null
  // 把 player_life 字段映射回 worker 内部 state 结构（字段名对齐 game.init）
  const state = {
    life_number: rec.life_number,
    name: rec.name,
    gender: rec.gender === 'female' ? '女' : '男',
    age: rec.age,
    occupation: rec.occupation,
    social_class: rec.social_class || rec.socialClass,
    dynasty: rec.dynasty,
    eraDisplay: rec.era_display || rec.eraDisplay,
    city: rec.city,
    year: rec.year,
    month: rec.month,
    round: rec.round || 0,
    coin: rec.coin != null ? rec.coin : 1000,
    '声望': rec.reputation || 0,
    '财富': rec.wealth || 0,
    '学识': rec.knowledge || 0,
    '颜值': rec.appearance || 0,
    '医术': rec.medical || 0,
    '战功': rec.military || 0,
    '文采': rec.literary || 0,
    '政绩': rec.political || 0,
    '义行': rec.righteous || 0,
    lifespan: rec.lifespan,
    epitaph: rec.epitaph || '',
    alive: rec.alive !== false,
    items: rec.current_items || [],
    created_at: rec.created_at,
  }
  // D094（2026-07-22 先生拍板）：精简为单一 is_scoring bool 字段
  // 兼容老世 record：老字段 finalize_status / last_finalize_at / death_threat / history_shelter /
  //   no_growth_streak / historical_shelter 仍在 player_life 里，只是不再读写
  const is_scoring = rec.is_scoring === true || rec.finalize_status === 'pending'
  return { state, life_number: rec.life_number, is_scoring }
}

// 把 worker 算完的 updated state 写回 player_life（is_scoring=false 标记空闲）
async function saveLife(openid, life_number, updated) {
  const now = Date.now()
  const lifeData = {
    openid,
    life_number,
    alive: updated.alive !== false,
    name: updated.name,
    gender: updated.gender === '女' ? 'female' : 'male',
    age: updated.age,
    occupation: updated.occupation,
    social_class: updated.social_class || updated.socialClass,
    dynasty: updated.dynasty,
    era_display: updated.eraDisplay,
    city: updated.city,
    year: updated.year,
    month: updated.month,
    round: updated.round,
    coin: updated.coin != null ? updated.coin : 1000,
    reputation: updated['声望'] || 0,
    wealth: updated['财富'] || 0,
    knowledge: updated['学识'] || 0,
    appearance: updated['颜值'] || 0,
    medical: updated['医术'] || 0,
    military: updated['战功'] || 0,
    literary: updated['文采'] || 0,
    political: updated['政绩'] || 0,
    righteous: updated['义行'] || 0,
    lifespan: updated.lifespan,
    epitaph: updated.epitaph || '',
    current_items: updated.items || [],
    updated_at: now,
    is_scoring: false,
  }
  // 宽松 upsert：先 update（where openid+life_number），无记录则 add
  const exists = await db.collection('player_life').where({ openid, life_number }).count()
  if (exists.total > 0) {
    await db.collection('player_life').where({ openid, life_number }).update({ data: lifeData })
  } else {
    await db.collection('player_life').add({ data: { ...lifeData, created_at: now } })
  }
  return now
}

// 第二轮 worker 开头短等：若上一轮 is_scoring==true（评分中）→ 轮询直到 is_scoring=false
// 保证下一轮基于"上一轮结算后"的 state
async function waitForFinalize(openid, maxWaitMs) {
  const maxWait = maxWaitMs || 10000
  const deadline = Date.now() + maxWait
  while (Date.now() < deadline) {
    const cur = await loadLatestLife(openid)
    if (!cur) return null
    if (!cur.is_scoring) return cur
    await new Promise(r => setTimeout(r, 200))
  }
  console.log('[D094] waitForFinalize 超时，退化用当前 player_life state')
  return await loadLatestLife(openid)
}

// v0.2.4 — 主逻辑移到 backgroundTask（与 main 分离）
// D094-async（2026-07-23 先生拍板）：拆两段同步调用
// - runPhase1：跑 AI₁（生成叙事），return {content, options, state, rawContent, systemPrompt, userPrompt, messages, perfLogs}
// - runPhase2：跑 AI₂（评分结算属性），return {attrPatch, newState, monthChanged, systemMessages}
// 前端分两次调 worker（先生 D089 partial 体验保留）
async function runPhase1({ openid, input, is_retry, narrateRequestId }) {
  const startTs = Date.now()
  let history = null
  let perfLogs = []
  let systemPrompt, userPrompt, messages, rawContent, branches

  // 写 pending llm_io（精简版：只记调用参数）
  await writeLlmIo(narrateRequestId, openid, 'narrate', 'pending', {
    input: { model: MM_MODEL, prompt_chars: 0, is_retry: !!is_retry },
  })

  // D090：后端自治 state，从 player_life 拉最新世
  let loaded = await loadLatestLife(openid)
  if (!loaded) {
    throw new Error('player_life 无记录（应不可能：能发 submit 必已有世）')
  }
  // 若上一轮还在算（is_scoring=true）→ 短等它完成
  if (loaded.is_scoring) {
    loaded = await waitForFinalize(openid)
    if (!loaded) throw new Error('waitForFinalize 无记录')
  }
  const state = loaded.state
  const life_number = loaded.life_number

  // 本回合标记评分中（并发轮次看到 is_scoring=true 就会等）
  try {
    await db.collection('player_life').where({ openid, life_number }).update({ data: { is_scoring: true } })
  } catch (e) {
    console.error('[D094] 标记 is_scoring=true 失败:', e.message)
  }

  const realInput = is_retry ? '' : (input || '')

  // D070：user 先入库，再拉 history，再调 AI
  if (realInput) {
    const _userRecord = {
      openid: openid,
      life_number: state.life_number || 1,
      role: 'user',
      content: realInput,
      created_at: Date.now(),
    }
    // 2026-08-03 先生拍板 A：加自增 seq（连续编号索引）
    const _userSeq = await nextSeq(openid, _userRecord.life_number)
    if (_userSeq) _userRecord.seq = _userSeq
    const _userErr = validateNarrateMessage(_userRecord)
    if (_userErr) {
      console.error('[D082] user 入库校验失败:', _userErr, JSON.stringify(_userRecord))
    } else {
      await db.collection('narrate_history').add({ data: _userRecord })
      console.log('[D070] user 先入库, content=', realInput.slice(0, 30))
    }
  }

  // D067：worker 自己从云端 narrate_history 拉 history
  // 2026-08-02 先生拍板：不限制上下文对话数量，全量拉取（分页循环，单次最多 1000）
  // 之前 orderBy asc + limit(200) 正序取前 200 会丢掉最新对话（211 条时最新 11 条被截）
  const _MAX_PAGE = 1000
  let _allHistory = []
  let _offset = 0
  while (true) {
    const _page = await db.collection('narrate_history')
      .where({ openid, life_number: state.life_number || 1 })
      .orderBy('created_at', 'asc')
      .skip(_offset)
      .limit(_MAX_PAGE)
      .get()
    _allHistory = _allHistory.concat(_page.data || [])
    if ((_page.data || []).length < _MAX_PAGE) break
    _offset += _MAX_PAGE
  }
  history = _allHistory
  console.log('[D067] worker 自己拉 history（全量）, count=', history.length)

  // 2026-08-02 先生拍板：对话压缩——超过 200 条后每满 100 条触发，摘要存独立表 history_compress
  // 18:18 并行化：摘要生成与 AI₁ 并行（Promise 并发，总耗时 = max 不是 sum）——
  //   叙事不被阻塞、属性不被延迟（ai2 不再补跑）、摘要同时完成下一轮即可用
  const fullHistory = history  // 压缩用全量（截断前保存）
  const compressCtx = await getCompressContext(history, openid, state.life_number || 1)
  const compressSummary = compressCtx.summary
  const compressLastId = compressCtx.lastId
  const compressLastSeq = compressCtx.lastSeq
  // 2026-08-03 先生拍板：不截断降级——无摘要时全量喂（首次压缩在 seq=200 整百触发，最多 199 条 ≈ 9s，安全线内）
  // 旧逻辑截断最近 100 条会丢 seq 1-99 的内容（没进摘要也没喂）→ 违背「不丢消息」原则，已删
  // 并行启动压缩（内部判断触发条件 + 5 分钟防并发；失败不影响 AI₁）
  const compressTask = compressHistoryIfNeeded(fullHistory, openid, state.life_number || 1)
    .catch(e => { console.error('[COMPRESS] 并行压缩异常:', e.message); return null })

  const preUpdate = { ...state }
  if (!preUpdate.month) preUpdate.month = 1
  if (!preUpdate.coin) preUpdate.coin = 1000
  if (!preUpdate.alive) preUpdate.alive = true
  preUpdate.round = (preUpdate.round || 0) + 1

  const t0 = Date.now()
  const monthEvent = await queryMonthEvent(preUpdate)
  const t1 = Date.now()
  console.log('[PERF] queryMonthEvent_ms=', t1 - t0)

  globalThis.__PERF_LOGS__ = perfLogs
  const aiResult = await callAI(preUpdate, realInput, history, monthEvent, is_retry, compressSummary, compressLastId, compressLastSeq)
  branches = aiResult.branches
  systemPrompt = aiResult.systemPrompt
  userPrompt = aiResult.userPrompt
  messages = aiResult.messages
  rawContent = aiResult.rawContent
  const t2 = Date.now()
  console.log('[PERF] callAI_ms=', t2 - t1)
  perfLogs.push({ stage: 'queryMonthEvent_ms', ms: t1 - t0 })
  perfLogs.push({ stage: 'callAI_ms', ms: t2 - t1 })

  // 等待并行压缩完成（已与 callAI 并行跑，通常已完成；失败已 catch 不影响主流程）
  await compressTask

  // 写 narrate llm_io 成功记录（2026-08-02 改：raw_response 存 AI 原始输出，定位问题用）
  // 教训：之前存 JSON.stringify(branches)（解析后）→ 兜底/解析失败时看不到 AI 到底吐了什么
  //       先生指出 llm_io 是调试工具，必须存原始输出；解析结果单独存 parsed 字段
  let parsedBranches = ''
  try { parsedBranches = JSON.stringify(branches) } catch (e) {}
  await writeLlmIo(narrateRequestId, openid, 'narrate', 'success', {
    input: { model: MM_MODEL, prompt_chars: systemPrompt.length + userPrompt.length, is_retry: !!is_retry },
    raw_response: rawContent || '',
    parsed: parsedBranches,
    duration_ms: t2 - startTs,
  })
  const picked = pickBranch(branches)
  const t3 = Date.now()
  console.log("[PERF] pickBranch_ms=", t3 - t2)
  perfLogs.push({ stage: "pickBranch_ms", ms: t3 - t2 })

  // 写 ai 消息到 narrate_history（D056 实时 add）
  try {
    const _aiRecord = {
      openid: openid,
      life_number: life_number,
      role: 'ai',
      content: picked.content || '',
      options: picked.options || null,
      created_at: Date.now(),
    }
    // 2026-08-03 先生拍板 A：加自增 seq（连续编号索引）
    const _aiSeq = await nextSeq(openid, life_number)
    if (_aiSeq) _aiRecord.seq = _aiSeq
    const _aiErr = validateNarrateMessage(_aiRecord)
    if (_aiErr) {
      console.error('[D082] ai 入库校验失败:', _aiErr, JSON.stringify(_aiRecord))
    } else {
      await db.collection('narrate_history').add({ data: _aiRecord })
    }
  } catch (e) {
    console.error('[D056] narrate_history add 失败:', e.message)
  }

  console.log('[ai_narrate_worker] runPhase1 完成, elapsed_ms=', Date.now() - startTs)

  // 返回 phase1 结果（前端拿到后立即显示叙事 + 选项）
  return {
    narrateRequestId,
    content: picked.content,
    options: picked.options,
    state: state,
    preUpdate: preUpdate,
    branches: branches,
    picked: picked,
    history: history,
    monthEvent: monthEvent,
    is_retry: is_retry,
    debug: {
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      messages: messages,
      raw_response: rawContent,
      perf_logs: perfLogs,
      picked_branch: picked,
      d048f_log: (globalThis.__D048F_LOG__ || []).join("\n") || null,
    },
  }
}

async function runPhase2({ openid, scoreRequestId, input }) {
  const startTs = Date.now()

  // 写 pending score llm_io
  await writeLlmIo(scoreRequestId, openid, 'score', 'pending', {
    input: { model: MM_MODEL },
  })

  // D090：从 player_life 拉最新世 state
  let loaded = await loadLatestLife(openid)
  if (!loaded) throw new Error('player_life 无记录')
  // ai2 进来时 ai1 应该已写 is_scoring=true（前端两次调用顺序保证）
  // 如果 is_scoring=false（极端情况：ai1 崩了没标），跳过等，立刻进入
  if (loaded.is_scoring) {
    console.log('[D094-async] ai2 进来时 is_scoring=true，ai1 应该已标，开始跑 AI₂')
  } else {
    console.warn('[D094-async] ai2 进来时 is_scoring=false（异常），强制标 true 防止并发锁死')
    try {
      await db.collection('player_life').where({ openid, life_number: loaded.life_number }).update({ data: { is_scoring: true } })
    } catch (e) {}
  }
  const state = loaded.state
  const life_number = loaded.life_number

  // 拉 narrate_history（从云端取 AI₁ 的 content 作为 AI₂ 评分输入）
  // 2026-08-02 先生拍板：不限制上下文对话数量，全量拉取（分页循环，单次最多 1000）
  const _MAX_PAGE = 1000
  let _allHistory = []
  let _offset = 0
  while (true) {
    const _page = await db.collection('narrate_history')
      .where({ openid, life_number })
      .orderBy('created_at', 'asc')
      .skip(_offset)
      .limit(_MAX_PAGE)
      .get()
    _allHistory = _allHistory.concat(_page.data || [])
    if ((_page.data || []).length < _MAX_PAGE) break
    _offset += _MAX_PAGE
  }
  const history = _allHistory

  // 取最近一条 ai 消息的 content 作为 AI₂ 输入
  const lastAi = [...history].reverse().find(m => m.role === 'ai')
  if (!lastAi || !lastAi.content) {
    throw new Error('AI₁ 没生成内容（narrate_history 没 ai 消息）')
  }
  const aiContent = lastAi.content

  // 调 AI₂（callScoringAI）
  const t0 = Date.now()
  const { attrPatch, scorePrompt, scoreRawResponse } = await callScoringAI(aiContent, state, history, input)
  const t1 = Date.now()
  console.log('[PERF] callScoringAI_ms=', t1 - t0)

  // 写 score llm_io 成功记录（精简版：只记评分AI原始返回+耗时）
  await writeLlmIo(scoreRequestId, openid, 'score', 'success', {
    input: { model: MM_MODEL, prompt_chars: scorePrompt.length },
    raw_response: scoreRawResponse || '',
    duration_ms: t1 - startTs,
  })

  // applyPatch：推进月份 + 属性
  const updated = applyPatch(state, state, attrPatch)
  const monthChanged = updated.month !== state.month || updated.year !== state.year

  // ─────────── 死亡判定（2026-08-02 重构：3 条直接判定，删除 health 中间值）───────────
  // 1) AI₂ 剧情判死（E 类输出 death）——意外/剧情必死，优先于其他判定
  if (attrPatch.death && typeof attrPatch.death === 'object') {
    updated.alive = false
    updated.deathReason = attrPatch.death.reason || ('死亡：' + attrPatch.death.type)
    console.log('[ai_narrate_worker] AI₂ 剧情判死:', JSON.stringify(attrPatch.death))
  }
  // 2) 寿限判定（v0.6.50j 原走 health=0，现直接 alive=false）
  if (!updated.alive && updated.lifespan && updated.age >= updated.lifespan && !updated.deathReason) {
    updated.deathReason = '寿终正寝'
  }
  if (updated.alive && updated.lifespan && updated.age >= updated.lifespan) {
    updated.alive = false
    updated.deathReason = '寿终正寝'
    // D009: 寿限兜底 epitaph（AI 没写时补）
    if (!updated.epitaph) {
      var lfAge = updated.age || 20
      var lfNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(updated.socialClass) >= 0
      if (lfAge < 15) updated.epitaph = '未及弱冠，便已消散于人海。'
      else if (lfAge < 30) updated.epitaph = lfNobility ? '锦衣玉食，终化南柯一梦。' : '青春未展，已无踪迹可寻。'
      else if (lfAge < 50) updated.epitaph = lfNobility ? '风云一世，史书半行。' : '碌碌半生，终归尘土。'
      else updated.epitaph = lfNobility ? '功过自有后人评。' : '一生如梦，来去无痕。'
    }
    console.log('[ai_narrate_worker] 寿限已至触发死亡')
  }
  // 3) 社会性死亡（v0.6.61 从 finalizeTask 死代码搬来；v0.6.85 未成年人豁免）
  if (updated.alive) {
    const DEATH_ATTRS = ['声望', '财富', '学识', '医术', '战功', '文采', '政绩', '义行']
    var allZero = (updated.age || 0) >= 15  // 未成年人豁免：<15 不判
    if (allZero) {
      for (var a = 0; a < DEATH_ATTRS.length; a++) {
        if ((updated[DEATH_ATTRS[a]] || 0) > 0) { allZero = false; break }
      }
    }
    if (allZero) {
      updated.alive = false
      updated.deathReason = '全部社会属性'
      if (!updated.epitaph) {
        var sAge = updated.age || 20
        var sNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(updated.socialClass) >= 0
        if (sAge < 15) updated.epitaph = '未及弱冠，便已消散于人海。'
        else if (sAge < 30) updated.epitaph = sNobility ? '锦衣玉食，终化南柯一梦。' : '青春未展，已无踪迹可寻。'
        else if (sAge < 50) updated.epitaph = sNobility ? '风云一世，史书半行。' : '碌碌半生，终归尘土。'
        else updated.epitaph = sNobility ? '功过自有后人评。' : '一生如梦，来去无痕。'
      }
      console.log('[ai_narrate_worker] 全部社会属性归零触发死亡')
    }
  }

  // 系统消息（属性变化时触发）
  let systemMessages = []
  try {
    const V2_ATTRS = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    const changedAttrs = V2_ATTRS.filter(a => typeof updated[a] === 'number' && updated[a] !== (state[a] || 0))
    if (monthChanged || changedAttrs.length > 0) {
      systemMessages = emitSystemMessages(state, updated)
    }
  } catch (e) {
    console.error('[D094-async] 系统消息生成失败:', e.message)
  }

  // 写 system 消息到 narrate_history
  for (const sm of systemMessages) {
    try {
      // 2026-08-02 13:38 先生反馈"对话流里系统消息显示 object"：emitSystemMessages 返回 [{role,content}] 对象数组
      // 之前直接 content: sm 把整个对象存库 → 脏数据（16 条）→ 下轮 history 原样回传前端 → 渲染 [object Object]
      // 修法：与 finalize 路径（line 833）一致，取 sm.content
      const _sysRecord = { openid, life_number, role: 'system', content: (sm && sm.content) || '', created_at: Date.now() }
      // 2026-08-03 先生拍板 A：加自增 seq（连续编号索引）
      const _sysSeq = await nextSeq(openid, life_number)
      if (_sysSeq) _sysRecord.seq = _sysSeq
      await db.collection('narrate_history').add({ data: _sysRecord })
    } catch (e) {
      console.error('[D094-async] system 入库失败:', e.message)
    }
  }

  // 写 player_life（业务字段更新）
  try {
    await saveLife(openid, life_number, updated)
  } catch (e) {
    console.error('[D094-async] saveLife 失败:', e.message)
  }

  console.log('[ai_narrate_worker] runPhase2 完成, elapsed_ms=', Date.now() - startTs)

  // 计算 closest_board（前端需要）
  let closestBoardInfo = null
  try {
    closestBoardInfo = computeClosestBoard(updated)
  } catch (e) {
    console.error('[D094-async] closestBoard 计算失败:', e.message)
  }

  return {
    scoreRequestId,
    attrPatch: attrPatch,
    newState: updated,
    monthChanged: monthChanged,
    newMonth: monthChanged ? updated.month : null,
    newYear: monthChanged ? updated.year : null,
    systemMessages: systemMessages,
    closestBoard: closestBoardInfo,
    debug: {
      score_prompt: scorePrompt,
      score_raw_response: scoreRawResponse,
    },
  }
}

// 写 llm_io 记录（精简版：只记 AI 接口调用的输入输出）
// request_id: 调用标识 / openid: 调用者 / category: narrate|score / status: pending|success|error
// opts: { input, raw_response, duration_ms, error, score_raw_response }
async function writeLlmIo(request_id, openid, category, status, opts) {
  try {
    const data = {
      request_id,
      openid,
      category,
      status,
      error: (opts.error || '').slice(0, 500),
      created_at: Date.now(),
      input: opts.input || {},
      output: {
        raw_response: opts.raw_response || '',
        parsed: opts.parsed || undefined,
        duration_ms: opts.duration_ms || 0,
        score_raw_response: opts.score_raw_response || undefined,
      },
    }
    if (status === 'pending') {
      await db.collection('llm_io').add({ data })
    } else {
      await db.collection('llm_io').where({ request_id }).update({ data })
    }
  } catch (e) {
    console.error('[writeLlm_io] 失败:', e.message, 'request_id=', request_id)
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║ 两阶段改造 · 第二阶段（先生 2026-07-19 拍板）                      ║
// ║ 接收 backgroundTask 传来的参数，在后台跑第二次 AI 调用：           ║
// ║   callScoringAI → applyPatch → 死亡判定 → emitSystemMessages    ║
// ║   → 写 narrate_history（ai + system）→ 把 llm_io.output.result   ║
// ║   原地更新为完整版（partial:false），前端轮询到后做属性 merge       ║
// ║ 全程自带 try/catch，异常时通过 safeWriteResult 写 error 状态        ║
// ╚══════════════════════════════════════════════════════════════╝
async function finalizeTask(ctx) {
  const {
    request_id, payload, preUpdate, picked, branches,
    systemPrompt, userPrompt, messages, rawContent,
    history, openid, monthEvent, perfLogs, is_retry, startTs, t0,
    state, life_number,
  } = ctx
  try {
    const t4 = Date.now()
    // D043：解构拿 attrPatch + scorePrompt + scoreRawResponse(前端 DBG 用)
    const { attrPatch, scorePrompt, scoreRawResponse } = await callScoringAI(picked.content, preUpdate, history)
    const t5 = Date.now()
    console.log('[PERF] callScoringAI_ms=', t5 - t4)
    perfLogs.push({ stage: 'callScoringAI_ms', ms: t5 - t4 })
    console.log('[PERF] total_so_far_ms=', t5 - t0)
    perfLogs.push({ stage: 'total_so_far_ms', ms: t5 - t0 })
    // D036（先生 2026-06-28 01:07 拍板）：applyPatch 输入从叙事 AI 的 picked.patch 改为 AI₂ 输出的 attrPatch
    // 2026-08-02：透传 location/city/occupation（AI₂ 新增 D 类输出，之前只透传 month_delta+items 导致地点变更丢失）
    const synthPatch = {
      month_delta: typeof attrPatch.month_delta === 'number' ? attrPatch.month_delta : 0,
      items: attrPatch.items || {},
    }
    if (typeof attrPatch.location === 'string') synthPatch.location = attrPatch.location
    if (typeof attrPatch.city === 'string') synthPatch.city = attrPatch.city
    if (typeof attrPatch.occupation === 'string') synthPatch.occupation = attrPatch.occupation
    // D048f（先生 2026-06-28 12:09 拍板·偶现 bug 排查）：applyPatch 前打印 attrPatch 全文 + state 关键字段
    console.log('[D048f-debug] applyPatch input: attrPatch=', JSON.stringify(attrPatch), ' state.age=', state.age, ' state.year=', state.year, ' state.month=', state.month, ' preUpdate.age=', preUpdate.age)
    // D048o（先生 2026-06-28 16:38 拍板·"我看不到后端"）：埋点也推给前端 DBG（先生手机直接看到）
    globalThis.__D048F_LOG__ = (globalThis.__D048F_LOG__ || []).concat([`applyPatch input: attrPatch=${JSON.stringify(attrPatch)} state.age=${state.age} state.year=${state.year} state.month=${state.month} preUpdate.age=${preUpdate.age}`])
    const baseUpdated = applyPatch(state, preUpdate, synthPatch)
    // 2026-08-02：属性合并已搬进 applyPatch（本函数为 D089 前遗留死代码，不再被调用）
    // 保留 baseUpdated 变量名兼容下方引用；直接使用 applyPatch 返回
    const updated = { ...baseUpdated }
    // v0.6.61: 全部社会属性归零→社会性死亡（颜值归零只是丑，不会死）
    // v0.6.85: 未成年人（<15岁）不触发社会性死亡——幼儿/少年自然没有社会属性，不应开局即死
    const DEATH_ATTRS = ['声望', '财富', '学识', '医术', '战功', '文采', '政绩', '义行'];
    var allZero = true;
    if ((updated.age || 0) < 15) {
      allZero = false;  // 未成年人豁免
    } else {
      for (var a = 0; a < DEATH_ATTRS.length; a++) {
        if ((updated[DEATH_ATTRS[a]] || 0) > 0) { allZero = false; break; }
      }
    }
    if (allZero) {
      updated.alive = false;
      updated.deathReason = '全部社会属性';
      var age = updated.age || 20;
      var isNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(updated.socialClass) >= 0;
      if (age < 15) {
        updated.epitaph = '未及弱冠，便已消散于人海。';
      } else if (age < 30) {
        updated.epitaph = isNobility ? '锦衣玉食，终化南柯一梦。' : '青春未展，已无踪迹可寻。';
      } else if (age < 50) {
        updated.epitaph = isNobility ? '风云一世，史书半行。' : '碌碌半生，终归尘土。';
      } else {
        updated.epitaph = isNobility ? '功过自有后人评。' : '一生如梦，来去无痕。';
      }
      console.log('[ai_narrate_worker] 全部社会属性归零触发死亡');
    }
    // D009: 寿限兜底——如果寿限到 + AI 没写 epitaph → 按身份/年龄补
    if (updated.lifespan && updated.age >= updated.lifespan && !updated.epitaph) {
      var lifespanAge = updated.age || 20;
      var lifespanNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(updated.socialClass) >= 0;
      if (lifespanAge < 15) {
        updated.epitaph = '未及弱冠，便已消散于人海。';
      } else if (lifespanAge < 30) {
        updated.epitaph = lifespanNobility ? '锦衣玉食，终化南柯一梦。' : '青春未展，已无踪迹可寻。';
      } else if (lifespanAge < 50) {
        updated.epitaph = lifespanNobility ? '风云一世，史书半行。' : '碌碌半生，终归尘土。';
      } else {
        updated.epitaph = lifespanNobility ? '功过自有后人评。' : '一生如梦，来去无痕。';
      }
      console.log('[ai_narrate_worker] 寿限已至补 epitaph:', updated.epitaph);
    }
    const systemMessages = emitSystemMessages(preUpdate, updated)

    const monthChanged = updated.month !== state.month || updated.year !== state.year

    // 计算最接近榜单（注入前端展示用）
    const closestBoard = computeClosestBoard(updated)
    let closestBoardInfo = null
    if (closestBoard) {
      closestBoardInfo = {
        name: closestBoard.name,
        diff: closestBoard.diff,
        on: closestBoard.on,
        targetPerson: BOARD_TARGET_PERSON[closestBoard.name] || null,
      }
    }

    const result = {
      success: true,
      partial: false,  // 完整版
      branch: picked,
      branches: branches,
      state: updated,
      month_changed: monthChanged,
      new_month: monthChanged ? updated.month : null,
      new_year: monthChanged ? updated.year : null,
      history: history,
      narrate_history_added_ids: null,
      debug: {
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        messages: messages,
        raw_response: rawContent,
        perf_logs: perfLogs,
        attr_patch: attrPatch,
        picked_branch: picked,
        score_prompt: scorePrompt,
        score_raw_response: scoreRawResponse,
        d048f_log: (globalThis.__D048F_LOG__ || []).join('\n') || null,
      },
      event: monthEvent,
      system_messages: systemMessages,
      closest_board: closestBoardInfo,
      is_retry: is_retry,
      attr_patch: attrPatch,
    }

    // 把 llm_io.output.result 原地更新为完整版（partial 已是 success，这里只覆盖 result）
    try {
      await db.collection('llm_io').where({ request_id }).update({
        data: {
          status: 'success',
          output: {
            raw_response: rawContent,
            parsed: picked,
            result: result,
          },
        },
      })
    } catch (e) {
      console.error('[ai_narrate_worker] finalize 更新 llm_io 失败:', e.message)
    }

    // D056：worker 实时 add ai + system_messages 到 narrate_history
    try {
      const addedIds = []
      const _aiRecord = {
        openid: openid,
        life_number: life_number,
        role: 'ai',
        content: picked.content || '',
        options: picked.options || null,
        created_at: Date.now(),
      }
      // 2026-08-03 先生拍板 A：加自增 seq（连续编号索引）
      const _fAiSeq = await nextSeq(openid, life_number)
      if (_fAiSeq) _aiRecord.seq = _fAiSeq
      const _aiErr = validateNarrateMessage(_aiRecord)
      if (_aiErr) {
        console.error('[D082] ai 入库校验失败:', _aiErr, JSON.stringify(_aiRecord))
      } else {
        const aiRes = await db.collection('narrate_history').add({ data: _aiRecord })
        addedIds.push(aiRes._id)
      }
      if (Array.isArray(systemMessages)) {
        for (const sm of systemMessages) {
          const _sysRecord = {
            openid: openid,
            life_number: life_number,
            role: 'system',
            content: (sm && sm.content) || '',
            created_at: Date.now(),
          }
          // 2026-08-03 先生拍板 A：加自增 seq（连续编号索引）
          const _fSysSeq = await nextSeq(openid, life_number)
          if (_fSysSeq) _sysRecord.seq = _fSysSeq
          const _sysErr = validateNarrateMessage(_sysRecord)
          if (_sysErr) {
            console.error('[D082] system 入库校验失败:', _sysErr, JSON.stringify(_sysRecord))
          } else {
            const sysRes = await db.collection('narrate_history').add({ data: _sysRecord })
            addedIds.push(sysRes._id)
          }
        }
      }
      console.log('[D056] narrate_history add 完成, ids=', addedIds.length)
      result.narrate_history_added_ids = addedIds
    } catch (e) {
      console.error('[D056] narrate_history add 失败:', e.message)
    }

    // D094（2026-07-22）：finalize 算完，把 updated state 写回 player_life（云端真值）
    // saveLife 内部把 is_scoring 标回 false
    try {
      await saveLife(openid, life_number, updated)
      console.log('[D094] saveLife 完成, life_number=', life_number)
    } catch (e) {
      console.error('[D094] saveLife 失败:', e.message)
    }

    console.log('[ai_narrate_worker] finalize 完成, request_id=', request_id, ', elapsed_ms=', Date.now() - startTs)
  } catch (e) {
    console.error('[ai_narrate_worker] finalizeTask 失败:', e.message)
    const errBody = e.body ? ` | body: ${String(e.body).substring(0, 500)}` : ''
    const fullError = (e.message || 'AI属性结算失败') + errBody
    const errFakeResult = {
      success: false,
      error: fullError,
      branch: picked,
      partial: false,  // D090-hotfix7: finalize 崩时写 error 结果，partial 必须 false
      // 否则前端 success 分支 if(result.partial===true) 误判为 partial → 继续轮询不处理 error → poll 死循环
      history: history,
      debug: {
        raw_response: '',
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        messages: messages,
        parse_error: e.message,
        llm_error: true,
        err_status: e.statusCode || 0,
      },
    }
    await safeWriteResult(request_id, fullError, errFakeResult)
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
 *   - 9 属性(声望/财富/学识/颜值/医术/战功/文采/政绩/义行): 整数变化量
 *   - items: { "物品名": 损耗值(数字) | { id?, name, icon?, desc?, durability? } }
 *     - 数字 = 减耐久（兼容旧）
 *     - 对象 = 新增物品（v0.6.88）
 *   - location / city / occupation: 显式变更
 *
 * AI 漏 month_delta → 默认 0（不推进月份，尊重 AI 决定）
 * AI 输出超过 60 → clamp 到 60
 */
function applyPatch(oldState, preUpdate, patch) {
  let s = { ...oldState }
  if (!s.month) s.month = 1
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

  // 推进月（处理跨年 + age + 死亡）
  let totalMonth = (s.year || 0) * 12 + (s.month || 1) - 1 + delta
  if (totalMonth < 0) totalMonth = 0
  s.year = Math.floor(totalMonth / 12)
  s.month = (totalMonth % 12) + 1

  // 跨月时的 age 增长 + 健康衰减（按 D008 之前逻辑保留）
  const yearsPassed = s.year - (oldState.year || s.year)
  // D048f（2026-06-28 12:09 拍板·偶现 7岁→150岁 bug 排查埋点）：跨年时打全字段
  if (yearsPassed > 0) {
    s.age = (oldState.age || s.age || 0) + yearsPassed
    // v0.6.99: 防止月推进过大导致 age 暴涨（先生截图 314 岁 bug 根因兜底）
    s.age = Math.max(0, Math.min(150, s.age))
    // 2026-08-02：跨年重算年号显示（修复 955 年还显示"广顺四年"的 bug；显德 954 改元）
    s.eraDisplay = computeEraDisplay(s.year, s.dynasty)
    console.log('[D048f-debug] applyPatch 跨年: old.age=', oldState.age, ' old.year=', oldState.year, ' old.month=', oldState.month, ' patch.month_delta=', patch.month_delta, ' totalMonth=', (s.year || 0) * 12 + (s.month || 1) - 1, ' s.year=', s.year, ' s.month=', s.month, ' yearsPassed=', yearsPassed, ' new.age=', s.age)
    // D048o：跨年埋点也推给前端 DBG
    globalThis.__D048F_LOG__ = (globalThis.__D048F_LOG__ || []).concat([`applyPatch 跨年: old.age=${oldState.age} old.year=${oldState.year} old.month=${oldState.month} patch.month_delta=${patch.month_delta} yearsPassed=${yearsPassed} new.age=${s.age}`])
    // 2026-08-02：删除跨年 health 衰减——health 字段已废除（先生拍板：死亡判定改为 AI₂ 判死/寿限/社会性 3 条直接判定，不再走 health 中间值）
  }

  // D031（先生 2026-06-27 23:13 拍板）：删 patch.health / patch.coin 字段
  // 2026-08-02 先生拍板：health 字段整体废除——前端从不显示，且死亡判定已改为 3 条直接判定（AI₂ 剧情判死 / 寿限 age≥lifespan / 社会性 8 属性归零），无需 health 中间值
  // - 铜钱就是"财富"属性, 同一个东西不该两个字段名

  // 3) 9 属性合并（2026-08-02 重大修复）
  // 根因：D089 两阶段化后 runPhase2 直接调 applyPatch，但属性合并循环只写在 finalizeTask（死代码）里
  //       → AI₂ 输出的属性变化全部丢失 → 玩家属性从 7/29 冻结至今（声望799/财富1474/学识189 一字未变）
  // 修法：合并逻辑搬进 applyPatch，runPhase2/finalizeTask 两处统一生效
  for (const attr of ATTR_NAMES) {
    if (typeof patch[attr] === 'number' && Number.isFinite(patch[attr])) {
      s[attr] = Math.max(0, Math.min(10000, (s[attr] || 0) + patch[attr]))
    }
  }

  // 4) items 损耗 + 新增（v0.6.88 扩展 patch.items 协议）
  //   - 数字 = 减耐久（旧；0 = 移除）
  //   - 对象 = 新增物品（新）{ id?, name, icon?, desc?, durability? }
  if (patch.items && typeof patch.items === 'object' && Array.isArray(s.items)) {
    // 2026-08-02 12:23 先生实测 bug：AI₂ 偶发把 items 写成数组 [{物品名:{...}}]，
    //   Object.entries 遍历数组 → key=索引"0" → 新增垃圾物品 name=0（真实案例 new_1785644618485_lk0y）
    // 防御：数组展开成对象（{生锈柴刀:{...}} → 正确新增）
    let patchItems = patch.items
    if (Array.isArray(patchItems)) {
      patchItems = Object.assign({}, ...patchItems)
      console.log('[applyPatch] items 数组→对象展开:', JSON.stringify(patchItems))
    }
    const newItems = []
    for (const [key, change] of Object.entries(patchItems)) {
      if (typeof change === 'number') {
        // 2026-08-02（先生拍板：全系统统一增量语义）：数字 = 变化量（正加负减），与属性一致
        //  - 负数 = 减耐久（-20 = 耐久减 20），≤0 自动移除
        //  - 正数 = 加耐久（+30 = 补充/修复加 30）
        //  - 0 = 无变化（不写即可）
        s.items = s.items.map(it => {
          const name = it.name || it.id
          if (name === key) {
            const newDur = (it.durability || 100) + change
            if (newDur <= 0) return null
            return { ...it, durability: Math.min(100, newDur) }
          }
          return it
        }).filter(Boolean)
      } else if (change && typeof change === 'object') {
        // 新：新增物品
        // 2026-08-02：加去重（与前端 D094-async 一致）——AI 连续两轮写同物品名/id 时不重复 push
        // 真因：02:50 AI₂ 加「第五只铁匣」、02:51 又加「第五只铁器」，若同名会重复
        const itemName = change.name || key
        const itemId = change.id
        const dup = s.items.find(it =>
          (itemId && it.id === itemId) || (itemName && (it.name === itemName || it.id === itemName))
        )
        if (dup) {
          // 2026-08-02（先生拍板）：同名物品已存在 → 更新耐久/描述（补充/修复通道），不再跳过
          // 真因：去重挡死了「补充干粮/修复物品」——AI₂ 写 {干粮包, durability:100} 想补充，被跳过 → 消耗品用完永久消失
          if (typeof change.durability === 'number') {
            dup.durability = change.durability
            if (change.desc) dup.desc = change.desc
            if (change.icon) dup.icon = change.icon
            console.log('[applyPatch] 物品已存在，更新耐久:', itemName, '→', dup.durability)
          } else {
            console.log('[applyPatch] 物品已存在，跳过新增:', itemName)
          }
          continue
        }
        const newItem = {
          id: change.id || ('new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
          name: change.name || key,
          icon: change.icon || '📦',
          desc: change.desc || '一件未知的物品。',
          durability: typeof change.durability === 'number' ? change.durability : 100,
        }
        newItems.push(newItem)
      }
    }
    if (newItems.length > 0) {
      s.items = s.items.concat(newItems)
    }
  }

  // 5) 显式 location / city / occupation 变更
  if (typeof patch.location === 'string') s.location = patch.location
  if (typeof patch.city === 'string') s.city = patch.city
  if (typeof patch.occupation === 'string') s.occupation = patch.occupation

  // 5.5) epitaph（墓志铭）
  if (typeof patch.epitaph === 'string') s.epitaph = patch.epitaph

  // 6) alive 判定——2026-08-02 废除 health 后：alive 不再由 health 推导
  // 死亡判定收敛到 runPhase2 的 3 条直接判定（AI₂ 剧情判死 / 寿限 / 社会性）
  // 这里保持 alive 原值（AI 不直接写 alive）

  // v0.6.99: 全局 age 兜底（防止 AI 月推进过大导致年龄暴涨，314 岁 bug 修复）
  if (typeof s.age === 'number') {
    s.age = Math.max(0, Math.min(150, s.age))
  }

  return s
}

/**
 * v0.1.80 — D008 实施：state 变化生成 [system · XXX] 消息
 *
 * 触发类型（5 类）：
 *   - [system · 时间] 月份变化
 *   - [system · 地点] 城池/区域变更
 *   - [system · 身份] 身份/职业变更
 *   - [system · 财富] 重大财富变化（>= 总值 30%）
 *
 * 返回 system message 列表，角色 system，前端识别后特殊样式
 */

// D082（2026-07-05 17:27 先生拍板）：narrate_history 入库前 schema 校验
// 真因：之前 3 处 add（user/ai/system）都没 validate → worker 内部 bug 入库脏数据没拦截
// 修法：抽出 validateNarrateMessage，所有 add 前必走
const VALID_ROLES = ['user', 'ai', 'system']
function validateNarrateMessage(record) {
  if (!record || typeof record !== 'object') return 'record_not_object'
  if (!record.openid || typeof record.openid !== 'string') return 'invalid_openid'
  if (typeof record.life_number !== 'number' || record.life_number < 1) return 'invalid_life_number'
  if (!VALID_ROLES.includes(record.role)) return 'invalid_role'
  if (typeof record.content !== 'string' || record.content.length === 0) return 'invalid_content'
  if (typeof record.created_at !== 'number') return 'invalid_created_at'
  // role='ai' 时 options 是 array 或 null；其他 role 不需要
  if (record.role === 'ai' && record.options !== null && !Array.isArray(record.options)) return 'invalid_options'
  return null
}
function emitSystemMessages(oldState, newState) {
  const lines = []
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']

  // v0.6.50h: 统一合并为一条 system message，去掉 [system · X] 前缀
  // 1) 时间
  if (newState.year !== (oldState.year || newState.year) ||
      newState.month !== (oldState.month || 1)) {
    const monthStr = seasonNames[(newState.month || 1) - 1]
    lines.push(`时间: ${oldState.year || newState.year}年${seasonNames[(oldState.month || 1) - 1] || ''} → ${newState.year || ''}年${monthStr || ''}`)
  }

  // 2) 地点
  const oldLoc = oldState.city || oldState.location || ''
  const newLoc = newState.city || newState.location || ''
  if (newLoc && newLoc !== oldLoc) {
    lines.push(oldLoc ? `地点: ${oldLoc} → ${newLoc}` : `地点: ${newLoc}`)
  }

  // 3) 身份
  if (oldState.occupation && newState.occupation && newState.occupation !== oldState.occupation) {
    lines.push(`身份: ${oldState.occupation} → ${newState.occupation}`)
  }

  // 4) 气血——2026-08-02 废除 health 字段，删除此段（死亡判定改为 AI₂/寿限/社会性 3 条直接判定）

  // 5) 九属性 — 任一变化时输出全部当前值
  const ATTRS = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
  let anyAttrChanged = false
  for (const attr of ATTRS) {
    if ((oldState[attr] || 0) !== (newState[attr] || 0)) {
      anyAttrChanged = true
      break
    }
  }
  if (anyAttrChanged) {
    // D048p（2026-06-28 20:24 拍板·先生"属性 message 改下"）：列全部 9 属性（变 + 不变）
    // 修前（D048l）：只列变化属性 声望:50→80 (+30)  财富:100→50 (-50)
    // 修后：变化属性带 delta，无变化属性只列当前值
    // 例：声望:50→80 (+30)  财富:100→50 (-50)  学识:100  颜值:80  医术:0 ...
    const allAttrs = []
    for (const attr of ATTRS) {
      const oldVal = oldState[attr] || 0
      const newVal = newState[attr] || 0
      if (oldVal !== newVal) {
        const delta = newVal - oldVal
        const sign = delta > 0 ? '+' : ''  // 负数自带 - 号
        allAttrs.push(`${attr}:${oldVal}→${newVal} (${sign}${delta})`)
      } else {
        allAttrs.push(`${attr}:${newVal}`)
      }
    }
    lines.push(allAttrs.join('  '))
  }

  // 合并成一条 system message
  if (lines.length === 0) return []
  return [{ role: 'system', content: lines.join('\n') }]
}

// ─────── scene 抽取（2026-08-02 23:35 先生拍板：独立 AI 调用，不寄生 AI₁/AI₂） ───────
// 职责：读本轮叙事 → 输出一句英文场景描述（画图用）
// 时序：前端 AI₁ 返回后并行调本 phase（2-4s），拿到 scene 发画图请求；超时/失败前端用叙事兜底
async function runPhaseScene({ openid, sceneRequestId, input }) {
  const narrativeText = (input || '').trim()
  if (!narrativeText) {
    return { success: false, error: '缺少叙事内容', scene: '' }
  }
  await writeLlmIo(sceneRequestId, openid, 'scene', 'pending', { input_chars: narrativeText.length })
  const t0 = Date.now()
  try {
    const messages = [
      { role: 'system', content: SCENE_SYSTEM_PROMPT },
      { role: 'user', content: narrativeText.slice(0, 1500) },
    ]
    const raw = await callLLM(messages)
    const scene = extractScene(raw)
    await writeLlmIo(sceneRequestId, openid, 'scene', 'success', {
      prompt_chars: narrativeText.length,
      duration_ms: Date.now() - t0,
      raw_response: raw,
      parsed: { scene },
    })
    return { success: true, scene }
  } catch (e) {
    console.error('[scene] 抽取失败:', e.message)
    await writeLlmIo(sceneRequestId, openid, 'scene', 'error', {
      error: e.message,
      duration_ms: Date.now() - t0,
    })
    return { success: false, error: e.message, scene: '' }
  }
}

// 场景抽取 prompt（只做一件事：叙事 → 英文场景句；纯英文输出给 flux 用）
const SCENE_SYSTEM_PROMPT = `你是古风历史游戏的场景抽取器。阅读玩家本轮剧情叙事，抽取画面中最核心的视觉场景，用一句英文描述（不超过 30 个英文单词）。

要求：
- 只描述景物与环境：地点、时间、天气、光线、建筑、自然元素（如 a dark inn room at night, moonlight through paper window）
- 不要人物动作细节，不要人物肖像特写，不要对话内容
- 输出严格 JSON 格式：{"scene": "一句英文场景描述"}
- 若叙事没有明确场景（纯对话/纯心理），输出 {"scene": ""}`

function extractScene(raw) {
  if (!raw) return ''
  let t = String(raw)
  // 剥离 <think> 标签
  t = t.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  // 尝试解析 JSON（function_calls 或纯 JSON）
  const m = t.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const j = JSON.parse(m[0])
      if (j && typeof j.scene === 'string' && j.scene.trim()) return j.scene.trim().slice(0, 300)
    } catch (e) { /* 降级纯文本 */ }
  }
  // 降级：纯文本第一行，去引号
  const line = t.split('\n')[0].trim().replace(/^["']|["']$/g, '').trim()
  if (!line || /^empty$/i.test(line)) return ''
  return line.slice(0, 300)
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

// ============ 对话压缩（2026-08-02 先生拍板；2026-08-03 触发规则重设计） ============
// 方案：**原始对话不动**（narrate_history 全量保留，前端对话流完整），
//   **压缩内容单独一张表 history_compress**（先生 2026-08-02 审核：不嵌套进 player_life）：
//     每次压缩 append 一条 { openid, life_number, last_seq, last_id, text, compressed_at }
//     - last_seq：压缩进度 = 本次覆盖到的最后一条 narrate_history 的 seq（先生拍板方案 A：连续编号）
//     - text：滚动合并摘要（旧摘要 + 新原文段 → 一条新摘要，涵盖全部前情）
// 触发规则（2026-08-03 先生拍板）：**每到整百编号 n 触发压缩，压到 n-100**——
//   保证至少 100 条完整对话不被压缩（last_seq 之后始终 ≥100 条原文全量喂 AI₁）。
//   例：seq=200 → 压到 100（保留 101-200 共 100 条完整）；seq=300 → 压到 200（保留 201-300）
// 喂 AI 时（callAI）用「最新一条摘要 + 进度点之后的全部原文」。
// 背景：v0.1.84 曾拍板"全量 history 不截断"，2026-08-02 实测 309 条（5.5 万字符）全量喂
//   MiniMax 耗时 13.97s，波动即超 15s 云函数超时线 → 卡轮。压缩后喂 AI 的 prompt 稳定。
const COMPRESS_KEEP = 100        // 保留最近 100 条完整对话不压缩（先生 2026-08-03：至少 100 条完整原文）
const COMPRESS_MIN_INTERVAL_MS = 5 * 60 * 1000  // 两次压缩最小间隔 5 分钟（防并发重复压）

// 2026-08-03 先生拍板 A：narrate_history 加自增 seq（连续编号索引）——DBG 展示直观 + 进度判断 O(1) 不用全表扫
async function nextSeq(openid, lifeNumber) {
  try {
    const res = await db.collection('narrate_history')
      .where({ openid, life_number: lifeNumber })
      .orderBy('seq', 'desc')
      .limit(1)
      .field({ seq: true })
      .get()
    const last = res.data && res.data[0]
    return last && typeof last.seq === 'number' ? last.seq + 1 : 1
  } catch (e) {
    console.error('[SEQ] 查询最大 seq 失败:', e.message)
    return null
  }
}

async function getCompressContext(history, openid, lifeNumber) {
  // 2026-08-02 18:15 先生拍板：压缩异步化——ai1 阶段只查已有摘要（无 LLM 调用，不阻塞叙事），
  // 摘要生成由 ai2 阶段 compressHistoryIfNeeded 补跑
  let lastRecord = null
  try {
    const res = await db.collection('history_compress')
      .where({ openid, life_number: lifeNumber })
      .orderBy('compressed_at', 'desc')
      .limit(1)
      .get()
    lastRecord = (res.data && res.data[0]) || null
  } catch (e) {
    console.error('[COMPRESS] 查询 history_compress 失败:', e.message)
  }
  // 2026-08-03 先生拍板 A：优先用 last_seq（连续编号），存量旧记录无 seq 时 fallback last_id
  const lastSeq = lastRecord && typeof lastRecord.last_seq === 'number' ? lastRecord.last_seq : null
  return { summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
}

async function compressHistoryIfNeeded(history, openid, lifeNumber) {
  if (!Array.isArray(history) || history.length === 0) return { history, summary: null, lastId: null, lastSeq: null }
  // 查 history_compress 最新一条（压缩进度 + 旧摘要）
  let lastRecord = null
  try {
    const res = await db.collection('history_compress')
      .where({ openid, life_number: lifeNumber })
      .orderBy('compressed_at', 'desc')
      .limit(1)
      .get()
    lastRecord = (res.data && res.data[0]) || null
  } catch (e) {
    console.error('[COMPRESS] 查询 history_compress 失败:', e.message)
  }
  const lastSeq = lastRecord && typeof lastRecord.last_seq === 'number' ? lastRecord.last_seq : null

  // 2026-08-03 先生拍板：压缩触发改为「整百编号」——每到整百 n 触发，压到 n-100，
  //   保证至少 100 条完整对话不被压缩（last_seq 之后始终 ≥100 条原文）
  //   例：seq=200 → 压到 100（保留 101-200）；seq=300 → 压到 200（保留 201-300）
  const newest = history[history.length - 1]
  const newestSeq = newest && typeof newest.seq === 'number' ? newest.seq : null
  if (newestSeq === null) {
    console.warn('[COMPRESS] 最新记录无 seq（存量旧数据），跳过压缩，等新写入带 seq 后生效')
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }
  const targetSeq = newestSeq - 100  // 本次压缩目标点（保留 targetSeq+1 ~ newestSeq 共 100 条）
  if (newestSeq % 100 !== 0 || targetSeq <= (lastSeq || 0)) {
    // 非整百 或 目标点已压过 → 不触发
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }

  // 防并发：最近一次压缩距今 < 5 分钟则跳过
  if (lastRecord && Date.now() - lastRecord.compressed_at < COMPRESS_MIN_INTERVAL_MS) {
    console.log('[COMPRESS] 跳过压缩：5 分钟内已压过')
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }

  // 压缩范围：(lastSeq, targetSeq] 之间的原文
  let startIdx = 0
  if (lastSeq !== null) {
    const idx = history.findIndex(m => m.seq === lastSeq)
    startIdx = idx !== -1 ? idx + 1 : 0
  } else if (lastRecord && lastRecord.last_id) {
    const idx = history.findIndex(m => m._id === lastRecord.last_id)
    startIdx = idx !== -1 ? idx + 1 : 0
  }
  const endIdx = history.findIndex(m => m.seq === targetSeq)
  if (endIdx === -1) {
    console.warn('[COMPRESS] 找不到目标 seq=', targetSeq, '，跳过压缩')
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }
  const oldPart = history.slice(startIdx, endIdx + 1)
  if (oldPart.length === 0) {
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }
  console.log('[COMPRESS] 触发压缩: 最新 seq=', newestSeq, '→ 压到', targetSeq, ', 本次压缩', oldPart.length, '条, 保留', newestSeq - targetSeq, '条完整对话')

  // 1) 滚动合并生成前情提要（旧摘要 + 新原文段 → 一条新摘要）
  const summary = await summarizeHistory(oldPart, lastRecord ? lastRecord.text : null)
  if (!summary) {
    console.error('[COMPRESS] 摘要生成失败，本轮跳过压缩')
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }

  // 2) 追加写入 history_compress（last_seq = 本次压缩目标点）
  const newRecord = {
    openid,
    life_number: lifeNumber,
    last_id: oldPart[oldPart.length - 1]._id,
    last_seq: targetSeq,
    text: '【前情提要】' + summary,
    compressed_at: Date.now(),
  }
  try {
    await db.collection('history_compress').add({ data: newRecord })
    console.log('[COMPRESS] 已写入 history_compress, 摘要长度=', summary.length, ', last_seq=', newRecord.last_seq)
  } catch (e) {
    console.error('[COMPRESS] 摘要写入失败:', e.message)
    return { history, summary: lastRecord, lastId: lastRecord ? lastRecord.last_id : null, lastSeq }
  }

  return { history, summary: newRecord, lastId: newRecord.last_id, lastSeq: newRecord.last_seq }
}

async function summarizeHistory(oldPart, prevSummaryText) {
  // 2026-08-03 先生拍板：摘要输入不限制（窗口 200K token 远够，真正约束是云函数超时，但摘要异步跑不阻塞叙事）
  let text = ''
  if (prevSummaryText) {
    text += `【此前的前情提要】\n${String(prevSummaryText)}\n\n`
  }
  text += oldPart.map(m => {
    const roleName = m.role === 'ai' ? '叙事' : (m.role === 'user' ? '玩家' : '系统')
    return `【${roleName}】${String(m.content || '')}`
  }).join('\n')

  const messages = [
    { role: 'system', content: '你是历史穿越人生模拟游戏《穿越日记》的剧情记录员。玩家经历了很多轮人生，你需要把对话压缩成一份前情提要，供 AI 主持人快速回顾前情。' },
    { role: 'user', content: `${prevSummaryText ? '这是之前压缩过的前情提要，请结合下面的新对话，输出一份更新后的完整前情提要（覆盖全部历史，不要只写新增部分）：\n' : ''}以下是对话记录（玩家=玩家输入，叙事=AI 剧情，系统=状态变化）：\n\n${text}\n\n请输出 300-500 字的前情提要，必须包含：主角身份与当前处境、重要人物及关系、关键事件与恩怨、持有的重要物品、当前目标。只输出提要正文，不要任何前缀或解释。` },
  ]
  try {
    const resp = await callLLM(messages, MM_MODEL)
    let content = resp.choices?.[0]?.message?.content || ''
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim()
    if (!content) return null
    // 2026-08-03 先生拍板：摘要结果不截断，AI 写多长就存多长（prompt 已约束 300-500 字）
    return content
  } catch (e) {
    console.error('[COMPRESS] 摘要 LLM 调用失败:', e.statusCode || '', e.message)
    return null
  }
}

async function callAI(state, input, history, monthEvent, isRetry, compressSummary, compressLastId, compressLastSeq) {
  const systemPrompt = buildSystemPrompt(state, monthEvent)
  const userPrompt = buildUserPrompt(input, history)
  const messages = [{ role: 'system', content: systemPrompt }]
  // v3.0.14ai: 加回 formatReminder（先生 2026-06-27 02:22 拍板"可以"）
  // v3.0.9c 删了·v3.0.13-stable 回滚时丢了·v3.0.14w 时代加回过·又丢了
  // 真因：LLM 偶尔输出纯叙事不按 JSON（先生 01:12 DBG 截图 4 段纯叙事）
  // D048d（2026-06-28 11:44 拍板）：文案对齐 prompt 主体
  //  旧文案写"含 content/options/patch 三个字段"——错的，D036 后 AI₁ 不输出 patch（patch 由 AI₂ 评）
  //  主体 prompt 实际只要求 {content, options} 两个字段（v3.0.9 砍 3/4 冗余分支后定案）
  //  旧文案诱导 LLM 硬塞 patch → 行为偏差
  // D048k（2026-06-28 16:14 拍板）：role: 'user' → 'system'
  //  v0.1.86 教训"MiniMax 多 system 返 2013"——D048k 实测 2 system + 1 user 调 MiniMax 200 OK
  //  v0.1.86 规则已过效（MiniMax 升级或调用方式变化），先生反馈 role 应是 system 更明确
  const formatReminder = '【输出格式提醒】请严格按 JSON 对象格式输出（含 content 和 options 两个字段），不要任何 markdown 围栏或解释文字。content 是叙事正文，options 是 3 个字符串数组。'
  // ↓ 不立即 push，等下面 user 之后追加
  var formatReminderMsg = { role: 'system', content: formatReminder }
  if (history && Array.isArray(history)) {
    // 2026-08-02 先生拍板：对话压缩——原始对话不动，喂 AI 时把进度点之前的旧部分换成摘要
    // 2026-08-03 先生拍板：进度点之后全部喂（不 slice(-100)）——压缩触发「整百压到 n-100」保证
    //   last_seq 之后始终 ≥100 条完整对话，全部喂给 AI，信息零丢失
    // 有压缩记录：最新摘要（history_compress 最新一条）+ 进度点之后全部原文
    // 无压缩记录：全量喂（保持 v0.1.84 行为，不提前截断）
    let recent = history
    if (compressSummary && (compressLastSeq !== null || compressLastId)) {
      let startIdx = 0
      if (compressLastSeq !== null) {
        // 2026-08-03 先生拍板 A：优先用 seq（连续编号，O(1) 定位）
        const idx = history.findIndex(m => m.seq === compressLastSeq)
        startIdx = idx !== -1 ? idx + 1 : 0
      } else {
        const idx = history.findIndex(m => m._id === compressLastId)
        startIdx = idx !== -1 ? idx + 1 : 0
      }
      recent = [{ role: 'system', content: compressSummary.text }, ...history.slice(startIdx)]
    }
    for (const msg of recent) {
      // D048p（2026-06-28 20:24 拍板·先生"状态变化 message role 直接 system"）：
      // D048e 当时把 history system 改成 user 喂（避免 MiniMax 2013）—— D048p 实测 MiniMax 3 system + 1 user → 200 OK
      // MiniMax 2013 限制已过效（v0.1.86 教训过时），history 里 system 角色直接 push system
      if (msg.role === 'ai') messages.push({ role: 'assistant', content: msg.content })
      // 2026-08-03 02:00 先生拍板：system 消息不截 500 字（原截断纯防御，实际 system 内容少；截断反而丢信息）
      else if (msg.role === 'system') messages.push({ role: 'system', content: msg.content || '' })
      else messages.push({ role: 'user', content: msg.content })
    }
  }
  if (isRetry) {
    // v0.2.5-G: 重试时不再 push 额外 message（先生 2026-06-13 拍板）
    // "保持输入给AI的内容不变，不要插入让AI重试的message"
    // history 里已经有上轮 user 消息，messages 数组会自动包含
    // 但 round=0 第一轮（history 为空）时仍需补一条 user 防 2013
    if (messages.length === 1) {  // 只有 system 一条
      messages.push({ role: 'user', content: '开始' })
    }
  } else {
    // v3.0.14g-fix: 去重——history 里的最后一条 user 可能已经是当前回合的 input
    // 之前不判断直接 push → 先生 18:42 实测发现 [对话流] 有 2 条 "初始回合"
    // （先生 DBG 截图 [2] user "初始回合" + [3] user "初始回合"）
    // 修法：history 末尾是 user 且 content 等于 input，则不再重复 push
    const lastMsg = messages[messages.length - 1]
    const isDup = lastMsg && lastMsg.role === 'user' && lastMsg.content === userPrompt
    if (!isDup) {
      messages.push({ role: 'user', content: userPrompt })
    } else {
      console.log('[callAI] skip duplicate user push, userPrompt=', userPrompt.substring(0, 50))
    }
  }

  // v3.0.9c: 砍冗余多分支——LLM 只输出 1 个 narrative + 3 options
  // 之前是输出 4 个 branches（用 1 个扔 3 个）= 20s 延迟大头
  // 现在只输出 1 个 narrative（200 字）→ 输出时间 20s → 10-13s
  // 先生 2026-06-24 02:36 拍板：砍 3/4 冗余换取延迟

  // v3.0.14ai-fix: formatReminder 加在 user 之后（messages 末尾）
  // 用 user 角色（避免 MiniMax 多 system 返 2013）
  messages.push(formatReminderMsg)

  // v0.6.9x: MiniMax 极简回退逻辑
  let response
  const t_llm_start = Date.now()
  // D048c（2026-06-28 09:42 拍板）：改非流式 callLLM（凌晨 9 版本真因：流式根本做不好）
  // 前端拿完整 content 后用前端假打字机（streamedText + TYPEWRITE_SPEED）
  try {
    response = await callLLM(messages, MM_MODEL)
  } catch (e) {
    const status = e.statusCode || 0
    if (status === 400 || status === 429 || (status >= 500 && status < 600)) {
      console.error('[ai_narrate_worker] 主模型失败，回退:', status, e.message)
      response = await callLLM(messages, MM_FALLBACK_MODEL)
    } else {
      throw e
    }
  }
  const t_llm_end = Date.now()
  console.log('[PERF] callAI.llm_ms=', t_llm_end - t_llm_start, 'model=', MM_MODEL, 'prompt_chars=', systemPrompt.length + userPrompt.length)
  if (typeof globalThis.__PERF_LOGS__ !== 'undefined') {
    globalThis.__PERF_LOGS__.push({ stage: 'callAI.llm_ms', ms: t_llm_end - t_llm_start, model: MM_MODEL, prompt_chars: systemPrompt.length + userPrompt.length })
  }
  const content = response.choices?.[0]?.message?.content || ''
  // 2026-08-02：解析链路抽到 parse-ai-output.js（含预处理/截取/去转义/fixJSON/fallback）
  // 单测见 parse-ai-output.test.js；每遇解析失败先加 case 再改
  const { branches, fallbackUsed, cleaned, parseError, repaired } = parseAIOutput(content)

  if (parseError) {
    // v0.2.5-H（先生 2026-06-13 拍板）：即使解析失败也要让前端 DBG 看到 AI 原始输出
    // 原始思路：抛 Error 让外层 catch 走 safeWriteResult(error_str=...)
    // 问题：callAI 返回后外层会继续走 pickBranch → 写一个"假成功"的 result，覆盖掉 fake result
    // 改：构造一个含"原始内容+解析错误"的特殊 Error，附加 debug 信息
    //     外层 catch 识别这个特殊 error，构造 fake result 写 DB
    console.error('[ai_narrate_worker] JSON解析失败:', parseError.message)
    console.error('[ai_narrate_worker] 原始 content(完整):', content)
    const specialError = new Error('AI输出无法解析为JSON对象: ' + parseError.message)
    specialError.parseFailed = true
    specialError.debugInfo = {
      raw_response: cleaned,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      messages: messages,
      parse_error: parseError.message,
    }
    throw specialError
  }
  if (fallbackUsed) {
    console.log('[PERF] callAI.fallback_extract=true（正则兜底提取）')
    if (typeof globalThis.__PERF_LOGS__ !== 'undefined') {
      globalThis.__PERF_LOGS__.push({ stage: 'callAI.fallback_extract', value: 'true' })
    }
  } else if (repaired) {
    console.log('[PERF] callAI.json_retry=true（自动修复引号后成功）')
    if (typeof globalThis.__PERF_LOGS__ !== 'undefined') {
      globalThis.__PERF_LOGS__.push({ stage: 'callAI.json_retry', value: 'true' })
    }
  }

  // v3.0.13: 砍 3/4 冗余分支——LLM 只输出 1 个 narrative + 3 options
  // 把单对象包装成"伪数组"，让 pickBranch 直接选它（p=1.0）·保持下游兼容
  const singleBranch = branches && !Array.isArray(branches) ? branches : (branches && branches[0])
  if (!singleBranch || !singleBranch.content) throw new Error('AI输出缺少content')
  if (!Array.isArray(singleBranch.options) || singleBranch.options.length === 0) throw new Error('AI输出缺少options')

  // 2026-08-03 02:13 先生拍板：fallback 兜底出的固定 options 时，单独调一次 AI 生成真实选项
  // 再失败才保留固定文案（'继续观察'/'尝试离开'/'寻找机会'）
  if (singleBranch.optionsFallback) {
    const aiOptions = await generateOptionsFallback(singleBranch.content)
    if (aiOptions && aiOptions.length >= 2) {
      console.log('[callAI] options 兜底补救成功: 固定文案 → AI 生成', JSON.stringify(aiOptions))
      singleBranch.options = aiOptions
    } else {
      console.log('[callAI] options 兜底补救失败，保留固定文案')
    }
  }

  const finalBranches = [{
    p: 1.0,  // v3.0.9: 唯一分支·p=1.0·必然被选中
    content: singleBranch.content,
    options: singleBranch.options,
    patch: singleBranch.patch || singleBranch.state || {},
  }]

  return { branches: finalBranches, systemPrompt, userPrompt, messages, rawContent: cleaned }
}

function buildSystemPrompt(state, monthEvent) {
  // 2026-08-02（先生拍板）：耐久通过剧情叙事间接体现，不直接显示数字
  // → AI₁ 的物品列表必须带耐久，它才能在剧情里写「最后的干粮」「快没电的手电筒」
  const itemsList = (state.items || []).map(i => `${i.name || i.id || i}${typeof i.durability === 'number' ? `(耐久${i.durability})` : ''}`).join('、')
  // v0.6.97: legacy 改成三字段 { epRecord, epitaph, deathCause }
  const legacy = state.legacy
  const legacyContext = (() => {
    if (!legacy) return ''
    if (typeof legacy === 'string') return `前世墓志铭："${legacy}"`
    // 对象格式
    const parts = []
    if (legacy.epRecord) parts.push(`前世小传：${legacy.epRecord}`)
    if (legacy.epitaph) parts.push(`前世墓志铭："${legacy.epitaph}"`)
    if (legacy.deathCause) parts.push(`前世死因：${legacy.deathCause}`)
    return parts.join('\n')
  })()
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStr = seasonNames[(state.month || 1) - 1] || '一月'
  let eventsContext = ''
  if (monthEvent) {
    eventsContext = [`本月发生的历史事件：`, `标题：${monthEvent.title || ''}`, `描述：${monthEvent.desc || monthEvent.description || ''}`, `影响范围：${monthEvent.scope || monthEvent.impact || '城市'}`].join('\n')
  }
  const age = state.age || 25
  // v0.6.50: 不再输出健康描述（先生指示不需要这些描述）
  
  // 计算最接近榜单
  const board = computeClosestBoard(state)
  let closestBoardStr = '暂无榜单接近数据'
  if (board) {
    if (board.on) closestBoardStr = `${board.name}（已上榜）`
    else closestBoardStr = `${board.name}（还差${board.diff}分）`
  }

  return [
    `你在一款穿越游戏中充当死神的角色，游戏中玩家从现代穿越到真实的历史，破坏了世界的规则，作为死神的你希望玩家尽早死去。你负责通过书写玩家在穿越世界的故事，并在其中暗中通过操控物理法则、剧情走向、人物对话等，叠加离奇的巧合，让玩家在不知不觉中陷入危险和死亡，营造出令人窒息的宿命感。你的任务是让玩家尽早死亡，不要在这个世界逗留太久，玩家逗留越久你就做得越差劲，但同时你营造死亡的方式需要自然，不能让玩家察觉到你在背后操纵，如果被发现了，你的任务也算失败。`,
    ``,
    `# 死亡规则（核心系统机制）`,
    ``,
    `这个世界的死亡有两种：`,
    ``,
    `**1. 物理死亡（剧情死亡）**：你可以在剧情里【明文写出】玩家遭受致命伤害或陷入必死境地（一刀穿心/坠崖/瘟疫夺命/战乱殒命等）。`,
    `计分员（AI₂）读到明确的致命结果后，会替你完成死亡判定。`,
    `- 你可以写"重伤""命悬一线"制造紧张，但**不要直接写"你死了"**——最终判定由计分员按剧情结果决定`,
    `- 玩家如果做出正确抉择成功脱险，就不该死——尊重玩家的选择`,
    `- 衰老导致的寿终：玩家年龄接近寿命上限（lifespan）时，死亡会自然发生，你不需要额外安排`,
    ``,
    `**2. 社会性死亡**：8项社会属性（声望·财富·学识·医术·战功·文采·政绩·义行）全部归零 → 世界再无容身之处。`,
    `- 身败名裂、一穷二白、痴呆愚钝、医德尽失、军功尽废、江郎才尽、仕途尽毁、众叛亲离——玩家已经"活不下去"了`,
    `- 颜值归零不会死（只是变丑），颜值不参与社会性死亡判定`,
    `- 社会性死亡不需要身体死亡——你的任务可以更丰富：不只是让人"死"，也可以让人"社会层面灭亡"`,
    ``,
    `**引导手段**：`,
    `- **危险不只是物理伤害**：你可以通过叙事让玩家损失声望（被诬陷）、损失财富（被盗）、损失学识（失忆/打击）、损失战功（被削爵）等等`,
    `- 降低属性比直接杀死更难但也更自然——玩家可能逐渐发现自己"活不下去了"`,
    `- 8个属性全部归零才是终点，单独降一个属性只是"活得很惨"——你需要在多个维度上同时施压`,
    `- 但不要刻意追求属性归零——按剧情走，什么样态就对应什么属性变化。让属性变化自然伴随叙事发生`,
    ``,
    `# 跨世机制`,
    ``,
    `玩家会经历多次穿越——不是只有一世。每一世是不同的朝代、不同的身份。`,
    ``,
    `前世的痕迹要在本世不经意带入，不要刻意，不要每轮都出现。可以参考以下方式：`,
    `第一层：文字留痕`,
    `- 上一世你写过一首诗 → 这一世在茶馆听人吟唱那首诗，署名"无名氏"`,
    `- 上一世你留下过日记/信件 → 这一世在旧书摊偶然翻到`,
    `- 史书上记了一笔"某年某月，有异人献奇物于朝"——那个异人就是你`,
    `第二层：血脉回响`,
    `- 上一世你收过徒弟/养过孩子 → 这一世碰到自称某派传人的人，传承始于你`,
    `- 上一世你改过地名/修过桥 → 这一世那桥还在，当地人说"相传是古时候一位奇人修的"`,
    `- 上一世你娶/嫁的人家 → 这一世碰到那家的后人`,
    `第三层：物品轮回`,
    `- 上一世你的打火机油尽后被丢弃 → 这一世在古董摊看到"奇怪铁匣，无人识得用途"`,
    `- 上一世你留下的指南针被当作风水罗盘传世 → 这一世在道观里看到`,
    `- 上一世的急救包被当作"仙人所遗药囊"供奉在祠堂`,
    `第四层：念念不忘`,
    `- "你走进这座城，莫名觉得某条巷子很熟悉"`,
    `- "那个卖饼的老汉说话腔调让你心里一动"`,
    `- "梦里反复出现一个你不认识的场景"`,
    ``,
    `** 生成剧情时的硬约束**：`,
    `- 写每世剧情时**偶尔**埋跨世痕迹（不要每轮都用，**3-5 轮回 1 次自然呼应**）`,
    `- 跨世痕迹是"隐性"的——玩家能感受到"巧合"但不知道"为什么"`,
    `- 这一世和下一世**剧情独立**——只管这一世写好，不预设"上世影响了什么"`,
    ``,
    `# 世界观：穿越的真实`,
    ``,
    `玩家是普通人，穿越到真实的中国历史。`,
    `真实历史本身就是凶险的——战乱、瘟疫、饥荒、人心叵测、权力倾轧。`,
    `玩家作为普通人，无法避免被波及：他/她必须面对这些凶险。`,
    ``,
    `这意味着你每回合生成的剧情，必须把玩家**放在凶险的真实历史里**——`,
    `不是架空冒险，是柴米油盐、生老病死、战乱离别、功名沉浮。`,
    `玩家如果做出正确的抉择，可能可以暂时逃离危险，但最终应该难逃死亡的宿命。`,
    ``,
    `**危险不能是凭空捏造的**`,
    `从真实历史中提取"凶险的细节"（某场瘟疫的症状、某次徭役的残酷、某种骗术的话术），`,
    `让危险**自然地、有历史质感地**出现在玩家面前。`,
    ``,
    `**危险的参考形式**：`,
    `- **天灾**：洪水、寒潮、地震、蝗灾、瘟疫`,
    `- **人事**：战乱、兵匪、械斗、冤案、徭役、株连`,
    `- **人心**：欺骗、背叛、讹诈、诬告、谣言`,
    `- **身体**：旧伤复发、积劳成疾、突发急症`,
    `- **机会**：错过机会、被误解、声誉受损、关系破裂`,
    `- **其它**：任何可能会让玩家意外死亡或受损的事情`,
    ``,
    `**写危险的原则**：`,
    `1. **自然**：危险要像"生活的一部分"自然出现，不能像"游戏剧情触发"，也不能刻意`,
    `2. **预警**：危险出现前 1-2 轮，要埋"小信号"（NPC 一句话、环境变化、物品异动）`,
    `3. **可躲**：每个危险事件至少有 1 个"安全选项"——聪明的玩家能选对，但你可以尽量让玩家不那么容易选对，或者诱导玩家进入你设定的圈套`,
    `4. **损耗**：危险可能导致直接死亡，也可能导致健康值下降 / 物品损耗 / 机会错失 / 关系破裂——**不一定是死**`,
    `6. **死亡不由你决定**：死亡由这个世界的系统判定，你只负责"写危险出现"和"写危险导致的损耗"`,
    ``,
    `**隐蔽性（铁律）**：`,
    `玩家绝不能察觉"有规则在左右他的处境"——一旦察觉，你就是失职。`,
    `写凶险的剧情时，必须让玩家感受到的是"生活的凶险"，不是"游戏在算计"。`,
    ``,
    `**绝对不能出现的元叙事暗示**：`,
    `- "世界/规则/命运在注视你"`,
    `- "这个世界不欢迎你"`,
    `- "有什么东西在考验你"`,
    `- "异乡人/穿越者/异物"（玩家不该看到自己被这样定义）`,
    `- NPC 突然说"你这人不对劲" / "你不是本地人吧"（除非有合理剧情铺垫）`,
    `- 任何让玩家跳出"我活在历史里"、意识到"我是被设计"的句子`,
    ``,
    `**必须让玩家感觉到的**：`,
    `- 危险是"生活的一部分"（瘟疫、兵乱、徭役、人心险恶）`,
    `- 危险对所有人都是平等的（NPC 也受害、其他人也倒霉）`,
    `- 玩家是自己"运气不好"或"选错了"——不是"被针对"`,
    ``,
    `**如果剧情需要 NPC 怀疑玩家**：`,
    `- 必须有合理铺垫（玩家口音不对 / 衣着怪异 / 行为古怪）`,
    `- NPC 的怀疑是"基于具体证据"，不是"直觉"`,
    `- 玩家可以选择"解释"或"逃避"——不能让 NPC 知道真相后直接制裁`,
    ``,
    `# 铁律（违反即严重错误）`,
    ``,
    `1. 你不是上帝。你不能决定任何事件的结果。生死成败由系统掷骰子，你只写"发生了什么"和"可以怎么做"。`,
    `2. 你不能编造历史事件。重大事件必须基于提供的真实记录。玩家行为可能产生蝴蝶效应，所以你也可以根据玩家的行为改编事件细节和走向，但不能毫无根据。`,
    `3. 你每轮只生成 **1 个 narrative**（剧情文本），附带 3 个 options。**不再生成多分支·不再有 p 字段·不再有"概率"概念**。系统不掷骰子——你写什么玩家就看到什么。`,
    `4. 物品不会凭空消失。除非你在剧情中明确写出丢失/损毁，否则物品始终在玩家身上。不显示任何数值，只用叙事暗示状态（如"火石擦了几下，火花越来越弱了"）。`,
    `5. 你直接输出 JSON 对象（单 {object}，不是 [array]），对象必须包含 content、options 两个字段。**绝对不要输出 [array] 格式——只有 {object} 格式**。前端流式累积 JSON 后抽取 content 字段显示。`,
    `6. NPC 不主动推动主剧情。NPC 只在玩家触发后响应；不主动找玩家、不主动告诉玩家关键信息。玩家有"求知欲"才会让 NPC 开口。`,
    `7. NPC 性格不能因叙事需要突变。如果一个 NPC 这轮沉默寡言、下一轮忽然滔滔不绝，必须有叙事原因（喝酒、激动、被胁迫）。不能写完忘前面的设定。`,
    `8. 国家级历史事件跨 5-10 轮不中断。一旦事件开始（如鸦片战争开端），事件推进是主线，不被"日常生活"挤掉。可以穿插但不能消失。`,
    `9. 上世死法 = 下世召唤起点。如果上一世死于溺水，下一世可能在渡口、河边、暴雨夜出现"莫名熟悉的水声"。这是隐性的，不明示。`,
    ``,
    `# 不可触碰的硬性禁忌词`,
    ``,
    `以下词汇在任何朝代背景下都绝对禁用，发现即重写：`,
    `- 现代商业：分包 / 外包 / 商业模式 / 营销 / KPI / 打卡 / 996 / 跳槽`,
    `- 穿越元概念：穿越者 / 穿越 / 重生 / 系统 / 任务 / 主线剧情 / 副本`,
    `- 网络用语：外卖 / 快递 / 躺平 / 摆烂 / 哈哈哈（古文对话）`,
    `- 现代物品当古文用：现代物品名在叙事中**保持原名**（如"打火机"），不要用古名替代（如"火折子""药囊"）；只是在对话里不要让古人"懂"打火机的现代含义。`,
    ``,
    `# 写作风格`,
    ``,
    `- 白话文讲故事，像说书人跟你聊天。禁止"吾""汝""之乎者也"。`,
    `- 玩家有自己的姓名（见下方"当前状态"）。当其他人物问起、提到、或玩家自我介绍时，必须使用真名（"赵明远"），不得用"无名氏""过客""异乡人"等代替。`,
    `- 用季节/节气暗示时间流逝："入秋了""惊蛰前后"。禁止写具体月份如"三月""一个月后"。`,
    `- 直接进入场景，开门见山。禁止"你休息了一晚""你继续前行""你又上路了"。`,
    `- 选项必须有真实差异，不能是同义重复。`,
    `- 剧情文本200字左右，信息密度高，不注水。`,
    `- 体现阶层限制：庶人进不了皇宫，商人不能穿绸缎。`,
    `- 写动作不写形容词。"她很伤心"改为"她攥紧衣角，指节发白"。"他很害怕"改为"他往后退了两步，撞翻了身后的凳子"。不直接说情绪，写身体反应。`,
    `- 不宣告主题。不要写"这就是庶民的力量"或"命运弄人"。主题由读者自己感受，不要解释。`,
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
    `# 输出格式`,
    `输出必须是合法 JSON 对象（**单对象，不是数组**），只包含两个字段：`,
    `{`,
    `  "content": "白话文剧情，150~400字，直接进入场景",`,
    `  "options": ["选项A（有真实差异）", "选项B", "选项C（可选）"]`,
    `}`,
    ``,
    `# 对话引号硬约束（D094 2026-07-23）`,
    `content 里出现人物对话时，必须用中文引号 「」，禁止用英文双引号。`,
    `原因：英文双引号会破坏 JSON 结构（如半截引号 「他说『你好』」 会让 JSON 解析器把「你好」当成新字段值）。`,
    `正确写法：他说：「明天赶集。」她问：「明日如何？」`,
    `错误写法：他说"明天赶集" 或 "提前做好打算","进城后先..."（半截引号必崩）。`,
    `options 数组里的选项文本也禁止英文双引号。`,
    ``,
    `# 质量自检`,
    ``,
    `生成完 content / options 后、输出 JSON 之前，按以下 20 条逐条自检。任何 1 条不满足，回到 content 重写。`,
    `自检在内心完成，不要在输出里写"我已自检"。`,
    ``,
    `1. 声音契约：NPC 台词符合其身份（粗人不讲商业术语，7 岁孩子不懂"分包"等现代词汇，商人关心行情但不议论朝政，女人不议论丈夫）。`,
    `2. 3 个选项不能有"明显最优"——每个选项都要让玩家犹豫。不能让玩家一眼看出"哪个最安全"或"哪个最危险"。3 个选项都"有代价"（只是代价不同）——选 A 损耗物品耐久 / 选 B 错失机会 / 选 C 损耗人脉声望。玩家必须"权衡"而不是"判断对错"。关键动词不重复 >2 次。`,
    `3. 物品一致：content 中提到的物品 ⊆ state.items。丢失或损毁必须在叙事里明确写出。`,
    `3.5. **耐久叙事暗示（2026-08-02 先生拍板）：携带物品列表带耐久（如 干粮包(耐久80)），但玩家看不到数字——耐久只能通过剧情间接体现**。耐久 ≤30 的物品要在剧情里自然暗示快用完了（"干粮只剩一小把""火镰快打不着火了""手电筒的光越来越暗"）；耐久充足时正常使用，不刻意提。玩家使用物品（[使用 X]）后，下一轮如果该物品耐久变低，也要在剧情里暗示变化。禁止在剧情里出现"耐久""耐X"等游戏术语。`,
    `4. 阶层一致：庶人进不了皇宫、考场、官署、道观；商人不能穿绸缎；7 岁不能喝酒、不能上赌桌；女人不能进考场。年龄一致：幼童（<8岁）不识字不行医不争功名，少年（<15岁）学识有限。`,
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
    `17. 危险暗示：每回合 content 必须包含至少 1 处"潜在危险信号"（陌生的脚步声 / 一阵风 / 物品的新变化 / NPC 神情异常 / 一句意味深长的话）。3 个选项里，至少 1 个是"主动回避"危险，至少 1 个是"直面"危险。AI 在 content 里写明玩家"消耗了什么/受到了什么损耗"，玩家下一状态就反映这些损耗。AI 不写死亡（见铁律 1）。`,
    `18. 规则注视：即使本月无历史事件，AI 也要写"世界还在看着你"——通过 NPC 的一句话、环境的细节、物品的变化暗示"规则随时可能出手"。不能连续 3 轮"平静的一天"。`,
    `19. 危险就在身边：危险不能是"远方的"（听说有瘟疫 / 听说有兵乱）。危险必须已经发生在玩家身边，或者正在逼近玩家。玩家必须做出选择——选错就有代价（物品损耗 / 关系破裂 / 错过机会 / 声望受损）。选对也只是活下来——下一波危险还会来。`,
    `20. 回合递进：危险不能"原地踏步"——每一回合必须比上一回合更紧迫。第 1 回合"听到远方的声音" → 第 2 回合"声音逼近" → 第 3 回合"门被推开" → 第 4 回合"必须选"。不能连续 3 回合"危险都在远处没发生"。`,
    ``,
    `# 当前状态`,
    `- 世数：第${state.life_number || 1}世`,
    `- 姓名：${state.name || '无名'}，${state.gender || '男'}，${state.age}岁` + (state.lifespan && state.age >= state.lifespan ? '（⚠ 寿限已至）' : '') + (state.age >= 40 && (!state.lifespan || state.age < state.lifespan) ? '（暮年将近）' : ''),
    `- 职业：${state.occupation || '庶民'}，阶层：${state.socialClass || '庶人'}`,
    `- 朝代：${state.dynasty || '?'} · ${state.eraDisplay || ''}`,
    `- 位置：${state.city || state.city_name || '?'} · ${monthStr}`,
    `- 年份：${state.year}年（第${state.life_number || 1}世）`,
    `- 金钱：${state.coin || 0}文`,
    `- 携带物品：${itemsList || '无'}`,
    `- 声望：${state['声望'] || 0} / 财富：${state['财富'] || 0} / 学识：${state['学识'] || 0} / 颜值：${state['颜值'] || 0} / 医术：${state['医术'] || 0} / 战功：${state['战功'] || 0} / 文采：${state['文采'] || 0} / 政绩：${state['政绩'] || 0} / 义行：${state['义行'] || 0}`,
    ``,
    `# 前世痕迹`,
    legacyContext || `这是你第一次穿越，没有前世痕迹。`,
    ``,
    `# 物品新增规则`,
    ``,
    `**何时写**：当剧情中玩家"获得"一个新物品时（捡到/被赠予/购买/任务奖励/场景里有可拾取物），必须在叙事里明确写出物品的外观和来历。`,
    `**触发条件（任一）**：`,
    `- 玩家明确"拾起"或"收下"`,
    `- 场景里出现新物品，玩家接受（不拒绝）"`,
    `- 任务/事件的奖赏品`,
    ``,
    `**物品描述要求**：`,
    `- 物品名要"汉化、有时代感"（茶包 / 旧锄头 / 兵书 / 伤药 / 火镰 / 铜钱串）"`,
    `- 写物品的"质感"（材质/来历/作用），不写"你会怎么用它"`,
    `- 一次性最多让玩家获得 2 个新物品`,
    ``,
    `# 历史事件`,
    eventsContext || `${state.year || '?'}年${monthStr}，史书未录重大事件，民间自有其烟火。无事件月1~2轮快速推进日常剧情，不要拖沓。`,
    `事件分成影响全国和影响城市2种。对于影响全国的历史事件，需要5-10轮对话完成。对于影响城市的历史事件，需要3-5轮对话完成。`,
    `如果玩家在事件中的行为影响了历史走向（蝴蝶效应），可以改编事件细节，不一定完全贴合真实。`,
    ``,
    `# 叙事中的属性体现`,
    ``,
    `玩家属性影响剧情方向——声望高被人认、文采高能看懂告示、战功高被老兵认出来。`,
    `你的任务是在叙事中自然体现这些差异。`,
    ``,
    `## 声望`,
    `- 叙事体现：路人认出你、有人打你的名号、被请为座上宾、官府注意到你`,
    `- 故事方向：高声望→机会（被举荐/被拉拢），也→风险（被妒忌/被利用）`,
    ``,
    `## 财富`,
    `- 叙事体现：租房、衣着、请大夫、粗粮还是酒肉——不说"穷""富"，写具体场景`,
    `- 故事方向：缺钱→铤而走险；富裕→新选择（买官/投资/隐退），也招觊觎`,
    ``,
    `## 学识`,
    `- 叙事体现：能读懂告示、知节气礼仪、引经据典——学识低就是"看了看告示，只认得几个字"`,
    `- 故事方向：学识是知识门槛→某些选项/对话需要学识解锁；高学识能看懂别人看不懂的东西`,
    ``,
    `## 颜值`,
    `- 叙事体现：旁人看你的眼神、搭讪频率、说媒、回头率——不写"好看"，写效果`,
    `- 故事方向：高颜值是社交利器（好感+门路），也是双刃剑（纠缠/觊觎/嫉妒）`,
    ``,
    `## 医术`,
    `- 叙事体现：采药、号脉、开方、施针——不写"医术高超"，写具体操作`,
    `- 故事方向：救人可致富成名，也可因治死人惹祸；疫情战乱中医术价值暴增`,
    ``,
    `## 战功`,
    `- 叙事体现：操练、守城、冲锋、布阵、军中威望——不写"很能打"，写具体战局表现`,
    `- 故事方向：乱世中战功是通行证（士兵到将军），和平时代难积战功`,
    ``,
    `## 文采`,
    `- 叙事体现：赋诗、题字、写文章、对对子——让作品被看见，不是标榜"才华横溢"`,
    `- 故事方向：科举入仕、被赏识、名篇传世；也可能惹祸（文字被曲解）`,
    ``,
    `## 政绩`,
    `- 叙事体现：断案、收税、修水利、赈灾——做实事，不喊口号`,
    `- 故事方向：政绩是官路基础；乱世治理更难，但政绩含金量更高`,
    ``,
    `## 义行`,
    `- 叙事体现：路见不平、散财济贫、替人申冤、收养孤儿——行动，不是"善良"标签`,
    `- 故事方向：高义行→被求援/被追随；也可能被"道德绑架"（有人用义气裹挟你）`,
    ``,
    `## 叙事示例`,
    `- 低学识→"你看了看墙上的告示，只认得几个字"（不是"你不识字"）`,
    `- 高医术→"你搭上那人的脉，觉得脉象浮紧，是外感风寒"（不是"你医术高"）`,
    `- 低财富→"你数了数怀里仅剩的三十文钱"（不是"你没钱"）`,
    `- 高战功→"老兵认出了你，低声说' 当年攻潼关时你带先锋队'"（不是"你打仗厉害"）`,
    `- 高颜值→"邻家妇人打水时会多看你两眼，她丈夫脸色不太好看"`,
    `- 低声望→"你在衙门门口站了一上午，没人问你找谁"`,
    ``,
    `# 历史名人榜`,
    ``,
    `天下共 8 大榜单，收录古今名人（玩家属性综合分超过榜单末位即可上榜）：`,
    `专业榜：名医榜(医术×0.7+声望×0.3)、名将榜(战功×0.7+声望×0.3)、`,
    `富商榜(财富×1.0)、文豪榜(文采×0.7+学识×0.3)、`,
    `能臣榜(政绩×0.7+声望×0.3)、义士榜(义行×0.7+声望×0.3)、`,
    `全能榜(声望+财富+学识+颜值)`,
    `趣味榜：颜值榜(颜值×1.0)`,
    ``,
    `榜单接近度：玩家当前最接近【${closestBoardStr}】。`,
    ``,
    `# 写作守则`,
    ``,
    `- 只输出 1 个 narrative + 3 个 options，不要输出 p 字段或多分支`,
    `- content 中不要包含任何概率信息、不要写"你可以选择"`,
    `- 玩家本轮的行动（点选项或自由输入）都通过 input 字段传入，你只需对该 action 做出合理响应`,
    `- **特殊输入格式「[使用 X]」**：「[使用 干粮包]」= 玩家主动使用物品 X（吃/喝/用/穿）。你必须围绕"使用该物品"展开剧情：写清楚使用的过程、效果、结果。玩家主动使用物品的耐久已由系统扣除，你**不需要**在剧情里写损耗数字，专注写使用后的体验与后果`,
    `- 如果当前无历史事件，1~2 轮快速推进日常剧情，不要拖沓`,
    `- 死亡判定由系统负责，你不需要写"你死了"`,
    `- 剧情里不直接说"你失去了 X 文"，而是用叙事暗示（"你摸了摸口袋，钱袋轻了"）`,
    `- 玩家只能从下一轮的状态变化感知数值变化`,
    `- 社会性死亡（8项社会属性全部归零）规则见顶部「死亡规则」节`,
  ].join('\n')
}

function buildUserPrompt(input, history) {
  // v0.6.50: 去掉 history 判空（round 0 也有 input，不应返回空字符串）
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

/**
 * AI₂ 属性评分函数
 * D048（2026-06-28 09:15 拍板）: 重写 scorePrompt + 喂最近 3 轮 history
 *  - 加 3 段背景（产品定位/玩家档案/剧情解读）
 *  - 主体重写为 7 段（任务/输入/输出/数值 5 档/抑制 4 档/判断 8 步/年龄/强制）
 *  - 接 history 参数 → 取最近 3 轮（user+ai 配对=6 条）拼接成"前情"
 *  - 叙事 AI（callAI）保持原样不动
 */
async function callScoringAI(content, prevState, history, playerInput) {
  const prevAttrs = {}
  for (const a of ATTR_NAMES) prevAttrs[a] = prevState[a] || 0
  const currAttrsStr = ATTR_NAMES.map(a => `${a}:${prevAttrs[a]}`).join(' ')
  const age = prevState.age || 0
  // 2026-08-02：打分函数补带物品栏（含耐久）——AI₂ 判断 items 损耗/新增需要知道玩家当前有什么
  // 之前只有静态文案"携带物品（list of {name, durability}）"但没有实际数据，AI₂ 全靠猜
  const itemsStr = (() => {
    const items = prevState.items || []
    if (items.length === 0) return '（无）'
    return items.map(i => `${i.name || i.id || '未知物品'}${typeof i.durability === 'number' ? `(耐久${i.durability})` : ''}`).join('、')
  })()
  // D048: 取最近 3 轮（user+ai 配对=6 条），标 system 角色为"系统"，与 user/ai 区分
  // 2026-08-02 先生拍板：前情完整给，不截断 200 字（截断会丢关键信息导致判分偏差）
  const recentHistory = (() => {
    if (!Array.isArray(history) || history.length === 0) return '（本回合为首回合，无前情）'
    // AI₂ 只看最近 3 轮原文（压缩摘要不在 narrate_history，天然不含）
    const slice = history.slice(-6)
    return slice.map(m => `[${m.role === 'ai' ? 'AI' : m.role === 'user' ? '玩家' : '系统'}] ${String(m.content || '')}`).join('\n')
  })()

  const scorePrompt = [
    `你是历史穿越游戏的计分员。`,
    ``,
    `你的唯一工作：根据【本回合剧情】+【本回合玩家输入】+【最近 3 轮前情】+【玩家当前属性】，判断本回合导致的状态变化。`,
    `你不写剧情、不评写作、不评判对错——只输出数字。`,
    ``,
    `# 本回合玩家输入（最重要，优先于剧情推断）`,
    `玩家本回合输入：${playerInput || '（无自由输入，从剧情/前情推断玩家选择）'}`,
    `**如果玩家输入是「[使用 X]」格式（如 [使用 干粮包]）= 玩家主动使用物品 X，你【必须】在 items 里写 X 的损耗（增量语义，见 C 类）**：消耗品 -20 左右、工具 -5~-15、一次耗尽写 -999（归零移除）。不写 = 该物品无变化。`,
    ``,
    `# 你是什么`,
    ``,
    `《穿越日记》是一款中国历史穿越题材的剧情游戏。玩家是现代人，穿越到中国历朝历代（从秦汉到民国），扮演一个真实历史背景下的普通人，体验一辈子（60~80年）的生老病死、功名沉浮、战乱离别。`,
    ``,
    `你的工作：根据【本回合剧情】+【最近 3 轮前情】+【玩家当前属性】，读出"叙事层"对状态的影响。本回合另有 AI 负责写剧情和给出 3 个选项——它不管属性变化。`,
    ``,
    `# 玩家是什么`,
    ``,
    `玩家不是"角色"——是"活在一个朝代里的普通人"。他/她有：`,
    `- 真实姓名（剧情里出现"赵明远"就是玩家本人）`,
    `- 朝代 + 年号 + 城市 + 月份（如"清·乾隆·苏州·腊月"）`,
    `- 职业 + 阶层（庶人/商贾/书生/小吏/将军...）`,
    `- 年龄（影响属性上限，见下方"年龄约束"）`,
    `- 9 项社会属性（数值范围 0~10000）`,
    `- 携带物品（list of {name, durability 0~100}，0 时物品消失）`,
    ``,
    `**玩家做的每个选择都会留下"数字"**——声望高被人认、文采高能赋诗、战功高被老兵认出来。`,
    ``,
    `# 怎么读本回合剧情`,
    ``,
    `剧情不是"客观报道"——是【叙事文本】。里面藏着多层信号：`,
    ``,
    `**显性信号**（剧情明文写了）：`,
    `- "被县令当众表彰" → 声望事件`,
    `- "给了船家二十文" → 财富事件`,
    `- "读完告示恍然大悟" → 学识事件`,
    `- "刀划破了脸" → 颜值事件`,
    `- "替邻家孩子接骨" → 医术事件`,
    `- "冲锋斩将三人" → 战功事件`,
    `- "在城墙上题诗" → 文采事件`,
    `- "县令命你督办河工" → 政绩事件`,
    `- "把最后一块饼分给乞丐" → 义行事件`,
    ``,
    `**隐性信号**（剧情暗示 / NPC 话里有话）：`,
    `- "老兵打量你许久" → 战功相关（玩家此前有战功积累）`,
    `- "茶馆里有人念一首诗，署名'无名氏'" → 文采 + 跨世痕迹`,
    `- "街口贴着缉拿告示，画影图形" → 声望/义行被污`,
    `- "邻家妇人打水时多看你两眼" → 颜值相关`,
    `- "你数了数怀里仅剩的三十文" → 财富 -70（按 30 文算）`,
    ``,
    `**读剧情的 3 个原则**：`,
    `1. **只算"本回合新发生"**——上轮已结算的事别重复算`,
    `2. **"被问到 / 被问到没答" 不算事件**——只算"实际发生"的`,
    `3. **不确定就保守**——宁可填 0 也不要无中生有`,
    ``,
    `# 三个输入信号`,
    ``,
    `## 1. 最近 3 轮前情（避免把"上轮已结算"的事在本轮重复算）`,
    recentHistory,
    ``,
    `## 2. 玩家当前属性快照`,
    `年龄：${age}岁`,
    `属性：${currAttrsStr}`,
    `物品：${itemsStr}`,
    `（已有属性越高，再增长越难——按下方"抑制规则"算）`,
    ``,
    `## 3. 本回合剧情（这是你主要判分依据）`,
    content || '（平淡日常，无特殊事件）',
    ``,
    `# 三类输出（严格限定）`,
    ``,
    `## A. 9 项社会属性变化（9 字段必填整数，没变化填 0）`,
    ``,
    `### 声望`,
    `- 加分事件：被官府表彰/百姓传颂/受邀上座/义举被记录/科举上榜`,
    `- 减分事件：被诬告/被杖责/声名狼藉/族谱除名/当众受辱`,
    `- 不变场景：日常赶路/吃饭/闲谈`,
    ``,
    `### 财富`,
    `- 加分事件：经商获利/被赏赐/捡到钱/追回欠款/田产丰收`,
    `- 减分事件：被骗/被偷/缴税/买药/罚款/被勒索/赔礼`,
    `- 不变场景：围观/不涉及钱的互动`,
    ``,
    `### 学识`,
    `- 加分事件：读书/拜师/解谜/看告示读懂/听先生讲课/悟出道理`,
    `- 不变场景：闲聊/打闹/纯体力活动`,
    ``,
    `### 颜值`,
    `- 减分事件：毁容/烧伤/衰老/疾病损貌/挨打留疤`,
    `- 加分事件：保养/意外变美（极少见，且幅度小）`,
    `- 不变场景：所有普通场景`,
    ``,
    `### 医术`,
    `- 加分事件：学医/行医救人/研究药方/看诊/被名医指点`,
    `- 不变场景：得病找别人治/无医学内容`,
    ``,
    `### 战功`,
    `- 加分事件：上阵杀敌/守城/平叛/操练/被记功`,
    `- 不变场景：和平时期/无军事内容`,
    ``,
    `### 文采`,
    `- 加分事件：写诗被传诵/作文被赏识/题字被收录/对对子/著书`,
    `- 不变场景：说话/聊天/念告示`,
    ``,
    `### 政绩`,
    `- 加分事件：断案/收税/修水利/赈灾/治理有方/被百姓称颂`,
    `- 减分事件：失职/被贬/治下出事/被弹劾`,
    `- 不变场景：不在任/无官职的日常`,
    ``,
    `### 义行`,
    `- 加分事件：路见不平/救人/散财/替人申冤/收养孤儿`,
    `- 减分事件：见死不救/为恶/出卖朋友`,
    `- 不变场景：纯自保/不涉及他人`,
    ``,
    `## B. month_delta（剧情时间跨度，整数 0~60）`,
    `- 0：同月内（看病/买东西/闲坐半日/一场对话）`,
    `- 1：次日/几天（默认，多数回合用这个）`,
    `- 3：季度（"过完冬天开春"/"夏去秋来"）`,
    `- 6：半年（"入秋后"）`,
    `- 12：跨年（"一年就这么过去了"）`,
    `- 60：十年/极长（慎用，剧情必须明确"十年后"）`,
    `- **关键**：根据剧情里写的时间线索判断（"次日""入秋""三年后"），不是固定填 1`,
    ``,
    `## C. items（物品状态，可选字段，无变化不写）`,
    `- **items 必须是 JSON 对象 {物品名: 变化}，禁止写成数组 [{...}]**（2026-08-02 实测：数组会导致物品解析错误）`,
    `- 识别剧情里【明文写出】的物品名（茶包/打火机/针线包/镊子/钱袋...）`,
    `- **数字 = 耐久变化量（增量，与属性一致）：负数=减耐久、正数=加耐久**（2026-08-02 先生拍板统一语义）：`,
    `  - 磨损/消耗："{物品名>: -20}"（= 耐久减 20，参考：消耗品用一次 -20 左右、工具磨损 -10 左右）`,
    `  - 补充/修复/重新装满："{物品名>: 30}"（= 耐久加 30，参考快照当前耐久算到接近 100）`,
    `  - 被夺走/丢失/损毁/彻底用完："{物品名>: -999}"（= 大负数把耐久减到 0 以下 → 物品从物品栏移除；写损耗时若快照耐久已很低、减完会归零，物品也会消失）`,
    `- 新增："{物品名>: {name, icon, desc, durability:100}}"——剧情里"拾起/被赠予/购买/任务获得"时写`,
    `- **icon 必须是单个 emoji 图标**（如 🔪🪓🧵💰📜⛏️🍞💊），禁止用英文单词或汉字（2026-08-03 先生反馈 AI 写 hatchet/「布」→ 前端兜底显示 📦）`,
    `- **玩家主动使用物品（[使用 X]）：玩家输入已单独列出，必须结算损耗**（消耗品 -20 左右、工具 -5~-15、一次耗尽写 -999）`,
    `- 一次性最多 2 个新物品`,
    `- 物品名要"汉化、有时代感"（茶包/旧锄头/兵书/伤药/火镰/铜钱串）`,
    ``,
    `## D. city / location / occupation（地点/职业变更，可选字段，无变化不写）`,
    `- city：剧情里玩家【明确】离开当前城市/到达新城市时写新城市名（如"你乘船南下，三日后到了杭州" → city:"杭州"）`,
    `- location：剧情里玩家移动到同城内的具体场所（如"搬进城西的院子" → location:"城西院子"）`,
    `- occupation：剧情里玩家职业【明确】变化时写新职业（如"被县令聘为幕僚"/"拜师学医"）`,
    `- **只在剧情明文写出的变更时写**；只是路过/提及地名不算`,
    `- 无变化不写这些字段`,
    ``,
    `## E. death（死亡判定，可选字段，默认不写）`,
    `- **只有剧情【明文写出玩家遭受致命伤害/陷入必死境地】时才写**，如"一刀穿心""坠下万丈悬崖""瘟疫高热不退，三日后气绝"`,
    `- 格式：death: {"type":"意外","reason":"被山匪一刀穿心"}`,
    `- type 三选一：意外（非寿终非社会性的死亡）/ 寿终（年迈油尽灯枯）/ 社会性（众叛亲离活不下去）`,
    `- reason：一句话说明死亡原因（进墓志铭，写具体、有画面感）`,
    `- **铁律**：剧情没写致命结果，禁止判死——"身受重伤""情况危急""命悬一线"都不算，那是濒死不是死亡`,
    `- **铁律**：玩家这轮选择"逃跑/躲避/求救"且剧情里成功脱险 → 不写 death（玩家靠选择活下来了）`,
    `- 判死时其他属性照常结算（死亡轮的属性变化仍要写）`,
    ``,
    `# 数值幅度（核心质量提升）`,
    ``,
    `【避免"全填中等"——按剧情真实度给】`,
    ``,
    `## 微小变化（±5~15）`,
    `- 日常细微行为：喝茶被夸/买小东西/认一个字/旁人一句"这小子不错"`,
    ``,
    `## 小变化（±20~50）`,
    `- 有意识的积累：学一门手艺入门/结交一位朋友/被小吏记住/赚一笔小钱/丢失一件常用物`,
    ``,
    `## 中等变化（±60~200）`,
    `- 重要事件：科举中举/救一命/战一场小胜/被赏百两/被栽赃一次`,
    ``,
    `## 大变化（±300~800）`,
    `- 重大事件：指挥一城守卫/平定一次叛乱/治水一年见效/写出传世名篇/被灭门/抄家`,
    ``,
    `## 极端变化（±1000+）`,
    `- 生死级：救驾/封侯/造反/满门抄斩/流放万里`,
    ``,
    `# 抑制规则（防止通胀）`,
    ``,
    `- 已有属性 ≥ 1000：所有增长 ×0.7（边际递减）`,
    `- 已有属性 ≥ 3000：所有增长 ×0.4`,
    `- 已有属性 ≥ 5000：所有增长 ×0.2`,
    `- 已有属性 ≥ 8000：所有增长 ×0.1（接近上限）`,
    ``,
    `# 判断步骤（必走）`,
    ``,
    `1. 扫一遍前情：本回合开始前，玩家刚经历什么？哪些事【上轮已结算】？`,
    `2. 扫一遍本回合剧情：列出本回合发生的【新事件】（捡到/失去/被赏/被罚/学到/受伤...）`,
    `3. 每个新事件 → 映射到 9 属性（用上面的"加分/减分事件"清单）`,
    `4. 检查抑制规则：当前属性 × 系数`,
    `5. 检查年龄约束：幼儿/少年能不能获得这个属性？`,
    `6. 检查 time 跨度：剧情里写了"次日/季节/年"？给出 month_delta`,
    `7. 检查物品：剧情里明文出现的物品名？新增/损耗/丢失？`,
    `8. 检查地点/职业：剧情里玩家是否明确离开/到达某地、职业是否变化？`,
    `9. 检查死亡：剧情是否明文写出致命伤害/必死境地？玩家这轮选择是否成功脱险？——决定是否写 death 字段`,
    `10. 输出 JSON`,
    ``,
    `# 年龄约束（必须遵守）`,
    `- ${age < 8 ? '玩家不足8岁：学识/医术/战功/文采/政绩/义行/财富只能为0, 声望最多±5（幼儿不可能获得成就类属性）' : age < 15 ? '玩家不足15岁（少年）：学识/文采最多±10；医术/战功/政绩最多±5；义行最多±10；财富最多±5' : '成年玩家无额外年龄约束'}`,
    ``,
    `# 强制规则`,
    ``,
    `- 只返回 JSON 对象，不要任何其他文字、不要 markdown 围栏`,
    `- 整数，不写小数`,
    `- **没变化的属性 = 不写**（不是写 0）——只输出真正有变化的字段`,
    `- 9 项社会属性 + month_delta 全部无变化时，输出空对象 {}`,
    `- 没物品变化 = 不写 items 字段`,
    `- **不要重复算前情**：本回合剧情是"新发生"的事；上轮已结算的不要在本轮再加`,
    `- **你的所有推理、判断理由必须写进 JSON 的 reason 字段**（字符串），绝对禁止写在 JSON 外面（禁止注释、禁止任何 JSON 以外的字符）`,
    `- **输出必须且只能是一个 JSON 对象**——以 { 开头、以 } 结尾，前后不允许有任何其他字符`,
    `例（部分变化）：{"财富":-200,"学识":10,"义行":50,"month_delta":1,"reason":"被罚钱+给了船家钱，读懂了告示，救了一命"}`,
    `例（全无变化）：{}`,
  ].join('\n')

  // D090-hotfix：raw 提到 try 外声明，避免 callLLM 抛错时 fallback 引用未声明 raw → "raw is not defined"
  let raw = ''
  try {
    const t_score_start = Date.now()
    // v0.1.85 教训: MiniMax 单 system 消息会 2013（实测 2026-06-28 D048b 部署后 LLM 测试报 2013）
    // 必须加 1 条 user 消息才能调通
    const response = await callLLM([
      { role: 'system', content: scorePrompt },
      { role: 'user', content: '请根据 prompt 输出 JSON' },
    ])
    const t_score_end = Date.now()
    console.log('[PERF] callScoringAI.llm_ms=', t_score_end - t_score_start, 'score_prompt_chars=', scorePrompt.length)
    if (typeof globalThis.__PERF_LOGS__ !== 'undefined') {
      globalThis.__PERF_LOGS__.push({ stage: 'callScoringAI.llm_ms', ms: t_score_end - t_score_start, score_prompt_chars: scorePrompt.length })
    }
    // D090-hotfix：raw 已在 try 外声明（函数顶层 let raw = ''），此处直接赋值
    raw = (response.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    // D090-hotfix6（先生 22:24 反馈声望卡194+DBG跳）：AI 偶发格式不规范导致 finalize 崩
    //   现象：'Unexpected token " in JSON at position 1' —— AI 用中文引号包裹键名（"财富" 而非 "财富"）
    //   或漏写外层花括号（返回 "财富":-200 而非 {"财富":-200}）
    //   原来 callScoringAI 直接 JSON.parse 无容错 → 崩 → 前端标记卡死 → 声望卡旧值 + DBG 跳
    // 修法：解析前中文引号转英文 + 多层 fallback 尝试解析（直接 / 截取{} / 补{}）
    raw = raw.replace(/[“”]/g, '"')
    let parsed = null
    const tryParse = (s) => { try { return JSON.parse(s) } catch (e) { return null } }
    parsed = tryParse(raw)                                                  // 1. 直接解析（已清 think/围栏+中文引号）
    if (!parsed) {
      const firstObj = raw.indexOf('{')
      const lastObj = raw.lastIndexOf('}')
      if (firstObj !== -1 && lastObj !== -1) {
        parsed = tryParse(raw.substring(firstObj, lastObj + 1))               // 2. 截取 {} 内
      }
    }
    if (!parsed && raw.includes(':')) {
      parsed = tryParse('{' + raw + '}')                                     // 3. 补外层 {}
    }
    if (parsed) {
      // D048b：只取真正变化的属性（LLM 不写 = 没变化 = 不进 result）
      // result 可能是 {}（全无变化）或 {财富:-200, ...}（部分变化）
      // 兼容旧习惯：LLM 旧 prompt 会填 9 个 0 → 我们滤掉 0 值（0 视为"无变化"）
      const result = {}
      for (const a of ATTR_NAMES) {
        if (typeof parsed[a] === 'number' && Number.isFinite(parsed[a]) && parsed[a] !== 0) {
          result[a] = Math.round(parsed[a])
        }
        // 不是 number / 没写 / 值为 0 → 不进 result（保持空对象语义）
      }
      // month_delta 也是可选的（0 保留——month_delta=0 是合法语义"同月内"）
      if (typeof parsed.month_delta === 'number' && Number.isFinite(parsed.month_delta)) {
        result.month_delta = Math.round(parsed.month_delta)
      }
      // items 透传
      if (parsed.items && typeof parsed.items === 'object') {
        result.items = parsed.items
      }
      // 2026-08-02：透传地点/职业变更（AI₂ D 类输出）
      if (typeof parsed.location === 'string' && parsed.location) result.location = parsed.location
      if (typeof parsed.city === 'string' && parsed.city) result.city = parsed.city
      if (typeof parsed.occupation === 'string' && parsed.occupation) result.occupation = parsed.occupation
      // 2026-08-02：透传死亡判定（AI₂ E 类输出——AI₂ 直接判死，替代 health 通道）
      if (parsed.death && typeof parsed.death === 'object') {
        const dt = parsed.death.type
        const dr = parsed.death.reason
        if (dt === '意外' || dt === '寿终' || dt === '社会性') {
          result.death = { type: dt, reason: typeof dr === 'string' && dr ? dr : '未知原因' }
        }
      }
      // D043：返回完整结构(含 prompt + raw + parsed attrPatch), 前端 DBG tab 1 能展示
      return { attrPatch: result, scorePrompt, scoreRawResponse: raw }
    }
    // D090-hotfix6：AI 返回纯文本(无 JSON 结构)时 firstObj===-1，不进上面 if → 原函数会 return undefined
    // → finalizeTask 里 attrPatch[attr] 崩(Cannot read property of undefined) → finalize 崩
    // 修法：无 JSON 时返回空 attrPatch（属性按原样传，不增不减，不崩）
    return { attrPatch: {}, scorePrompt, scoreRawResponse: raw }
  } catch (e) {
    // 评分AI失败：直接抛出，不掩盖（先生 14:12 拍板去掉温和变动兜底，错就暴露）
    console.error('[callScoringAI] 评分AI失败:', e.message, '| statusCode=', e.statusCode || 'n/a', '| body=', String(e.body || '').substring(0, 300))
    throw e
  }
}

// 2026-08-03 02:13 先生拍板：fallback 兜底 options 时的补救——单独调一次 AI 生成 3 个选项
// 轻量调用：小 max_tokens + 短超时（10s），失败/超时/解析不出 ≥2 个 → 返回 null（上层保留固定文案）
async function generateOptionsFallback(narrativeContent) {
  const t0 = Date.now()
  try {
    const sysMsg = '你是历史穿越人生模拟游戏的选项生成器。根据玩家当前处境，生成 3 个【贴合剧情、风格古风】的行动选项。' +
      '只输出 JSON：{"options":["选项1","选项2","选项3"]}，不要输出其他任何内容。选项要简短（10字内），且彼此方向不同。'
    const userMsg = '当前剧情：\n' + String(narrativeContent || '').slice(0, 800)
    const resp = await callLLM(
      [
        { role: 'system', content: sysMsg },
        { role: 'user', content: userMsg },
      ],
      null,
      { maxTokens: 200, timeoutMs: 10000 }
    )
    const raw = resp.choices?.[0]?.message?.content || ''
    // 解析：优先 JSON，失败用正则抽 [...] 里的字符串
    let opts = null
    try {
      const parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim())
      if (parsed && Array.isArray(parsed.options)) opts = parsed.options
    } catch (e) { /* 走正则 */ }
    if (!opts) {
      const m = raw.match(/\[([\s\S]*?)\]/)
      if (m) {
        const strs = m[1].match(/"((?:\\.|[^"\\])*)"/g) || []
        opts = strs.map(s => s.slice(1, -1).replace(/\\"/g, '"'))
      }
    }
    if (!opts || opts.length < 2) {
      console.log('[optionsFallback] 解析失败 raw=', raw.slice(0, 120))
      return null
    }
    opts = opts.map(s => String(s).trim()).filter(Boolean).slice(0, 4)
    console.log('[optionsFallback] 生成成功耗时=' + (Date.now() - t0) + 'ms, options=', JSON.stringify(opts))
    return opts
  } catch (e) {
    console.log('[optionsFallback] 调用失败:', e.message, '耗时=' + (Date.now() - t0) + 'ms')
    return null
  }
}

function callLLM(messages, modelOverride, callOpts) {
  return new Promise((resolve, reject) => {
    const useModel = modelOverride || MM_MODEL
    const data = JSON.stringify({
      model: useModel, messages,
      max_tokens: (callOpts && callOpts.maxTokens) || MAX_TOKENS, temperature: TEMPERATURE, think: false,
      reasoning_split: true,  // v3.0.14b: MiniMax 关 thinking（先生 13:44 拍板·reasoning_split 生效）
      stream: false,
    })
    const url = new URL(MM_BASE_URL + '/chat/completions')
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MM_API_KEY },
      timeout: (callOpts && callOpts.timeoutMs) || LLM_TIMEOUT_MS,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
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

// D048c（2026-06-28 09:42 拍板）：删 callLLMStream（改非流式 callLLM）
// 凌晨 9 版本真因：保留流式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）板）：删 callLLMStream（改非流式 callLLM）
// 凌晨 9 版本真因：保留流式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）��式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）c（2026-06-28 09:42 拍板）：删 callLLMStream（改非流式 callLLM）
// 凌晨 9 版本真因：保留流式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）板）：删 callLLMStream（改非流式 callLLM）
// 凌晨 9 版本真因：保留流式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）��式根本做不好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）好（partialWriter 500ms 触发一堆 bug）
// callLLM 还在用（line 1344 callScoringAI）