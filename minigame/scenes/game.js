// Game scene — 穿越后的主游戏场景
// AI 驱动叙事：调用 ai_narrate 云函数 → 显示叙事 + 选项 → 玩家选择 → 循环
// 模式：init() / render(ctx) / onTouch(x,y,type) — 与项目其他场景保持一致

// v0.2.5-H（先生 2026-06-13 10:30 拍板）：三条规则
//   规则 1：重试保持输入给AI的内容不变（worker v0.2.5-G）
//   规则 2：状态变化插入system message → 再插入玩家user message（line 534-543）
//   规则 3：即使出错，DBG也要返回AI原始输出（worker fakeResult + frontend RESPONSE_ERROR 分支填 raw_response）

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, drawCenteredText, drawTextInRect, hitTest, roundRect } = ui

// ─────── 状态 ───────
var state = null
var layout = null
var currentItems = []
var narrative = ''           // 当前显示的叙事文本
var systemLineCount = 0     // v0.1.80 (D008): 当前 narrative 顶部的 system 行数（淡灰色显示）
var displayedChars = 0        // 打字机效果：已显示字符数
var displayStartTime = 0     // 打字开始时间
var options = []             // 当前选项
var optionsAppearTime = 0    // 选项出现时间
var freeInputActive = false  // 自由输入模式
var freeInputText = ''       // 自由输入文本
var loading = false          // AI 调用中
var loadingStart = 0
var loadingText = '史官正在落笔…'  // v0.1.74 (D008): 轮询期间显示等待时长
var errorMsg = ''
var narrativeHistory = []    // {role, content}
var alive = true             // 死亡标记
var fadeOut = null           // 淡出动画
var monthChanged = false     // 月份变化（用于显示特殊提示）
var newEvent = null          // 新事件
var itemDetail = null        // 物品详情浮窗（点击物品后弹出）
var bgImage = null           // 当前背景图（云函数返回 URL）
var bgImageLoading = false   // 是否在加载

// ─────── AI 调试浮窗（v0.1.61）────
var debugLog = []            // 最近 N 轮完整 input/result
var debugOpen = false        // 浮窗展开/折叠
var debugScroll = 0          // 浮窗内滚动偏移
const DEBUG_MAX_ROUNDS = 3   // 保留最近 3 轮
// v0.1.63: 小游戏没有 move 事件，改用 ▲▼ 箭头按钮滚动
var bgImgEl = null           // <image> 元素缓存

// ─── 朝代风格表（先生拍板：每朝代不同风格）───
const STYLE_BY_DYNASTY = {
  '夏':  { style: '商周青铜器纹样',   palette: '青铜绿朱砂',  elements: '祭祀甲骨' },
  '商':  { style: '商周青铜器纹样',   palette: '青铜绿朱砂',  elements: '祭祀甲骨' },
  '周':  { style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '车马礼器' },
  '春秋':{ style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '战车礼器' },
  '战国':{ style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '战车礼器' },
  '秦':  { style: '秦汉画像石',       palette: '黑朱砂',      elements: '兵马俑长城' },
  '汉':  { style: '汉代画像石',       palette: '黑朱砂',      elements: '车马宴乐' },
  '三国':{ style: '工笔重彩',         palette: '绛红金',      elements: '战旗兵器' },
  '晋':  { style: '魏晋山水',         palette: '青绿',        elements: '竹林隐士' },
  '南北朝':{ style: '敦煌壁画',       palette: '石青赭石',    elements: '飞天佛像' },
  '隋':  { style: '初唐工笔',         palette: '金朱砂青绿',  elements: '宫阙仕女' },
  '唐':  { style: '唐代工笔重彩',     palette: '金朱砂青绿',  elements: '仕女宫阙' },
  '五代':{ style: '五代山水',         palette: '水墨青绿',    elements: '山林隐士' },
  '宋':  { style: '宋代山水',         palette: '水墨青绿',    elements: '市井勾栏' },
  '元':  { style: '元代水墨',         palette: '水墨留白',    elements: '草原马' },
  '明':  { style: '明代写意',         palette: '水墨',        elements: '市井园林' },
  '清':  { style: '清代工笔',         palette: '淡彩',        elements: '宫廷市井' },
  '民国':{ style: '老上海水彩',       palette: '灰暖黄',      elements: '洋楼旗袍' },
}

function getStyleForDynasty(dynasty) {
  if (!dynasty) return STYLE_BY_DYNASTY['宋']  // 兜底
  for (const [k, v] of Object.entries(STYLE_BY_DYNASTY)) {
    if (dynasty.includes(k)) return v
  }
  return STYLE_BY_DYNASTY['宋']
}

const TYPEWRITE_SPEED = 25   // 每字符毫秒
const MAX_NARRATIVE_CHARS = 600  // 单次叙事最大字符数

// ─────── 入口 ───────
module.exports = {
  init(items, identity) {
    const id = identity || {}
    items = items || []

    state = {
      life_number: id.life_number || 1,
      name: id.name || '无名',
      gender: id.gender || '男',
      age: id.age || 20,
      occupation: id.occupation || '庶民',
      // P1.4 字段名对齐 generate_identity 实际返回（camelCase）
      socialClass: id.socialClass || id.social_class || '庶人',
      dynasty: id.dynasty || '',
      eraDisplay: id.eraDisplay || id.eraLabel || '',
      city: id.city || id.residence || id.city_name || '某地',  // v0.1.70 多兜底 residence
      year: typeof id.year === 'number' ? id.year : parseInt(id.year) || 0,  // v0.1.70 强制转数字
      month: 1,
      round: 0,
      health: 100,
      coin: 1000,
      items: items.map(i => ({ ...i })),
      legacy: '',
      alive: true,
    }

    currentItems = items
    narrative = ''
    displayedChars = 0
    displayStartTime = 0
    options = []
    optionsAppearTime = 0
    freeInputActive = false
    freeInputText = ''
    loading = false
    errorMsg = ''
    narrativeHistory = []
    alive = true
    fadeOut = null
    monthChanged = false
    newEvent = null
    itemDetail = null

    initLayout()

    // 首次调用 AI
    callAI('初始回合')

    module.exports.autoNext = null
  },

  render,

  onTouch(x, y, type) {
    return handleTouch(x, y, type)
  },

  autoNext: null,
}

// ─────── 初始化布局 ───────
function initLayout() {
  const sys = getSystemInfo()
  const windowWidth = sys.windowWidth
  const windowHeight = sys.windowHeight

  // iOS 灵动岛/刘海安全区
  const safeTop = (sys.safeArea && sys.safeArea.top) || 0
  const topOffset = Math.max(safeTop, 0)

  // v0.1.71 重做：画区按"是否加载完成"动态伸缩
  // 顶栏(52) → 状态栏(26) → 文字面板(自适应 narrative 行数) → 选项(3×40+gap 4+输入 32 = 160) → 物品栏(64)
  const topBarH = 52
  // v0.2.5-J（先生 2026-06-13 11:03 拍板）：状态栏常显，statusBarH 永远生效
  const statusBarH = 26  // 状态条高度（气血/金银/身份/年月）
  // v0.2.5-Q（先生 2026-06-13 15:33 拍板）：自由输入从选项区移到画区右上角图标
  // 选项区只剩 3 个选项，optBlockH 不再算 freeInputH
  const itemBarH = 64
  const optH = 40
  const optGap = 4
  const freeInputH = 30  // 图标尺寸（圆形）
  const optBlockH = 3 * optH + 2 * optGap + 8  // 3 选项 + 间隔（无自由输入）

  // 画区：只在图片加载完成时占 130 高（按宽 3:2）；否则让位给文字
  const sceneW = windowWidth - 14 * 2
  const sceneH = Math.min(130, Math.max(80, Math.floor(sceneW * 2 / 3)))

  // 文字区：根据 narrative 实际行数计算（不再封顶）
  const availableH = windowHeight - topOffset - topBarH - statusBarH - itemBarH
  const lineHeight = 22
  const fontSize = 15
  const maxW = windowWidth - 14 * 2 - 24  // 文字面板内边距
  const narrativeLines = narrative ? Math.ceil(narrative.length * fontSize / maxW) : 4  // 估算行数
  const lines = narrative ? narrative.split('\n') : []
  const realLines = lines.length || narrativeLines
  // 文字面板 = 实际行数 × 行高 + 内边距
  let textH = realLines * lineHeight + 24
  // v0.1.71: 画区是否占位 = 当前是否加载完成且有图
  const sceneVisible = !!bgImgEl && bgImgEl.complete && !loading
  if (sceneVisible) {
    textH = availableH - sceneH - optBlockH - 12
  } else {
    // 文字占满剩余空间
    textH = availableH - optBlockH - 12
  }
  const finalTextH = Math.max(100, textH)

  layout = {
    windowW: windowWidth,
    windowH: windowHeight,
    safeTop: topOffset,
    padding: 14,
    topBarH: topBarH,
    itemBarH: itemBarH,
    sceneY: topOffset + topBarH + 4,
    sceneH: sceneVisible ? sceneH : 0,
    sceneVisible: sceneVisible,
    textY: topOffset + topBarH + statusBarH + 4 + (sceneVisible ? sceneH : 0) + 8,
    statusBarH: statusBarH,  // v0.1.82 (D008 显示)
    textH: finalTextH,
    optionY: topOffset + topBarH + statusBarH + 4 + (sceneVisible ? sceneH : 0) + 8 + finalTextH + 6,
    optionH: optH,
    optionGap: optGap,
    freeInputH: freeInputH,
    itemBarY: windowHeight - itemBarH,
  }
}

// ─────── 调用 ai_narrate 云函数 ───────
// v0.1.74 (D008): 异步轮询方案
// 之前直接调 ai_narrate → 客户端 callFunction 15s 超时 → -504003
// 现在分两步：
//   1. submit（< 2 秒返回 request_id）
//   2. 每 5 秒轮询一次 get_result，直到 done/error
function callAI(userInput) {
  loading = true
  loadingStart = Date.now()
  errorMsg = ''

  const action = (narrativeHistory && narrativeHistory.length > 0) ? 'continue' : 'init'
  const isRetry = userInput === '__retry__'
  // v0.2.5-B（D005 改进）：retry 时云函数收到的 input = 上轮真 input（不是 __retry__ 占位符）
  // narrativeHistory 仍然不入（line 526 判断 isRetry 不 push）—— D005 不污染叙事流的承诺不变
  // 从 narrativeHistory 倒数第一条 user 拿上轮真 input；空时用 userInput 兜底
  let realInput = userInput
  if (isRetry) {
    const lastUserMsg = (narrativeHistory || []).filter(m => m.role === 'user').slice(-1)[0]
    realInput = (lastUserMsg && lastUserMsg.content) || userInput
  }

  const stateData = {
    life_number: state.life_number,
    name: state.name,
    gender: state.gender,
    age: state.age,
    occupation: state.occupation,
    socialClass: state.socialClass,
    dynasty: state.dynasty,
    eraDisplay: state.eraDisplay,
    city: state.city,
    year: state.year,
    month: state.month,
    round: state.round,
    health: state.health,
    coin: state.coin,
    items: state.items.map(i => ({ id: i.id, name: i.name, desc: i.desc })),
    legacy: state.legacy,
    alive: state.alive,
  }

  const data = {
    state: stateData,
    input: realInput,
    is_retry: isRetry,
    history: narrativeHistory.slice(-12),
  }

  // ── 调试：记录完整 input ──
  debugLog.push({
    round: state.round,
    action: action,
    input: userInput,
    data: JSON.parse(JSON.stringify(data)),
    result: null,
    resultError: null,
    ts: Date.now(),
  })
  if (debugLog.length > DEBUG_MAX_ROUNDS) debugLog.shift()

  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) {
    // v0.1.77 终极修复：submit 返回 request_id（< 2s），前端轮询 get_result
    // submit 是 fire-and-forget 触发 worker，前端不能 await submit 等结果
    wx.cloud.callFunction({
      name: 'ai_narrate_submit',
      data,
      success: (res) => {
        const submitResult = (res && res.result) || {}
        if (!submitResult.success || !submitResult.request_id) {
          loading = false
          // v0.2.3: 错误时填齐 debugLog（状态/时间/次数/status/错误信息）
          if (debugLog.length > 0) {
            const last = debugLog[debugLog.length - 1]
            last.resultError = `[SUBMIT_FAIL] status=${submitResult.success ? 'success' : 'fail'}, err=${submitResult.error || '提交失败'}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
          }
          errorMsg = `史官落笔卡壳了——${submitResult.error || '提交失败'}。点此重试。`
          options = [{ label: '重试', key: '__retry__' }]
          optionsAppearTime = Date.now() + 300
          return
        }
        const requestId = submitResult.request_id
        // 开始轮询
        pollNarrateResult(requestId, action, userInput, 0)
      },
      fail: (err) => {
        if (debugLog.length > 0) {
          const last = debugLog[debugLog.length - 1]
          last.resultError = `[SUBMIT_NETWORK_FAIL] ${(err && (err.errMsg || err.message)) || String(err)}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
        }
        loading = false
        errorMsg = '史官落笔卡壳了——网络断了，点此重试。'
        options = [{ label: '重试', key: '__retry__' }]
        optionsAppearTime = Date.now() + 300
      },
    })
  } else {
    loading = false
    errorMsg = '史官落笔卡壳了——云开发不可用，点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
  }
}

// ─────── 轮询 narrate_get_result ───────
// 每 5 秒一次，最多 24 次（120 秒兜底）
// 玩家看到 loading 文案：loadingText = "史官正在落笔…（已等 X 秒）"
function pollNarrateResult(requestId, action, userInput, attempt) {
  const MAX_ATTEMPTS = 48  // 48 × 5 秒 = 240 秒（4 分钟兜底）

  if (attempt >= MAX_ATTEMPTS) {
    loading = false
    // v0.2.3: 超时时填齐 debugLog
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.resultError = `[POLL_TIMEOUT] 超时 ${attempt * 5} 秒（attempt=${attempt}/${MAX_ATTEMPTS}）, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      last.poll_attempts = attempt
    }
    errorMsg = `史官落笔太久没回音（已等 ${attempt * 5} 秒）。点此重试。`
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  setTimeout(() => {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
      loading = false
      // v0.2.3: wx.cloud 不可用
      if (debugLog.length > 0) {
        const last = debugLog[debugLog.length - 1]
        last.resultError = `[WX_UNAVAILABLE] wx.cloud 不可用, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      }
      errorMsg = '史官落笔卡壳了——云开发不可用，点此重试。'
      options = [{ label: '重试', key: '__retry__' }]
      optionsAppearTime = Date.now() + 300
      return
    }

    wx.cloud.callFunction({
      name: 'narrate_get_result',
      data: { request_id: requestId },
      success: (res) => {
        const pollResult = (res && res.result) || {}

        if (pollResult.status === 'done') {
          // ── 成功：处理 result ──
          const result = pollResult.result || {}
          // v0.2.5-H（先生 2026-06-13 拍板）：即使 done 也带 error 字段
          // worker v0.2.5-H 在 JSON 解析失败时写 fakeResult（success:false + error + debug）
          // narrate_get_result 返回 done + result + error
          // 我们要把 result.error 塞进 result.error，方便 handleAIResponse 识别 [RESPONSE_ERROR]
          if (pollResult.error && !result.error) {
            result.error = pollResult.error
          }
          // 调试记录
          if (debugLog.length > 0) {
            const last = debugLog[debugLog.length - 1]
            last.result = result
            if (result.debug) {
              last.system_prompt = result.debug.system_prompt
              last.user_prompt = result.debug.user_prompt
              last.messages_to_ai = result.debug.messages || null
              last.raw_response = result.debug.raw_response
              last.all_branches = result.branches || null
            }
            last.poll_elapsed_ms = (pollResult.result && pollResult.result.elapsed_ms) || 0
            last.poll_attempts = attempt + 1
          }
          handleAIResponse(result, action, userInput)
        } else if (pollResult.status === 'error') {
          loading = false
          // v0.2.3: worker 返回 status=error
          if (debugLog.length > 0) {
            const last = debugLog[debugLog.length - 1]
            last.resultError = `[WORKER_ERROR] ${pollResult.error || 'AI服务暂不可用'}, attempt=${attempt + 1}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
            last.poll_attempts = attempt + 1
          }
          errorMsg = `史官落笔卡壳了——${pollResult.error || 'AI服务暂不可用'}。点此重试。`
          options = [{ label: '重试', key: '__retry__' }]
          optionsAppearTime = Date.now() + 300
        } else if (pollResult.status === 'not_found') {
          // v0.1.75: request_id 还没写入（CAP 滞后）或真不存在
          // v0.2.5-C: 改 3 → 24 次（120 秒）—— 配合 v0.2.5 prompt + LLM 实际跑 30-40 秒
          // v0.1.75 的 3 次（15 秒）只够等 10 秒 LLM 响应，现在 LLM 跑 37 秒，3 次放弃太激进
          // 24 次（120 秒）给 LLM 留 80 秒缓冲；超过 2 分钟基本就是 worker 真挂了
          if (attempt < 24) {
            loadingText = `史官正在落笔…（已等 ${(attempt + 1) * 5} 秒）`
            pollNarrateResult(requestId, action, userInput, attempt + 1)
          } else {
            loading = false
            // v0.2.3: 3 次后还 not_found，标记
            if (debugLog.length > 0) {
              const last = debugLog[debugLog.length - 1]
              last.resultError = `[NOT_FOUND] request_id=${requestId} 不存在或写入滞后, attempt=${attempt + 1}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
              last.poll_attempts = attempt + 1
            }
            errorMsg = '史官落笔卡壳了——记录找不到了，点此重试。'
            options = [{ label: '重试', key: '__retry__' }]
            optionsAppearTime = Date.now() + 300
          }
        } else {
          // processing — 更新 loading 文案让玩家知道还在等
          const elapsedSec = Math.round((pollResult.elapsed_ms || 0) / 1000)
          loadingText = `史官正在落笔…（已等 ${elapsedSec} 秒）`
          pollNarrateResult(requestId, action, userInput, attempt + 1)
        }
      },
      fail: (err) => {
        // 单次轮询失败：继续下一次（不立即放弃）
        // 但如果连续失败 ≥ 5 次，主动放弃
        if (attempt >= 4) {
          if (debugLog.length > 0) {
            const last = debugLog[debugLog.length - 1]
            last.resultError = `[POLL_NETWORK_FAIL] 轮询失败 ${attempt + 1} 次: ${(err && (err.errMsg || err.message)) || String(err)}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
            last.poll_attempts = attempt + 1
          }
          loading = false
          errorMsg = '史官落笔卡壳了——网络不稳，点此重试。'
          options = [{ label: '重试', key: '__retry__' }]
          optionsAppearTime = Date.now() + 300
          return
        }
        // 继续轮询
        pollNarrateResult(requestId, action, userInput, attempt + 1)
      },
    })
  }, 5000)
}

// ─────── 处理 AI 返回 ───────
function handleAIResponse(result, action, userInput) {
  loading = false
  // v0.2.5-D: 每轮重置 system 行计数（v0.1.80 D008 system 进 narrativeHistory 但渲染层没 reset）
  // 之前会一直累计，导致 system 行越积越多
  systemLineCount = 0

  if (!result || result.error) {
    // 显式错误：玩家看得懂的史官风格
    // v0.2.3: 把错误填进 debugLog
    // v0.2.5-H（先生 2026-06-13 拍板）：即使 result.error 也要保留 debug 信息
    // worker v0.2.5-H 写的 fakeResult 是 success:false + error + debug 三件套
    // 我们让 raw_response/system_prompt/messages 都能进 DBG，让先生排查 AI 到底吐了什么
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.resultError = `[RESPONSE_ERROR] ${(result && result.error) || 'AI服务暂不可用'}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      // v0.2.5-H: 错误时也把 raw_response 填进 debugLog
      if (result && result.debug) {
        if (result.debug.raw_response) last.raw_response = result.debug.raw_response
        if (result.debug.system_prompt) last.system_prompt = result.debug.system_prompt
        if (result.debug.user_prompt) last.user_prompt = result.debug.user_prompt
        if (result.debug.messages) last.messages_to_ai = result.debug.messages
      }
    }
    errorMsg = `史官落笔卡壳了——${(result && result.error) || 'AI服务暂不可用'}。点此重试。`
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  const { branch, state: newState, month_changed, event, system_messages } = result
  if (!branch || !branch.content) {
    // v0.2.3: 分支内容为空
    // v0.2.5-H（先生 2026-06-13 拍板）：即使为空也要把 raw_response 填进 debugLog
    // 这样先生 DBG 浮窗能看到 AI 到底吐了什么（特别是 JSON 解析失败时关键排查信息）
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.resultError = `[EMPTY_BRANCH] branch=${!!branch}, content=${!!(branch && branch.content)}, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      // 即使 result.error 也要保留（先生能直接看到错误信息）
      if (result.error) last.resultError += ` | err=${result.error}`
      // v0.2.5-H: 把 AI 原始输出填进 debugLog（worker v0.2.5-H 已经写进 result.debug.raw_response）
      if (result.debug && result.debug.raw_response) {
        last.raw_response = result.debug.raw_response
      }
      if (result.debug && result.debug.system_prompt) {
        last.system_prompt = result.debug.system_prompt
      }
      if (result.debug && result.debug.user_prompt) {
        last.user_prompt = result.debug.user_prompt
      }
      if (result.debug && result.debug.messages) {
        last.messages_to_ai = result.debug.messages
      }
    }
    errorMsg = '史官落笔卡壳了——这一页是空白。点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  // 分支 options 缺失或为空：明确报错，不补默认
  if (!Array.isArray(branch.options) || branch.options.length === 0) {
    // v0.2.3: 分支 options 缺失
    // v0.2.5-H: 即使 options 缺失也要填 raw_response，方便先生排查
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.resultError = `[EMPTY_OPTIONS] branch.options 缺失或为空, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      if (result.debug && result.debug.raw_response) {
        last.raw_response = result.debug.raw_response
      }
    }
    errorMsg = '史官落笔卡壳了——这一段选项没写出来。点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  // 1. 应用 AI 返回的 state 更新
  if (newState) {
    if (newState.age) state.age = newState.age
    if (newState.health !== undefined) state.health = newState.health
    if (newState.coin !== undefined) state.coin = newState.coin
    if (newState.month) state.month = newState.month
    if (newState.year) state.year = newState.year
    if (newState.round !== undefined) state.round = newState.round
  }

  // 2. 应用 patch — 用 !== undefined 不用真值判断（修 0 falsy bug）
  const patch = branch.patch || {}
  if (patch.coin !== undefined) state.coin = Math.max(0, state.coin + (patch.coin || 0))
  if (patch.health !== undefined) state.health = Math.max(0, Math.min(100, state.health + (patch.health || 0)))

  // 物品状态变化 — v10（D-1 改造）
  // 改：AI 用物品中文名（"茶包"）当 key，不再用 id
  // 改：数字 = 减 durability（0 时自动删物品）
  // 改：字符串 = 拼接到 desc 后缀
  if (patch.items) {
    for (const [itemKey, change] of Object.entries(patch.items)) {
      // 按中文 name 匹配（兼容旧的"lost"和字符串 desc 模式）
      const it = state.items.find(i => i.name === itemKey || i.id === itemKey)
      if (it) {
        if (typeof change === 'number') {
          // 数字 = 减 durability
          it.durability = (it.durability == null ? 100 : it.durability) + change
          if (it.durability <= 0) {
            // durability 减到 0 → 物品消失
            state.items = state.items.filter(x => x.id !== it.id)
            currentItems = currentItems.filter(x => x.id !== it.id)
          } else {
            // 更新 desc 显示当前 durability
            it.desc = it.name + '（耐久 ' + it.durability + '）'
            const ci = currentItems.find(x => x.id === it.id)
            if (ci) ci.desc = it.desc
          }
        } else if (change === 'lost') {
          // 兼容旧的"lost"字符串
          state.items = state.items.filter(x => x.id !== it.id)
          currentItems = currentItems.filter(x => x.id !== it.id)
        } else {
          // 字符串 = 拼接到 desc 后缀（兼容旧 desc 模式）
          it.desc = it.name + '（' + change + '）'
          const ci = currentItems.find(x => x.id === it.id)
          if (ci) ci.desc = it.desc
        }
      }
    }
  }

  // 3. 死亡判定
  if (state.health <= 0 || newState && newState.alive === false) {
    state.alive = false
    alive = false
  }

  // 4. 记录历史
  // v0.1.63 (D005): 重试是前端兜底，不是玩家真实意图
  // 不入 narrativeHistory，避免污染对话流
  // v0.1.87: 先生提议 — 顺序 system → ai → user（与时间因果对齐）
  //   因果链：玩家上轮选择 user → worker 推 patch → emit system → AI 接续写剧情 ai
  //   LLM 看到的 messages: user/assistant/user/assistant/... 完全符合 OpenAI 风格
  // v0.1.80 (D008): system message 进流，AI 下一回合可读
  if (Array.isArray(system_messages)) {
    for (const sm of system_messages) {
      narrativeHistory.push({ role: 'system', content: sm.content })
    }
  }
  narrativeHistory.push({ role: 'ai', content: branch.content })
  if (action === 'continue' && userInput && userInput !== '重试' && userInput !== '__retry__') {
    narrativeHistory.push({ role: 'user', content: userInput })
  }

  // 5. round 计数 +1（P1.6: AI 响应后递增）
  state.round = (state.round || 0) + 1

  // 5.5 异步加载背景图（不阻塞叙事显示）
  fetchBgImage(branch.content || '')

  // 6. 准备显示
  // v0.2.5-J（先生 2026-06-13 11:03 拍板·规则 3）：删掉 sysPrefix 拼接
  // 系统状态变化不进 narrative 字符串（前端不显示 [system · XXX] 文字）
  // system message 仍然进 narrativeHistory（给 LLM 看）
  narrative = (branch.content || '').slice(0, MAX_NARRATIVE_CHARS)
  systemLineCount = 0  // 前端不再渲染 system 行
  displayedChars = 0
  displayStartTime = Date.now()
  options = (branch.options || []).slice(0, 3).map(label => ({ label, key: label }))
  optionsAppearTime = displayStartTime + narrative.length * TYPEWRITE_SPEED + 300
  monthChanged = month_changed
  newEvent = event || null
}

// ─────── 渲染 ───────
function render(ctx) {
  if (!ctx || !layout) return

  // v0.1.66 流式布局：根据当前 narrative 长度动态算画区 + 文字面板高度
  adjustFluidLayout()

  // 淡出处理（死亡时）
  if (fadeOut) {
    const elapsed = Date.now() - fadeOut.start
    const p = Math.min(1, elapsed / fadeOut.duration)
    ctx.fillStyle = 'rgba(0,0,0,' + p + ')'
    ctx.fillRect(0, 0, layout.windowW, layout.windowH)
    if (p >= 1) {
      module.exports.autoNext = { scene: 'death', state: state }
      return
    }
  }

  // 1. 暗色古风背景
  drawBackground(ctx, layout.windowW, layout.windowH)

  // 1.5 生图背景（v0.1.63 拼贴·题跋版：画占 55% 上半屏，1.0 透明度 + 卷轴边框）
  drawBgImage(ctx)

  // 2. 顶部朱砂印（古卷风顶栏）
  drawSealTopBar(ctx)

  // 2.5 v0.1.82 状态条（v0.2.5-J：状态栏常显，layout.statusBarH 永远生效）
  // 长按时玉牒浮窗（drawJadeTablet）会盖住状态条展示更详细信息
  if (!statusHidden || isLongPressing) {
    drawStatusBar(ctx)
  }

  // 3. 月份变化提示（如有）
  if (monthChanged) {
    drawMonthNotice(ctx)
  }

  // 4. 叙事文字（题跋·下半屏，v0.1.63 改版）
  drawNarrative(ctx)

  // 5. 叙事滚动指示器
  if (narrative && Date.now() >= displayStartTime + 500) {
    drawScrollIndicator(ctx)
  }

  // 6. 选项按钮（竹简风格）
  if (Date.now() >= optionsAppearTime && options.length > 0) {
    drawOptions(ctx)
  }

  // 7. 自由输入按钮 — v0.2.5-T 挪到顶栏右侧（drawSealTopBar 画），不在这里画

  // 8. 底部物品栏（极简）
  drawItemBar(ctx)

  // 9. 加载中（v0.2.5-D：去掉 drawLoading 调用，"画在生成中" 跟 narrative 重复且常重叠）
  // 加载状态改由 narrative 区域显示"史官正在落笔..."提示（drawNarrative 内部处理）

  // 10. 错误提示
  if (errorMsg) {
    drawError(ctx)
  }

  // 11. 长按状态：玉牒浮窗（v0.2.5-J：只有长按时才显示，不再依赖 statusHidden）
  if (isLongPressing) {
    drawJadeTablet(ctx)
  }

  // 12. 物品详情浮窗（点击物品后弹出，点任何位置关闭）
  if (itemDetail) {
    drawItemDetail(ctx)
  }

  // 13. AI 调试浮窗（v0.1.61）—— 最高层级，最右上的小图标或全屏覆盖
  drawDebugPanel(ctx)
}

// ─────── 流式布局 v0.1.68 ───────
// 先生拍板的 3 层语义：
// 1. 文字面板按 displayedChars 实时延伸（打字中跟着字走）
// 2. 选项 + 自由输入打字完成后才淡入出现（不打扰阅读）
// 3. 物品栏钉在底部 64px（不参与流式布局）
function adjustFluidLayout() {
  if (!layout) return

  const topBarH = layout.topBarH
  const itemBarH = layout.itemBarH       // 钉死底部 64px
  const safeTop = layout.safeTop || 0
  const availableH = layout.windowH - safeTop - topBarH - itemBarH
  // v0.2.5-V（先生 2026-06-13 16:51 拍板·修"选项区还是越过物品栏"）：
  // optBlockH 公式重算：optionY = windowH - 35 - optReserveH
  //                      option 3 底部 = optionY + 114 = windowH + 79 - optReserveH
  //                      物品栏顶部 = windowH - 64
  // 要不越过：optReserveH ≥ 143
  // v0.2.5-Q 改的 136 和 v0.2.5-U 改的 122 都不够，都会越过
  // 修复：optBlockH = 155（留 12px 缓冲）
  const optBlockH = 155

  const typingDone = narrative && displayedChars >= narrative.length
  const optReserveH = typingDone ? optBlockH : 0
  const optionGap = 3
  const lineHeight = 22
  const fontSize = 15
  const innerW = layout.windowW - layout.padding * 2 - 24
  const charPerLine = Math.max(8, Math.floor(innerW / fontSize))

  // 文字行数按 narrative 完整字符数算
  let lineCount = 2
  if (narrative) {
    const paras = narrative.split('\n')
    let total = 0
    for (const p of paras) total += Math.max(1, Math.ceil(p.length / charPerLine))
    lineCount = Math.max(total, Math.ceil(displayedChars / charPerLine), 2)
  }
  const textPadding = 16
  const neededTextH = lineCount * lineHeight + textPadding

  // v0.1.67 修复：画区总是显示（不依赖 typingDone）
  // 先生要"画板随文字展开"——所以图片加载好就显示
  const sceneImgReady = !!bgImgEl && bgImgEl.complete && bgImgEl.width > 0
  const showScene = sceneImgReady
  const sceneH = showScene ? 130 : 0  // 固定 130 高

  // 文字区高度 = 剩余 - 画区 - 选项块 - 间距
  let finalTextH = availableH - sceneH - optReserveH - optionGap - 12
  finalTextH = Math.max(100, finalTextH)  // 不限上限

  layout.sceneH = sceneH
  layout.sceneVisible = showScene
  // v0.2.5-M（先生 2026-06-13 11:15 拍板·修"叠在一起"）：textY 加上 statusBarH
  // 之前漏算 statusBarH 导致文字起点在顶栏下方，但状态栏（26 高）也画在那里 → 文字和状态栏重叠
  layout.textY = safeTop + topBarH + (layout.statusBarH || 0) + 4 + sceneH + 8
  layout.textH = finalTextH
  // v0.1.67: 文字面板底部 + 6px 缓冲后再放选项（解决按钮紧贴文字面板的"下溢"感）
  layout.optionY = layout.textY + finalTextH + 6
  layout.optionFadeIn = typingDone ? 1 : 0
  layout.optionH = 36                       // v0.1.67: 38 → 36 缩 2px
  layout.optionGap = optionGap
  layout.itemBarY = layout.windowH - itemBarH
}

// ─────── 生图背景（v0.1.69：前端直连 Pollinations.ai，跳过云函数） ───────
// 朝代风格表（v0.1.62 起，p1: 简洁英文 prompt；p2: 水墨质感参数）
const PROMPT_BY_DYNASTY = {
  '宋':   { style: 'Song dynasty Chinese ink wash painting',      elements: 'markets, scholars, teahouses, riverside' },
  '元':   { style: 'Yuan dynasty Chinese ink landscape',          elements: 'grassland, horsemen, vast sky' },
  '明':   { style: 'Ming dynasty Chinese literati ink painting',  elements: 'gardens, scholars, calligraphy' },
  '清':   { style: 'Qing dynasty Chinese court painting',         elements: 'palace, scholars, calligraphy' },
  '唐':   { style: 'Tang dynasty Chinese gongbi heavy color',     elements: 'palace ladies, court, horses' },
  '汉':   { style: 'Han dynasty Chinese stone relief painting',   elements: 'carriage, banquet, warriors' },
  '秦':   { style: 'Qin dynasty Chinese painting',                elements: 'terracotta warriors, Great Wall' },
  '晋':   { style: 'Wei-Jin Chinese landscape',                   elements: 'bamboo forest, hermits' },
  '南北朝':{ style: 'Dunhuang mural painting',                    elements: 'flying apsaras, Buddha' },
  '隋':   { style: 'Early Tang gongbi',                           elements: 'palace, court ladies' },
  '五代': { style: 'Five dynasties Chinese landscape',            elements: 'mountains, hermits' },
  '商':   { style: 'Bronze age Chinese oracle bone art',         elements: 'ritual, sacrifice' },
  '周':   { style: 'Spring Autumn period Chinese painting',       elements: 'warriors, ritual vessels' },
  '春秋': { style: 'Spring Autumn period Chinese painting',       elements: 'warriors, ritual vessels' },
  '战国': { style: 'Warring States Chinese silk painting',       elements: 'warriors, ritual vessels' },
  '三国': { style: 'Three Kingdoms Chinese gongbi',               elements: 'battle flags, weapons' },
  'default':{ style: 'Ancient Chinese ink wash painting',          elements: 'historical scene' },
}

function buildPollinationsPrompt(narrativeText) {
  const era = state.dynasty || '宋'
  const cfg = PROMPT_BY_DYNASTY[era] || PROMPT_BY_DYNASTY['default']
  // 抓叙事前 80 字作为场景描述
  const hint = (narrativeText || '').slice(0, 80).replace(/\s+/g, ' ')
  // p1 风格词 + p2 元素词 + p3 场景
  const p1 = cfg.style
  const p2 = cfg.elements
  const p3 = hint
  // 固定水墨质感参数
  const suffix = 'ink wash, monochrome, rice paper texture, no text, no watermark, masterpiece, --ar 3:2'
  return [p1, p2, p3, suffix].filter(Boolean).join(', ')
}

function fetchBgImage(narrativeText) {
  if (typeof wx === 'undefined') return
  if (bgImageLoading) return  // 防重入

  // 从叙事/城市/事件抽 1-2 个关键词作为 scene 描述
  const era = state.dynasty || '宋'
  const city = state.city || ''
  let sceneHint = ''
  if (city) sceneHint += city
  // 抓叙事前 60 字
  const hint = (narrativeText || '').slice(0, 60)

  const prompt = buildPollinationsPrompt(narrativeText)
  // Pollinations.ai 公开 API，URL 拼装即图
  const seed = Math.floor(Math.random() * 1000000)
  const encoded = encodeURIComponent(prompt)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&seed=${seed}&nologo=true&model=flux`

  bgImageLoading = true
  if (bgImgEl) { try { bgImgEl.src = '' } catch(e) {} }
  bgImgEl = typeof wx.createImage === 'function' ? wx.createImage() : new Image()
  bgImgEl.onload = () => {
    bgImageLoading = false
    bgImage = url
  }
  bgImgEl.onerror = () => {
    bgImageLoading = false
    console.warn('Pollinations 加载失败:', url.slice(0, 80))
  }
  bgImgEl.src = url
}

function drawBgImage(ctx) {
  const sx = layout.padding
  const sy = layout.sceneY
  const sw = layout.windowW - layout.padding * 2
  const sh = layout.sceneH

  // v0.2.5-I（先生 2026-06-13 10:43 拍板·方案 A）：
  // 图没加载好时只画纯暗色背景，不画任何 UI 组件（卷轴框/边框/暗金线/朱砂印）
  // 等图加载完成才统一画 UI —— 避免"空卷轴框"显得突兀
  // 加载提示由 narrative 区的"史官正在落笔…"承担，不在这里重复
  if (!bgImgEl || !bgImgEl.complete || bgImgEl.width === 0) {
    ctx.save()
    ctx.fillStyle = 'rgba(15,12,8,0.95)'
    ctx.fillRect(sx, sy, sw, sh)
    ctx.restore()
    return  // ← 直接返回，跳过所有 UI 组件绘制
  }

  // 1. 卷轴底框（深木色，模拟画轴卷起感）
  ctx.save()
  ctx.fillStyle = 'rgba(20,16,10,0.85)'
  ctx.fillRect(sx - 4, sy - 4, sw + 8, sh + 8)
  ctx.restore()

  // 2. 画主体（cover 模式，1.0 透明度 = 主体）
  ctx.save()
  ctx.beginPath()
  ctx.rect(sx, sy, sw, sh)
  ctx.clip()  // 限制在卷轴框内
  const imgW = bgImgEl.width
  const imgH = bgImgEl.height
  const scale = Math.max(sw / imgW, sh / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const drawX = sx + (sw - drawW) / 2
  const drawY = sy + (sh - drawH) / 2
  ctx.drawImage(bgImgEl, drawX, drawY, drawW, drawH)
  ctx.restore()

  // 3. 卷轴边框（暗金）
  ctx.save()
  ctx.strokeStyle = 'rgba(200,168,124,0.45)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(sx, sy, sw, sh)
  ctx.restore()

  // 4. 卷轴上下暗金细线（强调"画"）
  ctx.save()
  ctx.strokeStyle = 'rgba(200,168,124,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(sx + 6, sy + 6)
  ctx.lineTo(sx + sw - 6, sy + 6)
  ctx.moveTo(sx + 6, sy + sh - 6)
  ctx.lineTo(sx + sw - 6, sy + sh - 6)
  ctx.stroke()
  ctx.restore()

  // 5. 左上"画"字朱砂小印（强调"这是画"）
  ctx.save()
  ctx.fillStyle = 'rgba(200,58,46,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('画 · ' + (state.dynasty || ''), sx + 10, sy + 10)
  ctx.restore()
}

// ─────── 顶部朱砂印 + 纪代（古卷风 v0.1.61） ───────
// v0.2.2 — 顶部栏（加"穿越日记"主标题 + 楷体副标题）
function drawSealTopBar(ctx) {
  const padding = layout.padding
  const topH = layout.topBarH
  const safeTop = layout.safeTop || 0

  // 1. 左侧朱砂印（保持原版，size=20 单字朝代印）
  const sealChar = state.dynasty ? state.dynasty.charAt(0) : '時'
  const sealCenterX = padding + 14
  const sealCenterY = safeTop + topH / 2
  ui.drawSealStamp(ctx, sealCenterX, sealCenterY, 20, sealChar)

  // 2. "穿越日记"主标题（朱砂印右侧，楷体大字，v0.2.2 新增）
  ctx.save()
  ctx.fillStyle = 'rgba(232,221,208,0.95)'  // 暖米黄（宣纸色）
  ctx.font = 'bold 17px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('穿越日记', sealCenterX + 36, sealCenterY - 7)
  // v0.2.5-L（先生 2026-06-13 11:14 拍板）：副标题把月份拼到年旁边
  // 之前月在状态栏第 4 段，状态栏改成 3 段后月合并到这里
  const seasonNamesTopBar = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStrTopBar = seasonNamesTopBar[(state.month || 1) - 1] || ''
  const eraStr = state.eraDisplay || (state.dynasty + ' ' + state.year + '年')
  const subInfo = eraStr + monthStrTopBar + '  ·  ' + state.name + state.age + '岁'
  ctx.fillStyle = 'rgba(200,168,124,0.7)'
  ctx.font = '11px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.fillText(subInfo, sealCenterX + 36, sealCenterY + 9)
  ctx.restore()

  // 3. v0.2.5-T（先生 2026-06-13 15:56 拍板）：自由输入 ✎ 图标放顶栏右侧
  // 之前 v0.2.5-Q 在画区右上角先生仍觉得"和选项按钮叠一起"（画区离选项区近）
  // 现在挪到顶栏右侧 —— 顶栏不是按钮区，✎ 与选项按钮完全分离
  // 顺便删掉 v0.2.2 版本号水印（玩家端没意义，腾位置给 ✎）
  const freeIconSize = 26
  const freeIconX = layout.windowW - padding - freeIconSize - 2
  const freeIconY = safeTop + (topH - freeIconSize) / 2
  // 半透深色底圆 + 朱砂红描边
  ctx.fillStyle = 'rgba(20, 16, 12, 0.7)'
  ctx.beginPath()
  ctx.arc(freeIconX + freeIconSize / 2, freeIconY + freeIconSize / 2, freeIconSize / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(192, 48, 46, 0.85)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(freeIconX + freeIconSize / 2, freeIconY + freeIconSize / 2, freeIconSize / 2, 0, Math.PI * 2)
  ctx.stroke()
  // ✎ 图标（暖金）
  ctx.fillStyle = 'rgba(232, 200, 130, 0.95)'
  ctx.font = '15px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✎', freeIconX + freeIconSize / 2, freeIconY + freeIconSize / 2 + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  layout._topFreeIcon = { x: freeIconX, y: freeIconY, w: freeIconSize, h: freeIconSize }

  // 4. 暗金细线分隔（顶栏底部）
  ui.drawClassicalDivider(ctx, padding, safeTop + topH - 1, layout.windowW - padding * 2, 0.6)

  // 5. 触摸区域
  layout._sealArea = { x: 0, y: 0, w: layout.windowW, h: safeTop + topH }
}

// ─────── 月份变化提示 ───────
function drawStatusBar(ctx) {
  // v0.1.82 (D008 显示): 常显状态条（health / coin /身份 /年月）
  const padding = layout.padding
  const top = layout.safeTop + layout.topBarH
  const h = layout.statusBarH
  const w = layout.windowW - padding * 2

  // 1. 底色（暗木色半透）
  ctx.save()
  ctx.fillStyle = 'rgba(20,16,12,0.6)'
  ctx.fillRect(padding, top, w, h)

  // 上下细线
  ctx.strokeStyle = 'rgba(200,168,124,0.25)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(padding, top + 0.5)
  ctx.lineTo(padding + w, top + 0.5)
  ctx.moveTo(padding, top + h - 0.5)
  ctx.lineTo(padding + w, top + h - 0.5)
  ctx.stroke()
  ctx.restore()

  // 2. 4 段信息：气血 / 金银 / 身份 / 城市（v0.2.5-N：先生 2026-06-13 11:17 拍板 — 加回城市）
  ctx.font = '11px ' + ui.fontFamily
  ctx.textBaseline = 'middle'

  // 分段布局：气血 25% / 金银 25% / 身份 25% / 城市 25%
  const segW = w / 4
  const cy = top + h / 2

  // 段 1：气血（health + 进度条）
  const seg1X = padding + 4
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(200,200,200,0.6)'
  ctx.fillText('气血', seg1X, cy)
  const hpBarX = seg1X + 32
  const hpBarW = segW - 36
  const hpBarH = 8
  const hpBarY = cy - hpBarH / 2
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(ctx, hpBarX, hpBarY, hpBarW, hpBarH, 4)
  ctx.fill()
  const hpRatio = Math.max(0, Math.min(1, (state.health || 0) / 100))
  const hpColor = hpRatio > 0.6 ? 'rgba(90,138,112,0.85)' : (hpRatio > 0.3 ? 'rgba(200,168,124,0.85)' : 'rgba(200,58,46,0.85)')
  ctx.fillStyle = hpColor
  roundRect(ctx, hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 4)
  ctx.fill()

  // 段 2：金银
  const seg2X = padding + segW
  ctx.fillStyle = 'rgba(200,200,200,0.6)'
  ctx.fillText('金银', seg2X + 4, cy)
  ctx.fillStyle = 'rgba(245,239,224,0.85)'
  ctx.fillText((state.coin || 0) + '文', seg2X + 36, cy)

  // 段 3：身份（职业）
  const seg3X = padding + segW * 2
  ctx.fillStyle = 'rgba(200,200,200,0.6)'
  ctx.fillText('身份', seg3X + 4, cy)
  ctx.fillStyle = 'rgba(245,239,224,0.85)'
  const occStr = state.occupation || '庶民'
  ctx.fillText(occStr.length > 4 ? occStr.slice(0, 3) + '…' : occStr, seg3X + 32, cy)

  // 段 4：城市（v0.2.5-N：状态栏加回城市信息）
  const seg4X = padding + segW * 3
  ctx.fillStyle = 'rgba(200,200,200,0.6)'
  ctx.fillText('城', seg4X + 4, cy)
  ctx.fillStyle = 'rgba(245,239,224,0.85)'
  const cityStr = state.city || '?'
  ctx.fillText(cityStr.length > 4 ? cityStr.slice(0, 3) + '…' : cityStr, seg4X + 28, cy)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// v0.2.2 — 月份变化提示（加大字号 + 朱砂色 + 楷体）
function drawMonthNotice(ctx) {
  if (Date.now() - displayStartTime > 3000) return // 只显示3秒

  const notice = '◇ 时光流转 ◇'
  const y = layout.topBarH + 8
  const alpha = Math.min(1, (Date.now() - optionsAppearTime + 200) / 600) * 0.85
  // 朱砂色（v0.2.2 改：暗金 → 朱砂）
  ctx.fillStyle = 'rgba(192, 48, 48, ' + alpha + ')'
  ctx.font = 'bold 14px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.fillText(notice, layout.windowW / 2, y)
  ctx.textAlign = 'left'

  if (newEvent && newEvent.title) {
    ctx.fillStyle = 'rgba(232, 200, 130, ' + alpha + ')'  // 暖金色
    ctx.font = '12px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.fillText('📜 ' + newEvent.title, layout.windowW / 2, y + 18)
  }
}

// ─────── 叙事文字（打字机效果 + 滚动） ───────
var scrollOffset = 0
var scrollTouchStartY = 0

// ─── 古卷风状态 ───
var statusHidden = false         // v0.2.5-J（先生 2026-06-13 11:03 拍板）：状态栏常显（玩家能直接看到气血/金银/身份/年月）
var longPressStart = 0           // 长按计时
var isLongPressing = false       // 是否在长按中
var sealAnimProgress = 0         // 印章动画进度（0-1）
const SEAL_SIZE = 30             // 朱砂印尺寸

// v0.2.2 — 叙事区（去白底卡片 + 文字直渲染 + 卷首小印 + 楷体）
function drawNarrative(ctx) {
  // v0.2.5-P（先生 2026-06-13 11:49 拍板）：loading=true 且 narrative="" 时显示"史官正在落笔..."
  // 之前 v0.2.5-D 删了 drawLoading 调用，注释说"由 narrative 区显示"，但代码里没实现
  // 结果：玩家点选项后叙事区一片空白，等 30+ 秒才有反应，体感很差
  // 修复：loading 分支画 loadingText + 毛笔蘸墨动画（复用 drawLoading 里的动画逻辑）
  if (!narrative) {
    if (loading) {
      const tx = layout.padding
      const ty = layout.textY
      const tw = layout.windowW - layout.padding * 2
      const barH = 40
      const barY = ty + 30  // 叙事区偏上位置
      const elapsed = Date.now() - loadingStart

      // 1. 半透暖色底
      ctx.save()
      ctx.fillStyle = 'rgba(35, 28, 22, 0.6)'
      roundRect(ctx, tx, barY, tw, barH, 4)
      ctx.fill()
      ctx.strokeStyle = 'rgba(232, 200, 130, 0.4)'
      ctx.lineWidth = 0.8
      roundRect(ctx, tx, barY, tw, barH, 4)
      ctx.stroke()
      ctx.restore()

      // 2. 左侧毛笔蘸墨动画（朱砂色随周期变化）
      const cycle = (elapsed % 1600) / 1600
      const penX = tx + 18
      const penY = barY + barH / 2
      ctx.save()
      ctx.strokeStyle = 'rgba(80, 50, 30, 0.7)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(penX, penY)
      ctx.lineTo(penX + 14, penY - 6)
      ctx.stroke()
      ctx.fillStyle = 'rgba(192, 48, 48, ' + (0.5 + cycle * 0.5) + ')'
      ctx.beginPath()
      ctx.arc(penX + 16, penY - 7, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // 3. 文字（楷体 + 暖色）
      ctx.fillStyle = 'rgba(245, 239, 224, 0.9)'
      ctx.font = '13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(loadingText, penX + 28, penY)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    return
  }

  const elapsed = Date.now() - displayStartTime
  const totalChars = narrative.length
  const targetChars = Math.min(totalChars, Math.floor(elapsed / TYPEWRITE_SPEED))
  displayedChars = targetChars

  const text = narrative.slice(0, displayedChars)

  // 文字版心（无白底，直接在背景上渲染）
  const tx = layout.padding
  const ty = layout.textY
  const tw = layout.windowW - layout.padding * 2
  const th = layout.textH
  const lineHeight = 26
  const fontSize = 16
  const maxW = tw - 40  // 左右各留 20px

  // v0.2.5-Q（先生 2026-06-13 15:33 拍板）：去掉"史官手书"卷首小印
  // 之前 v0.2.2 拍板加卷首小印、v0.2.5-O 修位置都白做，先生现在直接不要了
  // 删掉后正文 mainStartY 从 ty+24 改回 ty+8（v0.2.5-O 之前的位置），恢复文字顶部 16px 空间

  // v0.2.5-U（先生 2026-06-13 15:57 拍板·修"下溢到物品栏"）：恢复 ctx.clip()
  // v0.2.5-J 删 ctx.clip() 当时先生同意"自动滚屏"，但实际是手动滚屏（scrollOffset 只在触摸时调整）
  // 结果：打字过程中文字超出 th 时不被裁剪，画到选项/物品栏位置
  // 修复：恢复 clip 限定文字画在 [ty, ty+th] 范围内；超出的部分靠 scrollOffset 滚动看（v0.2.5-J 保留机制）
  let mainText = text

  // 3. 正文（暖米黄 + 楷体大字）—— v0.2.2 改：暖色 + 楷体
  // v0.2.5-Q（先生 15:33 拍板）：史官手书去掉后，mainStartY 恢复 ty+8
  const mainStartY = ty + 8 + scrollOffset

  // v0.2.5-U：clip 限定文字画在叙事区内（不会下溢到选项/物品栏）
  ctx.save()
  ctx.beginPath()
  ctx.rect(tx, ty, tw, th)
  ctx.clip()
  ctx.fillStyle = 'rgba(245, 239, 224, 0.95)'  // 暖米黄（比 v0.1.62 的 e8ddd0 更亮）
  ctx.font = '16px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  const contentEndY = drawTextInRect(ctx, mainText, tx + 20, mainStartY, maxW, lineHeight, fontSize)
  ctx.restore()  // v0.2.5-U：解除 clip（后续滚动指示器/触摸区域不受限制）

  // 4. 限制滚动 —— v0.2.5-J（规则 2）+ v0.2.5-U（先生 15:57 拍板）：文字超 th 时自动滚屏
  const contentH = contentEndY ? (contentEndY - mainStartY) : (text.split('\n').length * lineHeight)
  const maxScroll = Math.max(0, contentH - (th - 16))

  // v0.2.5-U：打字过程中自动滚屏，让光标保持在 th 底部可见
  // 之前 v0.2.5-J 只靠玩家手动滑动，超出部分看不到；现在打字时光标位置自动滚动
  if (displayedChars < totalChars && contentH > th - 16) {
    const lines = text.split('\n')
    const cursorLineIndex = lines.length - 1
    // 光标绝对 Y 位置（不含 scrollOffset）
    const cursorAbsY = ty + 8 + cursorLineIndex * lineHeight
    const visibleBottomY = ty + th - 16
    if (cursorAbsY > visibleBottomY) {
      scrollOffset = -(cursorAbsY - visibleBottomY)
    }
  }
  if (scrollOffset > 0) scrollOffset = 0
  if (scrollOffset < -maxScroll) scrollOffset = -maxScroll

  // v0.2.5-S（先生 2026-06-13 15:56 拍板）：去掉打字光标
  // 之前 v0.1.61 加的暖金色小竖线 + 闪烁动画，先生觉得多余
  // 打字机效果本身（逐字显示）已经足够表达"正在写"的节奏，不需要额外光标

  // 5. 滚动区域 + 内容高度（供触摸滑动 + drawScrollIndicator 用）
  layout._scrollArea = { x: tx, y: ty, w: tw, h: th }
  layout._contentH = contentH  // v0.2.5-J：暴露真实内容高度，避免滚动指示器用错
}

// ─────── 滚动指示器 ───────
// v0.2.5-J：用 layout._contentH（drawNarrative 算的真实高度）替代硬编码 26 × 行数
function drawScrollIndicator(ctx) {
  const yes = layout._scrollArea || {}
  const contentH = layout._contentH || (narrative ? narrative.split('\n').length * 26 : 0)
  const viewH = yes.h || 200
  if (contentH <= viewH + 20) return

  const barX = layout.windowW - 6
  // v0.2.5-J：barY 起点改成 statusBarH 下方（状态栏常显后画滚动条位置要重新算）
  const barY = (layout.safeTop || 0) + layout.topBarH + (layout.statusBarH || 0) + 8
  const barH = viewH - 16
  const thumbH = Math.max(14, barH * (viewH / contentH))
  const maxOff = Math.max(1, contentH - viewH)
  const thumbY = barY + (barH - thumbH) * (Math.abs(scrollOffset) / maxOff)

  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.12)'
  roundRect(ctx, barX - 1, barY, 2, barH, 1)
  ctx.fill()
  ctx.fillStyle = 'rgba(200,168,124,0.3)'
  roundRect(ctx, barX - 1, thumbY, 2, thumbH, 1)
  ctx.fill()
  ctx.restore()
}

// ─────── 选项按钮（竹简风格 v0.1.61：左侧朱砂红指示条） ───────
// v0.2.2 — 选项按钮（朱砂印章按钮，无序号，楷体）
function drawOptions(ctx) {
  if (!options || options.length === 0) return

  // v0.1.68: 打字中不画选项（optionFadeIn=0），打字完成后淡入（1）
  const fadeIn = layout.optionFadeIn || 0
  if (fadeIn <= 0) return

  const optX = layout.padding
  const optW = layout.windowW - layout.padding * 2
  const optH = layout.optionH
  const optGap = layout.optionGap
  const baseY = layout.optionY

  options.forEach((opt, i) => {
    const oy = baseY + i * (optH + optGap)
    const appearElapsed = Date.now() - optionsAppearTime - i * 100
    if (appearElapsed < 0) return
    const alpha = Math.min(1, appearElapsed / 300)

    ctx.save()
    ctx.globalAlpha = alpha * fadeIn

    // 1. 朱砂印章按钮 — 半透深色填充 + 朱砂红描边（v0.2.2 改）
    ctx.fillStyle = 'rgba(20, 16, 12, 0.7)'  // 半透深色（让背景透过来一点点）
    roundRect(ctx, optX, oy, optW, optH, 4)
    ctx.fill()
    // 朱砂红描边（粗一些，更"印章"）
    ctx.strokeStyle = 'rgba(192, 48, 48, 0.75)'
    ctx.lineWidth = 1.2
    roundRect(ctx, optX, oy, optW, optH, 4)
    ctx.stroke()
    // 内层朱砂细线（双重边框，更古朴）
    ctx.strokeStyle = 'rgba(192, 48, 48, 0.3)'
    ctx.lineWidth = 0.5
    roundRect(ctx, optX + 3, oy + 3, optW - 6, optH - 6, 2)
    ctx.stroke()

    // 2. 选项文字（暖米黄 + 楷体，v0.2.2 改：无序号）
    // v0.2.5-D：字号自适应 — 文字宽度超 optW * 0.9 时按比例缩小字号（避免溢出）
    const optMaxW = optW * 0.9
    let optFontSize = 15
    ctx.fillStyle = 'rgba(245, 239, 224, 0.95)'
    ctx.font = optFontSize + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    let labelW = ctx.measureText(opt.label).width
    // 缩字号：每缩 1px 测一次，最小 11px
    while (labelW > optMaxW && optFontSize > 11) {
      optFontSize--
      ctx.font = optFontSize + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      labelW = ctx.measureText(opt.label).width
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(opt.label, optX + optW / 2, oy + optH / 2)

    ctx.restore()

    // 记录热区
    opt.bounds = { x: optX, y: oy, w: optW, h: optH }
  })
}

// ─────── 自由输入按钮 ───────
// v0.2.5-T（先生 2026-06-13 15:56 拍板）：✎ 图标完全挪到顶栏右侧（drawSealTopBar 画）
// 之前 v0.2.5-Q 在画区右上角先生仍觉得"和选项按钮叠一起"（画区离选项区近，视觉上是同一组）
// 现在 ✎ 放顶栏 —— 顶栏是信息显示区（不是按钮区），✎ 与选项按钮完全分离
// 本函数不再画图标（顶栏已画），只保留 layout._topFreeIcon 的引用方便触摸逻辑用
function drawFreeInputButton(ctx) {
  // ✎ 图标现在由 drawSealTopBar 画（顶栏右侧），选项区只画 3 个选项
  // 触摸逻辑（onTouch）通过 layout._topFreeIcon 命中检测
  // 这里什么都不画，但函数保留作为渲染流水线的一部分
}

// v0.2.2 — 底部物品栏（药匣样式 + 暖色 + 楷体）
function drawItemBar(ctx) {
  const barY = layout.itemBarY
  const items = currentItems || []
  const barH = layout.itemBarH

  // 1. 底板（暗木色 + 顶部暗金边 + 朱砂点装饰）
  ctx.save()
  ctx.fillStyle = 'rgba(20, 16, 12, 0.75)'  // 比 v0.1.62 略深一档
  ctx.fillRect(0, barY, layout.windowW, barH)
  // 顶部暗金线（更亮）
  ctx.strokeStyle = 'rgba(200, 168, 124, 0.45)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(layout.padding, barY + 0.5)
  ctx.lineTo(layout.windowW - layout.padding, barY + 0.5)
  ctx.stroke()
  // 左下/右下 朱砂红小点
  ctx.fillStyle = 'rgba(192, 48, 48, 0.7)'
  ctx.beginPath()
  ctx.arc(layout.padding + 4, barY + barH - 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(layout.windowW - layout.padding - 4, barY + barH - 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. 行李标签（左侧，v0.2.2 改：楷体 + "⌜ 行李 ⌝"）
  ctx.save()
  ctx.fillStyle = 'rgba(232, 200, 130, 0.75)'  // 暖金色
  ctx.font = '11px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('⌜ 行李 ⌝', layout.padding, barY + 6)
  ctx.restore()

  if (items.length === 0) {
    // 空状态
    ctx.save()
    ctx.fillStyle = 'rgba(245, 239, 224, 0.4)'
    ctx.font = '12px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('空囊而来', layout.windowW / 2, barY + barH / 2 + 4)
    ctx.restore()
    return
  }

  // 3. 物品药匣（横排，右侧对齐）
  const boxW = 56
  const boxH = 32
  const gap = 6
  const totalW = items.length * (boxW + gap) - gap
  const startX = layout.windowW - layout.padding - totalW
  const boxY = barY + 22

  items.forEach((item, i) => {
    const bx = startX + i * (boxW + gap)

    ctx.save()
    // 药匣底（暗木色 + 朱砂描边）
    ctx.fillStyle = 'rgba(35, 28, 22, 0.85)'
    roundRect(ctx, bx, boxY, boxW, boxH, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(192, 48, 48, 0.7)'
    ctx.lineWidth = 0.8
    roundRect(ctx, bx, boxY, boxW, boxH, 3)
    ctx.stroke()
    // 内细线
    ctx.strokeStyle = 'rgba(192, 48, 48, 0.3)'
    ctx.lineWidth = 0.5
    roundRect(ctx, bx + 2, boxY + 2, boxW - 4, boxH - 4, 2)
    ctx.stroke()
    ctx.restore()

    // emoji 图标（左侧，暖金色）
    // v0.2.5-O（先生 11:38 拍板）：图标居中位置从 bx+11 改成 bx+14，避开 box 左边缘
    // 之前 emoji 14px 字号 + boxW=56 + bx+11 = 图标左边缘 bx+3（紧贴内细线 bx+2）
    // 复合 emoji（4 字节）渲染时实际视觉宽度更大，可能溢出 box 右边框
    // 修复：图标水平位置右移 3px（bx+14），字号 14→13 减小字号留更多空间
    ctx.fillStyle = 'rgba(232, 200, 130, 0.95)'  // 暖金
    ctx.font = '13px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.icon || '📦', bx + 14, boxY + boxH / 2)

    // 物品名（右侧，楷体）—— v0.2.5-D：字号自适应 + 截断避免溢出 boxW
    ctx.fillStyle = 'rgba(245, 239, 224, 0.9)'
    const name = item.name || ''
    const nameMaxW = boxW - 24  // bx+22 起算，到 boxW 右边界留 2px
    let nameFontSize = 10
    ctx.font = nameFontSize + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    let nameW = ctx.measureText(name).width
    // 缩字号：每缩 1px 测一次，最小 8px
    while (nameW > nameMaxW && nameFontSize > 8) {
      nameFontSize--
      ctx.font = nameFontSize + 'px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      nameW = ctx.measureText(name).width
    }
    // 还不够就截断
    let displayName = name
    if (nameW > nameMaxW) {
      for (let len = name.length - 1; len > 0; len--) {
        displayName = name.slice(0, len) + '…'
        if (ctx.measureText(displayName).width <= nameMaxW) break
      }
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(displayName, bx + 22, boxY + boxH / 2)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // 触摸热区
    item._bounds = { x: bx, y: boxY, w: boxW, h: boxH }
  })
}

// ─────── 玉牒浮窗（长按状态） ───────
function drawJadeTablet(ctx) {
  const w = layout.windowW
  const h = layout.windowH

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, 0, w, h)

  // 玉牒面板（居中矩形，仿玉色）
  const pw = Math.min(280, w - 40)
  const ph = 260
  const px = (w - pw) / 2
  const py = (h - ph) / 2

  ctx.save()
  ctx.fillStyle = 'rgba(26,36,30,0.95)'
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,138,112,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.stroke()
  ctx.restore()

  // 玉牒标题
  ctx.fillStyle = COLORS.jade
  ctx.font = '16px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('玉  牒', px + pw / 2, py + 30)

  // 分隔线
  ctx.strokeStyle = 'rgba(90,138,112,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px + 24, py + 52)
  ctx.lineTo(px + pw - 24, py + 52)
  ctx.stroke()

  // 内容行
  const seasonNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStr = seasonNames[(state.month || 1) - 1] || ''
  const fields = [
    { label: '姓  名', value: state.name },
    { label: '年  岁', value: state.age + '岁' },
    { label: '身  份', value: state.occupation || '庶民' },
    { label: '年  月', value: (state.year || '?') + '年 ' + (monthStr || '') },
    { label: '金银', value: state.coin + '文' },
  ]

  ctx.textAlign = 'left'
  fields.forEach((f, i) => {
    const fy = py + 72 + i * 30
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.font = '13px ' + ui.fontFamily
    ctx.fillText(f.label, px + 28, fy)
    ctx.fillStyle = 'rgba(245,239,224,0.85)'
    ctx.fillText(f.value, px + 86, fy)
  })

  // 健康条（题：气血）
  const healthY = py + 72 + fields.length * 30 + 8
  ctx.fillStyle = 'rgba(200,200,200,0.5)'
  ctx.font = '13px ' + ui.fontFamily
  ctx.fillText('气  血', px + 28, healthY)

  const hpBarX = px + 86
  const hpBarY = healthY - 6
  const hpBarW = pw - 86 - 28
  const hpBarH = 12
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(ctx, hpBarX, hpBarY, hpBarW, hpBarH, 6)
  ctx.fill()
  const hpRatio = Math.max(0, Math.min(1, state.health / 100))
  const hpColor = hpRatio > 0.6 ? '#5a8a70' : (hpRatio > 0.3 ? '#c8a87c' : '#c83a2e')
  ctx.fillStyle = hpColor
  roundRect(ctx, hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.health, hpBarX + hpBarW * hpRatio - 4, hpBarY + hpBarH / 2)

  // 物品列表
  if (state.items && state.items.length > 0) {
    const itemY = healthY + 28
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.font = '13px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.fillText('行  李', px + 28, itemY)
    ctx.fillStyle = 'rgba(245,239,224,0.7)'
    ctx.font = '11px ' + ui.fontFamily
    const itemStr = state.items.map(i => i.icon + i.name).join('  ')
    ctx.fillText(itemStr, px + 86, itemY, pw - 86 - 28)
  }

  // 底部提示
  ctx.fillStyle = 'rgba(200,200,200,0.3)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('轻点关闭', px + pw / 2, py + ph - 12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── 加载中 ───────
// v0.2.2 — 加载提示（暖色小条 + 楷体）
// v0.2.5-D：Y 位置改为选项上方 30px（之前在 narrative 区域内重叠）
function drawLoading(ctx) {
  const barH = 40
  const barY = layout.optionY - barH - 8  // 选项上方 8px 间隔
  const elapsed = Date.now() - loadingStart

  // 1. 半透暖色底（v0.2.2 改：去掉黑底）
  ctx.save()
  ctx.fillStyle = 'rgba(35, 28, 22, 0.85)'  // 暖木色
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 4)
  ctx.fill()
  // 暖金细描边
  ctx.strokeStyle = 'rgba(232, 200, 130, 0.5)'
  ctx.lineWidth = 0.8
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 4)
  ctx.stroke()
  ctx.restore()

  // 2. 左侧毛笔蘸墨动画（朱砂色随周期变化）
  const cycle = (elapsed % 1600) / 1600
  const penX = layout.padding + 18
  const penY = barY + barH / 2
  ctx.save()
  ctx.strokeStyle = 'rgba(80, 50, 30, 0.7)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(penX, penY)
  ctx.lineTo(penX + 14, penY - 6)
  ctx.stroke()
  ctx.fillStyle = 'rgba(192, 48, 48, ' + (0.5 + cycle * 0.5) + ')'
  ctx.beginPath()
  ctx.arc(penX + 16, penY - 7, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 3. 文字（楷体 + 暖色）
  ctx.fillStyle = 'rgba(245, 239, 224, 0.9)'
  ctx.font = '13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(loadingText, penX + 28, penY)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── 错误提示 ───────
function drawError(ctx) {
  // P2.9 不画全屏黑底，只画一个小提示条
  const barH = 44
  const barY = layout.windowH - layout.itemBarH - barH - 10
  ctx.save()
  ctx.fillStyle = 'rgba(100,60,60,0.85)'
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,80,80,0.4)'
  ctx.lineWidth = 1
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#e06060'
  ctx.font = '13px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(errorMsg, layout.windowW / 2, barY + barH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── AI 调试浮窗（v0.1.61）────
// 折叠：右上角小图标"DBG"（v0.1.60 改 — Emoji 在 Canvas 2D 不显示）
// 展开：全屏覆盖，显示最近 3 轮完整 input/result
function drawDebugPanel(ctx) {
  if (debugLog.length === 0) return

  if (!debugOpen) {
    // 折叠态：右上角小图标
    const iconSize = 36
    const iconX = layout.windowW - iconSize - 8
    const iconY = 8
    // 半透明背景（深色）
    ctx.fillStyle = 'rgba(40,20,60,0.85)'
    roundRect(ctx, iconX, iconY, iconSize, iconSize, 6)
    ctx.fill()
    // 边框（金色）
    ctx.strokeStyle = '#f0c878'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // 文字
    ctx.fillStyle = '#f0c878'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DBG', iconX + iconSize / 2, iconY + iconSize / 2 + 1)
    // v0.2.5-K（先生 2026-06-13 11:08 拍板）：角标只在当前轮出错时显示红点
    const lastRoundBadge = debugLog[debugLog.length - 1]
    if (lastRoundBadge && lastRoundBadge.resultError) {
      ctx.fillStyle = '#e04040'
      ctx.beginPath()
      ctx.arc(iconX + iconSize - 6, iconY + 6, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('!', iconX + iconSize - 6, iconY + 7)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    return
  }

  // 展开态：全屏覆盖
  const w = layout.windowW
  const h = layout.windowH
  const closeBarH = 40

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.92)'
  ctx.fillRect(0, 0, w, h)

  // 顶部关闭条（v0.1.66 修高一点，避免和正文文字重叠）
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, w, closeBarH)

  // v0.2.5-R（先生 2026-06-13 15:36 拍板）：两个复制按钮
  //   - "全复制"（64px）：复制完整调试信息（system prompt + 对话 + 原始响应 + 分支 + 错误）
  //   - "复制对话"（80px）：只复制 messages[1:]（跳过第一段 system prompt），先生反馈 system prompt 太长粘贴不下来
  const copyBtnW = 64
  const dialogBtnW = 80
  const _ARROW_SIZE = 28  // 占位用，避免 const 重复声明
  // 按钮布局（右到左）：▲ → 复制对话(80) → 全复制(64) → [关闭条左侧]
  const dialogBtnX = w - _ARROW_SIZE - 8 - dialogBtnW - 4
  const copyBtnX = dialogBtnX - copyBtnW - 4

  // 1. "全复制"按钮
  ctx.fillStyle = 'rgba(240,200,120,0.18)'
  ctx.fillRect(copyBtnX, 4, copyBtnW, closeBarH - 8)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('全复制', copyBtnX + copyBtnW / 2, closeBarH / 2 + 1)
  layout._copyBtn = { x: copyBtnX, y: 0, w: copyBtnW, h: closeBarH }

  // 2. "复制对话"按钮（更高亮 — 这是先生最常用的）
  ctx.fillStyle = 'rgba(240,200,120,0.32)'  // 比"全复制"更亮的填充
  ctx.fillRect(dialogBtnX, 4, dialogBtnW, closeBarH - 8)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('复制对话', dialogBtnX + dialogBtnW / 2, closeBarH / 2 + 1)
  layout._dialogBtn = { x: dialogBtnX, y: 0, w: dialogBtnW, h: closeBarH }

  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('DBG AI 调试 · 关闭 ↑', 12, closeBarH / 2)
  ctx.textAlign = 'right'
  // 向上箭头（顶部右）
  const arrowSize = 28
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(w - arrowSize - 8, 2, arrowSize, closeBarH - 4)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('▲', w - arrowSize / 2 - 8, closeBarH / 2 + 1)
  // 向下箭头（底部）
  const downY = h - arrowSize - 8
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(w - arrowSize - 8, downY, arrowSize, arrowSize)
  ctx.fillStyle = '#f0c878'
  ctx.fillText('▼', w - arrowSize / 2 - 8, downY + arrowSize / 2 + 1)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#888'
  ctx.font = '11px sans-serif'
  // v0.2.5-K（先生 2026-06-13 11:08 拍板）：只显示最近一轮
  ctx.fillText('最近 1 轮', w - arrowSize - 24, closeBarH / 2)
  // v0.2.5-K：错误轮数角标只在当前轮出错时显示（之前会统计所有保留轮次的错误数）
  const lastRound = debugLog[debugLog.length - 1]
  if (lastRound && lastRound.resultError) {
    ctx.fillStyle = '#ff6060'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('❌ 出错', w - arrowSize - 24, closeBarH / 2 + 16)
  }

  // 内容区
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, closeBarH, w, h - closeBarH)
  ctx.clip()

  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#c0c0c0'

  // 拼接所有轮次的完整文本（v0.2.5-K：先生 2026-06-13 11:08 拍板 — 只显示最近一轮）
  // 之前显示最近 3 轮先生嫌太乱，单轮调试最直观
  let allText = ''
  const startIdx = Math.max(0, debugLog.length - 1)  // 只看最后一轮
  for (let i = startIdx; i < debugLog.length; i++) {
    const d = debugLog[i]
    // v0.2.3: 错误轮次顶部加红色 ❌ 标记，方便先生一眼看出哪些轮出过错
    const errMark = d.resultError ? '❌ [出错] ' : '✅ '
    allText += `${errMark}== 第 ${i + 1}/${debugLog.length} 轮 round=${d.round} ==\n`
    // v0.2.3: 状态摘要（让先生一眼看到上下文）
    const stateStr = d.data && d.data.state ? `[朝代=${d.data.state.dynasty || '?'} 身份=${d.data.state.occupation || '?'} 年=${d.data.state.year || '?'} 月=${d.data.state.month || '?'} 历史=${(d.data.history || []).length}条]` : ''
    allText += `${stateStr}\n`
    allText += `[INPUT 玩家选项]: ${d.input || '(空)'}\n`
    allText += `[is_retry]: ${d.data && d.data.is_retry ? 'true' : 'false'}, [action]: ${d.action || '?'}\n`
    if (d.poll_attempts !== undefined) allText += `[poll_attempts]: ${d.poll_attempts}, [poll_elapsed_ms]: ${d.poll_elapsed_ms || 0}\n`
    allText += '\n'

    if (d.messages_to_ai && d.messages_to_ai.length > 0) {
      allText += `[发给 AI 的 messages]:\n`
      d.messages_to_ai.forEach((m, j) => {
        allText += `  ── messages[${j}].role="${m.role}" ──\n${m.content}\n\n`
      })
    }

    if (d.raw_response) {
      allText += `[AI 原始返回]:\n${d.raw_response}\n\n`
    }

    if (d.all_branches && d.all_branches.length > 0) {
      allText += `[AI 生成 ${d.all_branches.length} 个分支]:\n`
      d.all_branches.forEach((b, j) => {
        allText += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
      })
    }

    if (d.resultError) {
      // v0.2.3: 错误时用醒目的分隔符包裹，方便识别
      allText += `\n╔════ ERROR ════╗\n${d.resultError}\n╚════════════════╝\n\n`
    }

    allText += '\n'
  }

  // 简单自动换行
  const charW = 6   // 10px monospace 一字约 6px
  const lineH = 13
  const maxCharsPerLine = Math.floor((w - 16) / charW)
  const lines = []
  for (const rawLine of allText.split('\n')) {
    if (rawLine.length <= maxCharsPerLine) {
      lines.push(rawLine)
    } else {
      for (let i = 0; i < rawLine.length; i += maxCharsPerLine) {
        lines.push(rawLine.substring(i, i + maxCharsPerLine))
      }
    }
  }

  // 限制 debugScroll 不超过内容总长
  const totalH = lines.length * lineH
  const viewH = h - closeBarH
  const maxScroll = Math.max(0, totalH - viewH)
  if (debugScroll > maxScroll) debugScroll = maxScroll
  if (debugScroll < 0) debugScroll = 0

  const startY = closeBarH + 8 - debugScroll
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineH
    if (y < closeBarH || y > h) continue
    // 颜色：标题/请求/响应不同
    const line = lines[i]
    if (line.startsWith('━━━')) ctx.fillStyle = '#f0c878'
    else if (line.startsWith('────')) ctx.fillStyle = '#d08770'
    else if (line.startsWith('[INPUT')) ctx.fillStyle = '#88c0d0'
    else if (line.startsWith('[REQUEST')) ctx.fillStyle = '#a3be8c'
    else if (line.startsWith('[RESPONSE')) ctx.fillStyle = '#ebcb8b'
    else if (line.startsWith('[ERROR')) ctx.fillStyle = '#bf616a'
    else if (line.startsWith('[分支')) ctx.fillStyle = '#b48ead'
    else ctx.fillStyle = '#c0c0c0'
    ctx.fillText(line, 8, y)
  }
  ctx.restore()

  // 滚动条（右侧）
  if (totalH > viewH) {
    const barH = Math.max(40, viewH * viewH / totalH)
    const barY = closeBarH + (debugScroll / maxScroll) * (viewH - barH)
    ctx.fillStyle = 'rgba(240,200,120,0.4)'
    ctx.fillRect(w - 4, barY, 4, barH)
  }
}

// ─────── 触摸处理（支持长按呼出玉牒） ───────
// ─────── 物品详情浮窗（点击物品后弹出） ───────
function drawItemDetail(ctx) {
  if (!itemDetail || !itemDetail.item) return
  const item = itemDetail.item

  const w = layout.windowW
  const h = layout.windowH

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, w, h)

  // 详情面板（居中）
  const pw = Math.min(280, w - 40)
  const ph = 220
  const px = (w - pw) / 2
  const py = (h - ph) / 2

  ctx.save()
  // 玉色面板
  ctx.fillStyle = 'rgba(26,36,30,0.95)'
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,138,112,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.stroke()
  ctx.restore()

  // 大图标
  ctx.fillStyle = COLORS.gold
  ctx.font = '40px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(item.icon || '📦', px + pw / 2, py + 50)

  // 物品名
  ctx.fillStyle = COLORS.jade
  ctx.font = 'bold 18px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(item.name || '物品', px + pw / 2, py + 100)

  // 物品描述
  ctx.fillStyle = 'rgba(232,221,208,0.75)'
  ctx.font = '13px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const desc = item.desc || '一件普通的物品。'
  // 简单按 \n 拆行
  const descLines = desc.split('\n')
  descLines.forEach((line, i) => {
    ctx.fillText(line, px + pw / 2, py + 130 + i * 20, pw - 32)
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 底部提示
  ctx.fillStyle = 'rgba(200,168,124,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('轻点关闭', px + pw / 2, py + ph - 12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

var scrollStartOffset = 0
var isScrolling = false
var touchStartTime = 0
var touchStartPos = { x: 0, y: 0 }
var longPressTriggered = false

function handleTouch(x, y, type) {
  // ── AI 调试浮窗触摸拦截（v0.1.61）──
  // 浮窗区域：右上角图标（折叠态）/ 全屏覆盖（展开态）
  if (debugLog.length > 0) {
    if (!debugOpen) {
      // 折叠态：右上角小图标
      const iconSize = 36
      const iconX = layout.windowW - iconSize - 8
      const iconY = 8
      if (hitTest(x, y, iconX, iconY, iconSize, iconSize)) {
        if (type === 'end') {
          debugOpen = true
          debugScroll = 0
        }
        return null  // 拦截，不传给游戏主流程
      }
    } else {
      // 展开态：点顶部条 = 折叠；点箭头 = 滚动
      const closeBarH = 40
      const arrowSize = 28
      const _w = layout.windowW
      const _h = layout.windowH

      // v0.1.75 复制按钮（顶部条右）
      // v0.1.69 (D008): v10 prompt 单条 3000+ 字符 + history ×6 + AI 返回 = 单轮 txt 几万字符
      // wx.setClipboardData 实测 4-5 万字符以上容易失败 → 改为"只复制最新一轮"
      // v0.2.5-R（先生 15:36 拍板）：加第二个按钮"复制对话"，只复制 messages[1:] 不含 system prompt
      if (type === 'end' && layout._copyBtn && y <= closeBarH
          && x >= layout._copyBtn.x && x <= layout._copyBtn.x + layout._copyBtn.w) {
        // "全复制"按钮：复制完整调试信息（包括 system prompt）
        if (debugLog.length === 0) {
          if (wx.showToast) wx.showToast({ title: '暂无调试数据', icon: 'none' })
          return null
        }
        const d = debugLog[debugLog.length - 1]
        let txt = `== 最新一轮 round=${d.round} ==\n`
        txt += `[INPUT 玩家选项]: ${d.input || '(空)'}\n\n`
        if (d.messages_to_ai && d.messages_to_ai.length > 0) {
          txt += `[发给 AI 的 messages]:\n`
          d.messages_to_ai.forEach((m, j) => {
            txt += `  ── messages[${j}].role="${m.role}" ──\n${m.content}\n\n`
          })
        }
        if (d.raw_response) txt += `[AI 原始返回]:\n${d.raw_response}\n\n`
        if (d.all_branches && d.all_branches.length > 0) {
          txt += `[AI 生成 ${d.all_branches.length} 个分支]:\n`
          d.all_branches.forEach((b, j) => {
            txt += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
          })
        }
        if (d.resultError) txt += `[ERROR]: ${d.resultError}\n`
        if (typeof wx !== 'undefined' && wx.setClipboardData) {
          wx.setClipboardData({
            data: txt,
            success: () => {
              if (wx.showToast) wx.showToast({ title: '已复制 ' + txt.length + ' 字符（含 system prompt）', icon: 'none', duration: 1500 })
            },
            fail: (e) => {
              if (wx.showToast) wx.showToast({ title: '复制失败：' + (e.errMsg || ''), icon: 'none' })
            }
          })
        }
        return null
      }

      // v0.2.5-R："复制对话"按钮 — 只复制 messages[1:] 跳过 system prompt（先生反馈太长粘贴不下来）
      if (type === 'end' && layout._dialogBtn && y <= closeBarH
          && x >= layout._dialogBtn.x && x <= layout._dialogBtn.x + layout._dialogBtn.w) {
        if (debugLog.length === 0) {
          if (wx.showToast) wx.showToast({ title: '暂无调试数据', icon: 'none' })
          return null
        }
        const d = debugLog[debugLog.length - 1]
        let txt = `== 最新一轮 round=${d.round} 对话（不含 system prompt）==\n`
        txt += `[INPUT 玩家选项]: ${d.input || '(空)'}\n\n`
        if (d.messages_to_ai && d.messages_to_ai.length > 1) {
          txt += `[对话流]:\n`
          // 跳过 messages[0]（system prompt），从 messages[1] 开始
          d.messages_to_ai.slice(1).forEach((m, j) => {
            txt += `  ── [${j + 1}] ${m.role} ──\n${m.content}\n\n`
          })
        } else {
          txt += `[对话流]: (无)\n`
        }
        if (d.raw_response) txt += `[AI 原始返回]:\n${d.raw_response}\n\n`
        if (d.all_branches && d.all_branches.length > 0) {
          txt += `[AI 生成 ${d.all_branches.length} 个分支]:\n`
          d.all_branches.forEach((b, j) => {
            txt += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
          })
        }
        if (d.resultError) txt += `[ERROR]: ${d.resultError}\n`
        if (typeof wx !== 'undefined' && wx.setClipboardData) {
          wx.setClipboardData({
            data: txt,
            success: () => {
              if (wx.showToast) wx.showToast({ title: '已复制 ' + txt.length + ' 字符（已跳 system prompt）', icon: 'none', duration: 1500 })
            },
            fail: (e) => {
              if (wx.showToast) wx.showToast({ title: '复制失败：' + (e.errMsg || ''), icon: 'none' })
            }
          })
        }
        return null
      }

      if (type === 'end' && y <= closeBarH) {
        debugOpen = false
        return null
      }
      // 向上箭头（顶部条右）
      const upX = _w - arrowSize - 8
      if (type === 'end' && y <= closeBarH && x >= upX) {
        debugScroll = Math.max(0, debugScroll - 80)
        return null
      }
      // 向下箭头（底部）
      const downY = _h - arrowSize - 8
      if (type === 'end' && y >= downY) {
        debugScroll = debugScroll + 80
        return null
      }
      // 点击文本区任意位置 = 向下滚 1 屏
      if (type === 'end' && y > closeBarH && y < downY) {
        debugScroll = debugScroll + 100
        return null
      }
      // 展开时整个浮窗区域拦截
      return null
    }
  }

  if (type === 'start') {
    touchStartTime = Date.now()
    touchStartPos = { x, y }
    longPressTriggered = false

    // 检测是否在叙事滚动区域
    if (layout._scrollArea && x >= layout._scrollArea.x && x <= layout._scrollArea.x + layout._scrollArea.w &&
        y >= layout._scrollArea.y && y <= layout._scrollArea.y + layout._scrollArea.h) {
      isScrolling = true
      scrollTouchStartY = y
      scrollStartOffset = scrollOffset
    }
    return null
  }

  if (type === 'move') {
    // 长按检测：手指按住不动 → 显示玉牒
    if (!longPressTriggered && !isLongPressing && Date.now() - touchStartTime > 400) {
      const dx = x - touchStartPos.x
      const dy = y - touchStartPos.y
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        longPressTriggered = true
        isLongPressing = true
        return null
      }
    }

    if (isScrolling) {
      const dy = y - scrollTouchStartY
      scrollOffset = scrollStartOffset + dy
    }
    return null
  }

  if (type === 'end') {
    // 如果正在显示玉牒 → 点击关闭
    if (isLongPressing) {
      isLongPressing = false
      return null
    }

    isScrolling = false

    // 滑动超过阈值 → 不触发按钮点击（但错误状态下不要吞，让玩家能点重试）
    if (scrollTouchStartY !== 0 && Math.abs(y - scrollTouchStartY) > 10 && !errorMsg) {
      scrollTouchStartY = 0
      return null
    }
    scrollTouchStartY = 0
  }

  if (type !== 'end') return null

  // 死亡触发淡出
  if (!alive) {
    if (!fadeOut) {
      fadeOut = { start: Date.now(), duration: 1500 }
    }
    return null
  }

  // 加载中不接受输入
  if (loading) return null

  // 错误状态下点重试 — v0.1.81 修复：点 errorMsg 提示条 + options[0] 都能重试
  if (errorMsg && options.length > 0) {
    // 1. 标准重试按钮
    if (isInOptionBounds(x, y, 0)) {
      errorMsg = ''
      options = []
      callAI('__retry__')
      return null
    }
    // 2. 兜底：点 errorMsg 提示条也能重试（防止 options 按钮被 layout 偏移遮挡）
    const barH = 44
    const barY = layout.windowH - layout.itemBarH - barH - 10
    if (x >= layout.padding && x <= layout.windowW - layout.padding &&
        y >= barY && y <= barY + barH) {
      errorMsg = ''
      options = []
      callAI('__retry__')
      return null
    }
  }

  // 检查选项按钮
  for (let i = 0; i < options.length; i++) {
    if (isInOptionBounds(x, y, i)) {
      const opt = options[i]
      handleOptionSelected(opt)
      return null
    }
  }

  // 检查自由输入（v0.2.5-T：✎ 图标挪到顶栏右侧，bounds 用 layout._topFreeIcon）
  if (layout._topFreeIcon && hitTest(x, y, layout._topFreeIcon.x, layout._topFreeIcon.y, layout._topFreeIcon.w, layout._topFreeIcon.h)) {
    handleFreeInput()
    return null
  }

  // 检查物品（点击物品 → 弹物品详情浮窗）
  if (itemDetail) {
    // 详情浮窗打开时，点任何位置关闭
    itemDetail = null
    return null
  }
  for (const item of (currentItems || [])) {
    if (item._bounds && hitTest(x, y, item._bounds.x, item._bounds.y, item._bounds.w, item._bounds.h)) {
      itemDetail = { item: item, time: Date.now() }
      return null
    }
  }
}

function isInOptionBounds(x, y, idx) {
  const opt = options[idx]
  if (!opt || !opt.bounds) return false
  return hitTest(x, y, opt.bounds.x, opt.bounds.y, opt.bounds.w, opt.bounds.h)
}

// ─────── 处理选项点击 ───────
function handleOptionSelected(opt) {
  // 重试特殊处理 — v0.1.63 (D005) 用内部信号不污染对话流
  if (opt.key === '__retry__') {
    errorMsg = ''
    options = []
    callAI('__retry__')
    return
  }

  // 标记玩家选择，立即反馈
  opt.selected = true
  options = []  // 清除选项防止重复点击

  // 调用 AI
  callAI(opt.label)
}

// ─────── 处理自由输入 ───────
function handleFreeInput() {
  if (typeof wx === 'undefined' || !wx.showKeyboard) {
    // 桌面调试 fallback
    const text = prompt('输入你想做的事：')
    if (text && text.trim()) {
      options = []
      callAI(text.trim())
    }
    return
  }

  // 微信小游戏：使用 showKeyboard + onKeyboardInput + onKeyboardConfirm
  freeInputActive = true
  freeInputText = ''

  wx.showKeyboard({
    defaultValue: '',
    maxLength: 100,
    confirmType: 'send',
    success: () => {
      // 键盘已弹出，监听用户输入
      if (wx.onKeyboardInput) {
        wx.offKeyboardInput && wx.offKeyboardInput()
        wx.onKeyboardInput && wx.onKeyboardInput((res) => {
          freeInputText = res.value || ''
        })
      }
      if (wx.onKeyboardConfirm) {
        wx.offKeyboardConfirm && wx.offKeyboardConfirm()
        wx.onKeyboardConfirm && wx.onKeyboardConfirm((res) => {
          const text = (res.value || freeInputText || '').trim()
          if (text) {
            options = []
            callAI(text)
          }
          freeInputActive = false
          if (wx.hideKeyboard) wx.hideKeyboard({})
          if (wx.offKeyboardInput) wx.offKeyboardInput()
          if (wx.offKeyboardConfirm) wx.offKeyboardConfirm()
        })
      }
    },
    fail: (err) => {
      // 备用方案：使用 modal 输入
      if (wx.showModal) {
        wx.showModal({
          title: '你想做什么？',
          editable: true,
          placeholderText: '例如：去茶摊打听消息',
          success: (res) => {
            if (res.confirm && res.content && res.content.trim()) {
              options = []
              callAI(res.content.trim())
            }
          },
        })
      }
    },
  })
}
