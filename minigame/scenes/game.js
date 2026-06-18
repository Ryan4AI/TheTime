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
var showFateDetail = false    // v0.6.56: 点击命格区切换数值详情
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
var lastRawAiResp = null    // v0.6.85: 最后AI原始JSON，history送AI时代替普通content
var alive = true             // 死亡标记
var fadeOut = null           // 淡出动画
var monthChanged = false     // 月份变化（用于显示特殊提示）
var newEvent = null          // 新事件
var itemDetail = null        // 物品详情浮窗（点击物品后弹出）
var bgImage = null           // 当前背景图（云函数返回 URL）
var bgImageLoading = false   // 是否在加载
var imageRevealStart = 0     // v0.6.50g: 画像从上到下展开动画时间戳

// ─── 统一色彩常量（v0.2.5-X 审美统一）───
// 之前版本散落在各处的颜色字面量，现在统一收口到 C 对象
const C = {
  paper: 'rgba(245,239,224,0.95)',      // 暖米黄/宣纸色（叙事文字）
  gold: 'rgba(200,168,124,0.7)',         // 暗金（边框、装饰）
  goldDim: 'rgba(200,168,124,0.25)',     // 淡金（分隔线、次要装饰）
  vermillion: 'rgba(192,48,48,0.75)',    // 朱砂红（印章、按钮描边）
  dark: 'rgba(20,16,12,0.6)',            // 暗色（半透背景填充）
  darkSolid: 'rgba(30,25,20,0.95)',      // 深暗色（面板背景）
  bg: 'rgba(15,12,10,1)',                // 纯暗背景
}

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
      age: id.age != null ? id.age : 20,  // v0.6.50: 0岁不摔进 || 陷阱
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
      // v2 新增：9属性
      '声望': id['声望'] || 0,
      '财富': id['财富'] || 0,
      '学识': id['学识'] || 0,
      '颜值': id['颜值'] || 0,
      '医术': 0,
      '战功': 0,
      '文采': 0,
      '政绩': 0,
      '义行': 0,
      items: items.map(i => ({ ...i })),
      legacy: id.legacy || '',
      alive: true,
      // v0.6.50j 新增：寿限 + 轮回数据
      lifespan: 55 + Math.floor(Math.random() * 26),  // 55~80 岁隐藏寿限
      historical_shelter: id.historical_shelter || 0,
      epitaph: id.epitaph || '',
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

    // v0.6.43: 本地即时计算榜单接近度（同步，不等云函数）
    closestBoardInfo = computeClosestBoard(state)
    fetchClosestBoard()  // 云函数后台刷新（稍后覆盖）

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
  const statusBarH = 0  // v0.6.55: 第三行已删，整行去掉
  // v0.2.5-Q（先生 2026-06-13 15:33 拍板）：自由输入从选项区移到画区右上角图标
  // 选项区只剩 3 个选项，optBlockH 不再算 freeInputH
  const itemBarH = 80  // v0.6.54: 80px（给雷达图24+标签30留8px边距）
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
    sceneY: topOffset + topBarH + statusBarH + 2 + 22 + 4,
    sceneH: 130,  // v0.6.50g: 始终预留
    sceneVisible: true,
    textY: topOffset + topBarH + statusBarH + 4 + 130 + 8,
    statusBarH: statusBarH,  // v0.1.82 (D008 显示)
    textH: finalTextH,
    optionY: topOffset + topBarH + statusBarH + 4 + 130 + 8 + finalTextH + 2, // v0.6.50g: 紧贴文字
    optionH: optH,
    optionGap: optGap,
    freeInputH: freeInputH,
    itemBarY: windowHeight - itemBarH - 10,  // v0.6.50r: 底部留白10px
    fateArea: { x: 14, y: windowHeight - itemBarH - 10, w: (24 + 6) * 2 + 26, h: itemBarH },  // v0.6.57: padding=14
  }
}

// ─────── 调用 ai_narrate 云函数 ───────
// v0.1.74 (D008): 异步轮询方案
// 之前直接调 ai_narrate → 客户端 callFunction 15s 超时 → -504003
// 现在分两步：
//   1. submit（< 2 秒返回 request_id）
//   2. 每 5 秒轮询一次 get_result，直到 done/error
function callAI(userInput) {
  // v0.6.50j 寿限检测：寿限已至 → 注入临终 system message
  if (state.alive && state.lifespan && state.age >= state.lifespan && (state.health || 100) > 0) {
    narrativeHistory.push({
      role: 'system',
      content: '⚠ 寿限已至。这一轮玩家将自然离世。请在叙事中描写临终场景，结尾生成一句墓志铭写入 epitaph 字段。',
    })
  }

  loading = true
  loadingStart = Date.now()
  narrative = ''  // v0.2.5-AF: 清空上一轮叙事，让 loading 动画能显示（先生 20:33 反馈第二次选选项后 loading 不动画）
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
    // v2 新增：9属性 + 历史庇护
    '声望': state['声望'] || 0,
    '财富': state['财富'] || 0,
    '学识': state['学识'] || 0,
    '颜值': state['颜值'] || 0,
    '医术': state['医术'] || 0,
    '战功': state['战功'] || 0,
    '文采': state['文采'] || 0,
    '政绩': state['政绩'] || 0,
    '义行': state['义行'] || 0,
    items: state.items.map(i => ({ id: i.id, name: i.name, desc: i.desc })),
    legacy: state.legacy,
    alive: state.alive,
    lifespan: state.lifespan,
    historical_shelter: state.historical_shelter,
  }

  // v0.6.85: 历史最后一条 AI 消息用原始 JSON（含全部分支），强化 AI 格式学习
  // 之前的 AI 消息仍用选中分支普通内容（按先生要求）
  var historyForAi = narrativeHistory.slice(-12)
  if (lastRawAiResp) {
    for (var i$ = historyForAi.length - 1; i$ >= 0; i$--) {
      if (historyForAi[i$].role === 'ai') {
        historyForAi[i$] = { role: 'ai', content: lastRawAiResp }
        break
      }
    }
  }

  const data = {
    state: stateData,
    input: realInput,
    is_retry: isRetry,
    history: historyForAi,
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

  // 1. 应用 AI 返回的 state 更新（含 AI₂ 评分的属性变化）
  if (newState) {
    if (newState.age) state.age = newState.age
    if (newState.health !== undefined) state.health = newState.health
    if (newState.coin !== undefined) state.coin = newState.coin
    if (newState.month) state.month = newState.month
    if (newState.year) state.year = newState.year
    if (newState.round !== undefined) state.round = newState.round
    if (newState.epitaph) state.epitaph = newState.epitaph  // v0.6.89: 云函数生成的墓志铭
    // v0.6.35: AI₂ 评分后的属性从 newState 读（patch 不再含属性）
    const V2_ATTRS = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
    for (const attr of V2_ATTRS) {
      if (typeof newState[attr] === 'number') {
        var oldVal = state[attr] || 0
        var newVal = newState[attr]
        var diff = newVal - oldVal
        state[attr] = newVal
        // 属性变化飘字（+50 暖金 / -50 朱砂）
        if (diff !== 0) {
          var sign = diff > 0 ? '+' : ''
          var color = diff > 0 ? 'rgba(232,200,130,1)' : 'rgba(192,48,48,1)'
          spawnFloater(attr + sign + diff, color)
        }
      }
    }
  }

  // 2. 基础 patch（coin/health — 来自 AI₁ 叙事 patch）
  const patch = branch.patch || {}
  if (patch.coin !== undefined) state.coin = Math.max(0, state.coin + (patch.coin || 0))
  if (patch.health !== undefined) state.health = Math.max(0, Math.min(100, state.health + (patch.health || 0)))
  // v0.6.50j: AI 可选生成墓志铭
  if (patch.epitaph) state.epitaph = patch.epitaph

  // v0.6.43: 本地即时刷新榜单接近度（同步）+ 云函数后台刷新
  closestBoardInfo = computeClosestBoard(state)
  fetchClosestBoard()

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

  // v0.6.50j 寿限覆盖：寿限已到 → health 归零触发死亡
  if (state.lifespan && state.age >= state.lifespan && state.health > 0) {
    state.health = 0
  }

  // 3. 死亡判定（社会性死亡由云函数判定后写入 newState）
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
  narrativeHistory.push({ role: 'ai', content: branch.content })  // 普通轮次只存选中分支
  lastRawAiResp = (result.debug && result.debug.raw_response) || lastRawAiResp  // v0.6.85: 存原始JSON，history送AI时替代最后一条
  if (action === 'continue' && userInput && userInput !== '重试' && userInput !== '__retry__') {
    narrativeHistory.push({ role: 'user', content: userInput })
  }

  // 5. round 计数 +1（P1.6: AI 响应后递增）
  state.round = (state.round || 0) + 1

  // 5.5 异步加载背景图（不阻塞叙事显示）
  fetchBgImage(branch.content || '')

  // 6. 准备显示
  // 系统状态变化不进 narrative 字符串（前端不显示 [system · XXX] 文字）
  // system message 仍然进 narrativeHistory（给 LLM 看）
  narrative = (branch.content || '').slice(0, MAX_NARRATIVE_CHARS)
  systemLineCount = 0  // 前端不渲染 system 行
  userScrolledAway = false  // v0.6.85: 新叙事到达，重置用户手动滚动状态
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
      module.exports.autoNext = { scene: 'death', identity: state }
      return
    }
  }

  // 1. 暗色古风背景
  drawBackground(ctx, layout.windowW, layout.windowH)

  // 1.5 生图背景（v0.1.63 拼贴·题跋版：画占 55% 上半屏，1.0 透明度 + 卷轴边框）
  drawBgImage(ctx)

  // 2. 顶部朱砂印（古卷风顶栏）
  drawSealTopBar(ctx)

  // 2.5 v0.1.82 状态条
  drawStatusBar(ctx)

  // v0.6.35: 榜单目标指示器
  drawBoardTarget(ctx)

  // 3. 月份变化提示（如有）— v0.6.45 移除"时光流转"交互
  // 原 drawMonthNotice(ctx) 已删除

  // v2 新增：属性变化飘字 + 超越提示
  drawFloaters(ctx)
  drawSurpassNotice(ctx)

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

  // 7. 自由输入按钮（v0.6.50: 补回——之前被误删的 render 调用）
  if (Date.now() >= optionsAppearTime && options.length > 0) {
    drawFreeInputButton(ctx)
  }

  // 8. 底部物品栏（极简）  // v0.6.50p: 右侧并排格子雷达图
  drawItemBar(ctx)

  // 9. 加载中（v0.2.5-D：去掉 drawLoading 调用，"画在生成中" 跟 narrative 重复且常重叠）
  // 加载状态改由 narrative 区域显示"史官正在落笔..."提示（drawNarrative 内部处理）

  // 10. 错误提示
  if (errorMsg) {
    drawError(ctx)
  }

  // 11. 物品详情浮窗（点击物品后弹出，点任何位置关闭）
  if (itemDetail) {
    drawItemDetail(ctx)
  }

  // 13. v2 新增：榜单浮窗（最高层级）
  drawLeaderboard(ctx)

  // 14. AI 调试浮窗（v0.1.61）—— 最高层级，最右上的小图标或全屏覆盖
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
  const availableH = layout.windowH - safeTop - topBarH - (layout.statusBarH || 0) - itemBarH
  // v0.2.5-Z（先生 2026-06-13 19:47 拍板·方案C：缩字号+换行）：
  // 优先缩字号(15→12)，放不下就换行，按钮高度动态：单行36px/双行52px
  const optH_single = 36
  const optH_double = 52
  const optGap = 3
  const freeH = 32
  const freeGap = 6

  // 估算每个选项行数
  // 按钮文字区域宽度 = 按钮宽度 - 24px（左右各留12px）
  // 单行字号15px下，中文字符宽度约15px
  const optW = layout.windowW - layout.padding * 2
  const textMaxW = optW - 24
  const charWidthSingle = 14  // 15px字号下中文宽度估算（略小于字号）
  const maxCharsSingleLine = Math.floor(textMaxW / charWidthSingle)

  let optBlockH = 0
  if (options && options.length > 0) {
    options.forEach((opt, i) => {
      const len = (opt.label || '').length
      const lines = len > maxCharsSingleLine ? 2 : 1
      opt._lines = lines  // 存到 option 上，drawOptions 用
      opt._h = lines === 1 ? optH_single : optH_double
      optBlockH += opt._h
      if (i > 0) optBlockH += optGap
    })
  } else {
    // 没选项时按 3 个单行预留
    optBlockH = 3 * optH_single + 2 * optGap
  }
  // 加自由输入按钮高度 + 底缓冲
  optBlockH += freeGap + freeH + 8

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
  // v0.6.50g: 画像区始终预留 130px 空间，避免文字跳位
  const sceneH = 130
  layout.sceneH = sceneH
  layout.sceneVisible = true

  // v0.6.50y: 用textY到itemBarY的实际空间
  const computedTextY = safeTop + topBarH + (layout.statusBarH || 0) + 4 + sceneH + 8 + 24
  const textToItemBar = (layout.windowH - itemBarH - 10) - computedTextY
  let finalTextH = textToItemBar - optReserveH - 16  // 16 = 2文字-选项gap + 6freeGap + 8缓冲
  finalTextH = Math.max(100, finalTextH)

  layout.sceneH = sceneH
  layout.sceneVisible = true
  // v0.6.50: sceneY 同步更新（在状态栏+榜单提示条下方）
  layout.sceneY = safeTop + topBarH + (layout.statusBarH || 0) + 2 + 22 + 4
  // v0.2.5-M（先生 2026-06-13 11:15 拍板·修"叠在一起"）：textY 加上 statusBarH
  // 之前漏算 statusBarH 导致文字起点在顶栏下方，但状态栏（26 高）也画在那里 → 文字和状态栏重叠
  // v0.6.41: 再加上榜单目标条高度（24px），避免 drawBoardTarget 与叙事区重叠
  const boardTargetOffset = 24  // 榜单目标条高度（22px + 2px margin）
  layout.textY = safeTop + topBarH + (layout.statusBarH || 0) + 4 + sceneH + 8 + boardTargetOffset
  layout.textH = finalTextH
  // v0.6.50g: 选项紧贴叙事文字底部（2px 微距代替原来 6px）
  // v0.6.50y: optionY = textY + finalTextH + 2（textH已正确扣减）
  layout.optionY = layout.textY + finalTextH + 2
  layout.optionFadeIn = typingDone ? 1 : 0
  layout.optionH = 36                       // v0.1.67: 38 → 36 缩 2px
  layout.optionGap = optionGap
  layout.itemBarY = layout.windowH - itemBarH - 10
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
    imageRevealStart = Date.now()  // v0.6.50g: 开始从上到下展开
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

  // v0.6.57: 榜单目标与画卷分隔线（双线）
  ctx.save()
  ctx.strokeStyle = 'rgba(200,168,124,0.3)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(sx, sy - 5)
  ctx.lineTo(sx + sw, sy - 5)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(200,168,124,0.08)'
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.moveTo(sx, sy - 8)
  ctx.lineTo(sx + sw, sy - 8)
  ctx.stroke()
  ctx.restore()
  // v0.6.50h: 画像区始终预留 130px，加载时显示水墨加载提示
  if (!bgImgEl || !bgImgEl.complete || bgImgEl.width === 0) {
    ctx.save()
    ctx.fillStyle = 'rgba(15,12,8,0.95)'
    ctx.fillRect(sx, sy, sw, sh)
    // 水墨加载提示（呼吸动画）
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() / 1200)
    ctx.fillStyle = 'rgba(200,168,124,' + pulse + ')'
    ctx.font = '16px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎨', sx + sw / 2, sy + sh / 2 - 6)
    ctx.fillStyle = 'rgba(170,210,180,' + (pulse * 0.6) + ')'
    ctx.font = '9px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
    ctx.fillText('画卷生成中…', sx + sw / 2, sy + sh / 2 + 14)
    ctx.restore()
    return
  }

  // v0.6.50g: 从上向下展开（300ms）
  let revealH = sh
  if (imageRevealStart > 0) {
    const elapsed = Date.now() - imageRevealStart
    const progress = Math.min(1, elapsed / 300)
    revealH = sh * progress
    if (progress >= 1) imageRevealStart = 0
  }

  // 1. 卷轴底框
  ctx.save()
  ctx.fillStyle = 'rgba(20,16,10,0.85)'
  ctx.fillRect(sx - 4, sy - 4, sw + 8, sh + 8)
  ctx.restore()

  // 2. 画主体（revealH 限制可见高度 = 展开动画）
  ctx.save()
  ctx.beginPath()
  ctx.rect(sx, sy, sw, revealH)
  ctx.clip()
  const imgW = bgImgEl.width
  const imgH = bgImgEl.height
  const scale = Math.max(sw / imgW, sh / imgH)  // 用全高算出图 scale
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

  // 2. v0.2.5-AE（先生 2026-06-13 20:32 拍板）：双行排版，填满空间
  ctx.save()
  const seasonNamesTopBar = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
  const monthStrTopBar = seasonNamesTopBar[(state.month || 1) - 1] || ''
  const eraStr = state.eraDisplay || (state.dynasty + ' ' + state.year + '年')
  const textX = sealCenterX + 32  // 文字起始 X（印章右侧）

  // 上行：朝代 + 年月（大字，暖米黄）— v0.6.50y: 回退双行紧凑版，不多加行
  ctx.fillStyle = 'rgba(232,221,208,0.95)'
  ctx.font = 'bold 13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(eraStr + ' · ' + monthStrTopBar, textX, sealCenterY - 11)

  // 下行：姓名 · 年龄 · 居所 · 身份 · 阶层（一行全塞）
  ctx.fillStyle = 'rgba(200,168,124,0.8)'
  ctx.font = '11px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  const addInfo = [state.city_name || state.city || '', state.occupation || '', state.social_class || ''].filter(Boolean).join(' · ')
  ctx.fillText(state.name + ' · ' + state.age + '岁' + (addInfo ? ' · ' + addInfo : ''), textX, sealCenterY + 11)
  ctx.restore()

  // 4. v0.6.55: 分割线已删（第三行去掉后不需要额外分隔）

  // 5. v2 新增：右侧"榜"按钮（已移除 → 榜单目标条可点击）

  // 6. 触摸区域
  layout._sealArea = { x: 0, y: 0, w: layout.windowW, h: safeTop + topH }
}

// ─────── 状态分隔条（v0.6.50x: 加宽至20px，显示城市+阶层）───────
function drawStatusBar(ctx) {
  // v0.6.53: 仅留装饰细线，不再显示城市/健康/财富（占空间）
  const padding = layout.padding
  const top = layout.safeTop + layout.topBarH
  const h = layout.statusBarH || 0
  if (h < 4) return

  // 暗木色底 + 边框
  ctx.save()
  ctx.fillStyle = 'rgba(20,16,12,0.6)'
  ctx.fillRect(padding, top, layout.windowW - padding * 2, h)
  ctx.strokeStyle = 'rgba(200,168,124,0.25)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(padding, top + 0.5)
  ctx.lineTo(padding + layout.windowW - padding * 2, top + 0.5)
  ctx.moveTo(padding, top + h - 0.5)
  ctx.lineTo(padding + layout.windowW - padding * 2, top + h - 0.5)
  ctx.stroke()
  ctx.restore()
}

// v0.6.35: 榜单目标指示器（状态栏下方）
function drawBoardTarget(ctx) {
  if (!closestBoardInfo) {
    // v0.6.45: 兜底 — 即使计算失败也显示一个默认目标
    closestBoardInfo = { name: '名医榜', diff: 148, on: false }
  }

  const padding = layout.padding
  const top = (layout.safeTop || 0) + layout.topBarH + (layout.statusBarH || 0) + 2
  const w = layout.windowW - padding * 2
  const h = 22

  ctx.save()
  // 底色（半透明暖木色，比背景亮一点好分辨）
  ctx.fillStyle = closestBoardInfo.on ? 'rgba(30,48,30,0.6)' : 'rgba(40,32,22,0.6)'
  roundRect(ctx, padding, top, w, h, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,168,124,0.2)'
  ctx.lineWidth = 0.5
  roundRect(ctx, padding, top, w, h, 4)
  ctx.stroke()

  ctx.textBaseline = 'middle'

  // v0.6.85: 榜单目标条底部装饰分隔线（↔场景画面之间）
  ctx.strokeStyle = 'rgba(200,168,124,0.12)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(padding + 16, top + h + 2)
  ctx.lineTo(padding + w - 16, top + h + 2)
  ctx.stroke()

  if (closestBoardInfo.on) {
    // 已上榜：显示🏆榜名 + "已上榜·点击查看"
    ctx.fillStyle = 'rgba(232,200,130,0.85)'
    ctx.font = 'bold 10px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.fillText('🏆 ' + closestBoardInfo.name, padding + 6, top + h / 2)
    ctx.fillStyle = 'rgba(170,210,180,0.7)'
    ctx.font = '9px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.fillText('已上榜 · 点击查看排名', padding + w / 2, top + h / 2)
  } else {
    // 未上榜：🏆榜名 + 差目标
    ctx.fillStyle = 'rgba(232,200,130,0.85)'
    ctx.font = 'bold 10px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.fillText('🏆 ' + closestBoardInfo.name, padding + 6, top + h / 2)
    ctx.fillStyle = 'rgba(200,168,124,0.7)'
    ctx.font = '9px ' + ui.fontFamily
    ctx.textAlign = 'center'
    var targetText
    if (closestBoardInfo.targetPerson) {
      targetText = '还差' + closestBoardInfo.diff + '分超越' + closestBoardInfo.targetPerson + '，登上' + closestBoardInfo.name
    } else {
      targetText = '还差' + closestBoardInfo.diff + '分登上' + closestBoardInfo.name
    }
    ctx.fillText(targetText, padding + w / 2, top + h / 2)
  }

  // 存储点击区域
  layout._boardTargetArea = { x: padding, y: top, w: w, h: h }
  ctx.restore()
}

// ─────── 叙事文字（打字机效果 + 滚动） ───────
var scrollOffset = 0
var scrollTouchStartY = 0
var scrollMax = 0              // v0.6.85: 叙事区最大可滚动距离（drawNarrative 赋值）
var userScrolledAway = false   // v0.6.85: 用户手动上滑后不自动滚回底部

// ─── 古卷风状态 ───
var sealAnimProgress = 0         // 印章动画进度（0-1）
const SEAL_SIZE = 30             // 朱砂印尺寸

// v2 新增：属性变化提示
var attrNoticeTime = 0           // 属性变化提示开始时间
var attrNoticeText = ''          // 属性变化文本（如"声望+50 医术+200"）
var surpassNoticeTime = 0        // 超越提示开始时间
var surpassNoticeText = ''       // 超越文本（如"你的医术已超越华佗！"）

// v2 新增：榜单系统
var showLeaderboard = false      // 是否显示榜单浮窗
var boardScrollOffset = 0        // 榜单列表滚动偏移
var boardScrollContentH = 0      // 榜单内容总高度
var currentBoardIndex = 0        // 当前选中榜单索引（0-9）
var leaderboardData = null       // 榜单数据（从云函数获取）
var leaderboardLoading = false   // 是否在加载榜单数据
var closestBoardInfo = null      // v0.6.35: 最接近榜单信息 {name, diff, on}

// v0.6.43: 本地即时计算榜单接近度（不等云函数）
const BOARD_THRESHOLDS = {
  // v0.6.48: 统一标准重算，底层历史人物属性正常化
  '名医榜': 2550,   '名将榜': 5200,   '富商榜': 3000,
  '文豪榜': 4350,   '能臣榜': 3445,   '义士榜': 2700,
  '全能榜': 19978,  '颜值榜': 8000,
}
const BOARD_TARGET_PERSON = {
  '名医榜': '孔伯华(民国)', '名将榜': '林冲(宋)', '富商榜': '伍崇曜(清)',
  '文豪榜': '黄景仁(清)', '能臣榜': '赵高(秦)', '义士榜': '王光兴(明末)',
  '全能榜': '关汉卿(元)', '颜值榜': '岳飞(南宋)',
}
function calcBoardScore(st, name) {
  var s = function(a) { return st[a] || 0 }
  switch(name) {
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
function computeClosestBoard(st) {
  if (!st) return null
  var best = null, bestDiff = Infinity
  for (var name in BOARD_THRESHOLDS) {
    var score = calcBoardScore(st, name)
    var diff = BOARD_THRESHOLDS[name] - score
    if (diff <= 0) return { name: name, diff: 0, on: true }
    if (diff < bestDiff) { best = { name: name, diff: diff, on: false, targetPerson: BOARD_TARGET_PERSON[name] || null }; bestDiff = diff }
  }
  return best
}

// v0.6.41: 榜单接近度从云函数查询（后台刷新用）
function fetchClosestBoard() {
  if (!state || typeof wx === 'undefined' || !wx.cloud) return
  wx.cloud.callFunction({
    name: 'leaderboard_query',
    data: { action: 'closest', playerAttributes: state }
  }).then(function(res) {
    if (res.result && res.result.success && res.result.data) {
      closestBoardInfo = res.result.data
    }
  }).catch(function(err) {
    console.warn('[fetchClosestBoard] 失败:', err)
  })
}
var boardTargetVisible = false   // v0.6.35: 是否显示榜单目标行
const BOARD_LIST = ['名医榜', '名将榜', '富商榜', '文豪榜', '能臣榜', '义士榜', '全能榜', '长寿榜', '旅行家榜', '颜值榜']
const BOARD_FORMULAS = {
  '名医榜': '评分 = 医术×0.7 + 声望×0.3',
  '名将榜': '评分 = 战功×0.7 + 声望×0.3',
  '富商榜': '评分 = 财富',
  '文豪榜': '评分 = 文采×0.7 + 学识×0.3',
  '能臣榜': '评分 = 政绩×0.7 + 声望×0.3',
  '义士榜': '评分 = 义行×0.7 + 声望×0.3',
  '全能榜': '评分 = 声望+财富+学识+颜值',
  '长寿榜': '评分 = 寿命（岁）',
  '旅行家榜': '评分 = 游历城市数',
  '颜值榜': '评分 = 颜值',
}

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
  scrollMax = maxScroll  // v0.6.85: 暴露给触摸处理器

  // v0.2.5-U：打字过程中自动滚屏，让光标保持在 th 底部可见
  // v0.6.85：用户手动上滑后不再强制拉回（userScrolledAway）
  var cursorLineIndex = 0
  if (!userScrolledAway && displayedChars < totalChars && contentH > th - 16) {
    var lines = text.split('\n')
    cursorLineIndex = lines.length - 1
    // 光标绝对 Y 位置（不含 scrollOffset）
    var cursorAbsY = ty + 8 + cursorLineIndex * lineHeight
    var visibleBottomY = ty + th - 16
    if (cursorAbsY > visibleBottomY) {
      scrollOffset = -(cursorAbsY - visibleBottomY)
    }
  }
  if (scrollOffset > 0) scrollOffset = 0
  if (scrollOffset < -maxScroll) scrollOffset = -maxScroll
  // v0.6.50z: 打字完成时自动滚到底部（v0.6.85: 用户手动上滑后不强制）
  if (!userScrolledAway && displayedChars >= totalChars && maxScroll > 0 && scrollOffset > -maxScroll) {
    scrollOffset = scrollOffset - 1  // 缓步下滚
  }

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
  // v0.6.50f: barY 用 layout.textY 替代旧的 statusBarH+32 计算
  const barY = layout.textY + 4
  const barH = viewH - 16
  const thumbH = Math.max(14, barH * (viewH / contentH))
  const maxOff = Math.max(1, contentH - viewH)
  const thumbY = barY + (barH - thumbH) * (Math.abs(scrollOffset) / maxOff)

  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.08)'
  roundRect(ctx, barX - 2, barY, 3, barH, 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(200,168,124,0.4)'
  roundRect(ctx, barX - 2, thumbY, 3, thumbH, 2)
  ctx.fill()
  ctx.restore()
}

// ─────── 选项按钮（v0.2.5-Z 方案C：缩字号+自动换行） ───────
// 按钮高度动态：单行 36px / 双行 52px（由 adjustFluidLayout 计算存入 opt._h）
// 文字策略：先缩字号(15→12)，还不够就换行显示
function drawOptions(ctx) {
  if (!options || options.length === 0) return

  const fadeIn = layout.optionFadeIn || 0
  if (fadeIn <= 0) return

  const optX = layout.padding
  const optW = layout.windowW - layout.padding * 2
  const optGap = layout.optionGap || 3
  const baseY = layout.optionY

  // 文字区域宽度（左右各留 12px padding）
  const textMaxW = optW - 24
  const fontBase = '"STKaiti", "KaiTi", "楷体", ' + ui.fontFamily

  // 累计 Y 位置（每个选项高度可能不同）
  let curY = baseY

  options.forEach((opt, i) => {
    const optH = opt._h || 36  // 动态高度
    const lines = opt._lines || 1
    const appearElapsed = Date.now() - optionsAppearTime - i * 100
    if (appearElapsed < 0) { curY += optH + optGap; return }
    const alpha = Math.min(1, appearElapsed / 300)

    ctx.save()
    ctx.globalAlpha = alpha * fadeIn

    // 1. 按钮底板（暗色 + 朱砂红单层描边）
    ctx.fillStyle = C.dark
    roundRect(ctx, optX, curY, optW, optH, 4)
    ctx.fill()
    ctx.strokeStyle = C.vermillion
    ctx.lineWidth = 0.8
    roundRect(ctx, optX, curY, optW, optH, 4)
    ctx.stroke()

    // 2. 文字渲染
    ctx.fillStyle = C.paper
    const textCenterY = curY + optH / 2

    if (lines === 1) {
      // 单行：缩字号适配
      let fontSize = 15
      ctx.font = fontSize + 'px ' + fontBase
      let labelW = ctx.measureText(opt.label).width
      while (labelW > textMaxW && fontSize > 12) {
        fontSize--
        ctx.font = fontSize + 'px ' + fontBase
        labelW = ctx.measureText(opt.label).width
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(opt.label, optX + optW / 2, textCenterY)
    } else {
      // 双行：换行显示
      // 先缩字号到 12px
      const fontSize = 12
      ctx.font = fontSize + 'px ' + fontBase
      const charW = fontSize  // 中文字符宽度约等于字号
      const maxCharsPerLine = Math.floor(textMaxW / charW)
      // 按最大字符数分行
      const label = opt.label || ''
      const line1 = label.slice(0, maxCharsPerLine)
      const line2 = label.slice(maxCharsPerLine)
      const lineGap = 4  // 行间距
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(line1, optX + optW / 2, textCenterY - lineGap)
      ctx.fillText(line2, optX + optW / 2, textCenterY + fontSize + lineGap)
    }

    ctx.restore()

    // 记录热区（用于触摸检测）
    opt.bounds = { x: optX, y: curY, w: optW, h: optH }
    curY += optH + optGap
  })
}

// ─────── 自由输入按钮 ───────
// v0.2.5-Y（先生 2026-06-13 18:25 拍板）：✎ 从顶栏移回选项区下方
// v0.2.5-Z：位置改为基于选项区实际底部（动态高度）
// 虚线边框 + 暗金文字，和选项按钮同宽但更矮（32px），视觉上区分
function drawFreeInputButton(ctx) {
  if (!options || options.length === 0) return
  const fadeIn = layout.optionFadeIn || 0
  if (fadeIn <= 0) return

  const optX = layout.padding
  const optW = layout.windowW - layout.padding * 2
  const freeH = 32
  const freeGap = 6
  // 位置：选项区最后一个按钮下方
  const baseY = layout.optionY
  let optBottom = baseY
  if (options.length > 0) {
    const lastOpt = options[options.length - 1]
    if (lastOpt && lastOpt.bounds) {
      optBottom = lastOpt.bounds.y + lastOpt.bounds.h
    }
  }
  const freeY = optBottom + freeGap

  ctx.save()
  ctx.globalAlpha = fadeIn

  // 底板（暗色 + 虚线边框）
  ctx.fillStyle = C.dark
  roundRect(ctx, optX, freeY, optW, freeH, 4)
  ctx.fill()
  // 虚线边框（暗金）
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 0.8
  ctx.setLineDash([4, 3])
  roundRect(ctx, optX, freeY, optW, freeH, 4)
  ctx.stroke()
  ctx.setLineDash([])

  // 文字 "✎ 键入所想"（暗金，居中）
  ctx.fillStyle = C.gold
  ctx.font = '13px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✎ 键入所想', optX + optW / 2, freeY + freeH / 2)

  ctx.restore()

  // 记录触摸区域
  layout._freeInputBtn = { x: optX, y: freeY, w: optW, h: freeH }
}

// v0.6.50l — 格子填充式雷达图（9边形×5格，高亮格子而非连线）
// v0.6.50t: 九边形三角雷达图（按实际属性值，直线连接相邻顶点）
function drawRadarEdges(ctx, cx, cy, r, values) {
  const n = 9
  const step = (Math.PI * 2) / n
  const startAngle = -Math.PI / 2
  const maxV = 10000  // v0.6.57: 固定满分10000（之前动态max导致1000就满格）
  const innerR = r - 3

  ctx.save()

  // 淡色背景九边形
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (i % n) * step
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(15,12,8,0.6)'
  ctx.fill()

  // 同心参考环（5等分九边形）
  for (let lvl = 1; lvl <= 5; lvl++) {
    const lr = innerR * lvl / 5
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = startAngle + (i % n) * step
      const x = cx + lr * Math.cos(a)
      const y = cy + lr * Math.sin(a)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = lvl === 5 ? 'rgba(200,168,124,0.3)' : 'rgba(200,168,124,0.08)'
    ctx.lineWidth = lvl === 5 ? 0.8 : 0.3
    ctx.stroke()
  }

  // 边填充：每个九边形边对应一个属性，从中心到值所在位置的三角形
  for (let i = 0; i < n; i++) {
    const v = values[i] || 0
    const rv = (v / maxV) * innerR
    if (rv < 0.5) continue

    const a0 = startAngle + i * step
    const a1 = startAngle + ((i + 1) % n) * step

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + rv * Math.cos(a0), cy + rv * Math.sin(a0))
    ctx.lineTo(cx + rv * Math.cos(a1), cy + rv * Math.sin(a1))
    ctx.closePath()

    const intensity = 0.2 + (v / maxV) * 0.45
    ctx.fillStyle = 'rgba(220,182,100,' + intensity + ')'
    ctx.fill()
    ctx.strokeStyle = 'rgba(220,182,100,' + Math.min(intensity + 0.2, 0.6) + ')'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // 外缘九边形边框
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (i % n) * step
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(200,168,124,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 中心点
  ctx.beginPath()
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(200,168,124,0.3)'
  ctx.fill()

  ctx.restore()
}

// v0.6.50u: 边雷达图+大字标签+装饰
function drawItemBar(ctx) {
  const barY = layout.itemBarY
  const items = currentItems || []
  const barH = layout.itemBarH

  // 左侧命格区
  const radarR = 24
  const radarLabelOff = 8               // v0.6.83: 匹配 identity.js，labelDist=R+8
  const fateW = (radarR + radarLabelOff) * 2 + 26  // 86px
  const dividerX = layout.padding + fateW
  const fateCX = dividerX - fateW / 2

  // 1. 底板暗木色
  ctx.save()
  ctx.fillStyle = 'rgba(20, 16, 12, 0.78)'
  ctx.fillRect(0, barY, layout.windowW, barH)

  // 顶部双线装饰
  ctx.strokeStyle = 'rgba(200, 168, 124, 0.5)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(layout.padding, barY + 0.5)
  ctx.lineTo(layout.windowW - layout.padding, barY + 0.5)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(200, 168, 124, 0.25)'
  ctx.lineWidth = 0.3
  ctx.beginPath()
  ctx.moveTo(layout.padding, barY + 2.5)
  ctx.lineTo(layout.windowW - layout.padding, barY + 2.5)
  ctx.stroke()
  ctx.restore()

  // 2. 命格区底板
  ctx.save()
  ctx.fillStyle = 'rgba(30, 24, 18, 0.5)'
  ctx.fillRect(layout.padding, barY, fateW, barH)

  // 命格区左下角 〖 装饰
  ctx.fillStyle = 'rgba(200,168,124,0.2)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  // 左侧装饰已移除 v0.6.50y
  ctx.restore()

  // 3. 边雷达图 / 数值详情（点击切换）
  const rcx = fateCX
  const rcy = barY + barH / 2
  const rKeys = ['声望','财富','学识','颜值','医术','战功','文采','政绩','义行']
  const rVals = rKeys.map(k => state[k] || 0)

  if (showFateDetail) {
    // v0.6.56: 数值详情模式 — 9属性竖向列表
    ctx.save()
    ctx.fillStyle = 'rgba(25,20,15,0.88)'
    ctx.fillRect(layout.padding + 1, barY + 1, fateW - 2, barH - 2)
    const nameColX = layout.padding + 6
    const valColX = layout.padding + fateW - 6
    for (let i = 0; i < 9; i++) {
      const rowY = barY + 3 + i * 8
      ctx.fillStyle = 'rgba(170,210,180,0.65)'
      ctx.font = '7px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(rKeys[i], nameColX, rowY)
      ctx.fillStyle = 'rgba(200,168,124,0.55)'
      ctx.textAlign = 'right'
      ctx.fillText(rVals[i].toString(), valColX, rowY)
    }
    ctx.restore()
  } else {
    drawRadarEdges(ctx, rcx, rcy, radarR, rVals)

    ctx.save()
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2) / 9
      const labelDist = radarR + radarLabelOff
      const lx = rcx + labelDist * Math.cos(a)
      const ly = rcy + labelDist * Math.sin(a)
      ctx.fillStyle = 'rgba(170,210,180,0.65)'
      ctx.font = '8px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      var sinA = Math.sin(a), cosA = Math.cos(a)
      ctx.fillText(rKeys[i], lx + cosA * 5, ly + sinA * 5)
    }
    ctx.restore()
  }

  // 4. 竖向分隔线（红+上下红点）
  ctx.save()
  ctx.strokeStyle = 'rgba(192, 48, 48, 0.6)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(dividerX, barY + 4)
  ctx.lineTo(dividerX, barY + barH - 4)
  ctx.stroke()
  ctx.fillStyle = 'rgba(192, 48, 48, 0.7)'
  ctx.beginPath()
  ctx.arc(dividerX, barY + 3, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(dividerX, barY + barH - 3, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 5. 物品区（木匣格子·双行抽屉）
  const slotW = 44
  const slotH = 24
  const slotGap = 4
  const itemEndX = layout.windowW - layout.padding
  const chestW = itemEndX - dividerX - 10
  const cols = Math.min(Math.floor(chestW / (slotW + slotGap)), 5)
  const rows = 2
  const gridW = cols * (slotW + slotGap) - slotGap
  const gridH = rows * (slotH + slotGap) - slotGap
  const gridStartX = dividerX + 6 + Math.max(0, (chestW - gridW) / 2)

  // 木匣外框（粗木纹色 + 圆角）
  ctx.save()
  ctx.strokeStyle = 'rgba(160,120,70,0.2)'
  ctx.lineWidth = 1
  roundRect(ctx, dividerX + 4, barY + 3, chestW, barH - 6, 4)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(160,120,70,0.1)'
  ctx.lineWidth = 0.5
  roundRect(ctx, dividerX + 6, barY + 5, chestW - 4, barH - 10, 3)
  ctx.stroke()
  ctx.restore()

  // 铜角装饰
  ctx.save()
  ctx.fillStyle = 'rgba(180,140,80,0.25)'
  const corners = [
    [dividerX + 7, barY + 6],
    [dividerX + chestW - 8, barY + 6],
    [dividerX + 7, barY + barH - 8],
    [dividerX + chestW - 8, barY + barH - 8]
  ]
  corners.forEach(([cx, cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill()
  })
  ctx.restore()

  // 横向木纹线（拼缝）
  ctx.save()
  ctx.strokeStyle = 'rgba(160,120,70,0.05)'
  ctx.lineWidth = 0.5
  const midY = barY + barH / 2
  ctx.beginPath()
  ctx.moveTo(dividerX + 8, midY)
  ctx.lineTo(itemEndX - 4, midY)
  ctx.stroke()
  ctx.restore()

  // 所有格子背景
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = gridStartX + c * (slotW + slotGap)
      const by = (r === 0 ? barY + 14 : barY + 14 + slotH + slotGap)  // v0.6.57: 垂直居中
      ctx.save()
      ctx.fillStyle = 'rgba(25,18,12,0.5)'
      roundRect(ctx, bx, by, slotW, slotH, 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(160,120,70,0.08)'
      ctx.lineWidth = 0.5
      roundRect(ctx, bx, by, slotW, slotH, 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  // 物品填入格子
  if (items.length > 0) {
    items.forEach((item, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      if (r >= rows) return
      const bx = gridStartX + c * (slotW + slotGap)
      const by = (r === 0 ? barY + 14 : barY + 14 + slotH + slotGap)  // v0.6.57: 垂直居中
      // 物品底板（拉开抽屉效果）
      ctx.save()
      ctx.fillStyle = 'rgba(50,35,20,0.75)'
      roundRect(ctx, bx + 1, by + 1, slotW - 2, slotH - 2, 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(192,48,48,0.4)'
      ctx.lineWidth = 0.6
      roundRect(ctx, bx + 1, by + 1, slotW - 2, slotH - 2, 2)
      ctx.stroke()
      // 抽屉抽手（小圆点）
      ctx.fillStyle = 'rgba(180,140,80,0.35)'
      ctx.beginPath()
      ctx.arc(bx + slotW - 7, by + 4, 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // 物品名（图标+缩略名）
      ctx.fillStyle = 'rgba(232,200,130,0.85)'
      ctx.font = '8px "STKaiti", "KaiTi", "\u6977\u4F53", ' + ui.fontFamily
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const shortName = (item.name || '').slice(0, 4)
      ctx.fillText((item.icon || '\ud83d\udce6') + shortName, bx + slotW / 2, by + slotH / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      item._bounds = { x: bx, y: by, w: slotW, h: slotH }
    })
  }
}

// v2 新增：属性变化飘字系统
// 每条飘字独立动画：从中部往上飘 + 渐变消失 + 略微放大
var floaters = []  // [{ text, color, startTime, x, y, dy }]

function spawnFloater(text, color) {
  // 起点：底部雷达图中央（v0.6.50r：从顶部改到底部）
  const fateCX = layout.padding + 45  // 雷达图中心 x（对应 fateW=90）
  floaters.push({
    text: text,
    color: color || 'rgba(200,168,124,1)',  // 默认暖金色
    startTime: Date.now(),
    x: fateCX,
    y: layout.itemBarY + layout.itemBarH / 2,  // 雷达图中心 y
    dy: 70,  // 往上飘的距离
  })
}

function drawFloaters(ctx) {
  if (floaters.length === 0) return
  const now = Date.now()
  const LIFE = 1600  // 总寿命 ms
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (var i = floaters.length - 1; i >= 0; i--) {
    var f = floaters[i]
    var t = (now - f.startTime) / LIFE
    if (t >= 1) { floaters.splice(i, 1); continue }
    // 缓动：ease-out（先快后慢）
    var ease = 1 - Math.pow(1 - t, 2)
    // 位置：起点 + 往上飘 dy
    var y = f.y - f.dy * ease
    // 透明度：0-0.15 段从 0 到 1，0.15-0.7 保持 1，0.7-1 渐变到 0
    var alpha
    if (t < 0.15) alpha = t / 0.15
    else if (t > 0.7) alpha = (1 - t) / 0.3
    else alpha = 1
    // 字号：12 渐变到 18（前段）
    var fontSize = 13 + 5 * Math.min(t / 0.3, 1)
    // 描边黑色让金色字更醒目
    ctx.font = 'bold ' + fontSize.toFixed(1) + 'px ' + ui.fontFamily
    // 阴影模拟外发光
    ctx.shadowColor = f.color
    ctx.shadowBlur = 8 * alpha
    // 描边
    ctx.strokeStyle = 'rgba(0,0,0,' + (alpha * 0.8) + ')'
    ctx.lineWidth = 3
    ctx.strokeText(f.text, f.x, y)
    // 填充
    ctx.fillStyle = f.color.replace(/,1\)$/, ',' + alpha + ')').replace(/,1$/, ',' + alpha)
    ctx.fillText(f.text, f.x, y)
    ctx.shadowBlur = 0
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// v2 新增：超越历史人物全屏特效（v0.6.1 强化：金光 + 居中大字）
function drawSurpassNotice(ctx) {
  if (!surpassNoticeTime || Date.now() - surpassNoticeTime > 5000) return
  if (!surpassNoticeText) return

  var now = Date.now()
  var t = (now - surpassNoticeTime) / 5000  // 0-1
  var w = layout.windowW
  var h = layout.windowH

  // ── 阶段1（0-0.4s）：金色闪屏 ──
  // 阶段2（0.4-4.5s）：金光脉冲 + 居中大字
  // 阶段3（4.5-5s）：渐隐

  // 1. 全屏金光（脉冲）
  if (t < 0.45) {
    var flashAlpha = (1 - t / 0.45) * 0.35
    ctx.save()
    ctx.fillStyle = 'rgba(232,200,130,' + flashAlpha + ')'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  } else if (t < 0.85) {
    // 持续微金光（呼吸感）
    var pulseAlpha = 0.04 + 0.03 * Math.sin(now * 0.005)
    ctx.save()
    ctx.fillStyle = 'rgba(232,200,130,' + pulseAlpha + ')'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // 2. 中央金色大字
  var textAlpha
  if (t < 0.1) textAlpha = t / 0.1
  else if (t > 0.9) textAlpha = (1 - t) / 0.1
  else textAlpha = 1
  textAlpha = Math.max(0, Math.min(1, textAlpha))

  var cy = h / 2 - 10
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 金色光晕
  ctx.shadowColor = 'rgba(232,200,130,0.95)'
  ctx.shadowBlur = 20
  // 描边
  ctx.strokeStyle = 'rgba(120,80,30,' + (textAlpha * 0.9) + ')'
  ctx.lineWidth = 4
  ctx.font = 'bold 18px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.strokeText('🏆 ' + surpassNoticeText, w / 2, cy)
  // 填充
  ctx.fillStyle = 'rgba(255,240,200,' + textAlpha + ')'
  ctx.fillText('🏆 ' + surpassNoticeText, w / 2, cy)
  ctx.shadowBlur = 0

  // 副标题
  ctx.font = '11px "STKaiti", "KaiTi", "楷体", ' + ui.fontFamily
  ctx.fillStyle = 'rgba(200,168,124,' + (textAlpha * 0.85) + ')'
  ctx.fillText('留 名 青 史', w / 2, cy + 28)
  ctx.restore()
}

// v2 新增：榜单浮窗
function drawLeaderboard(ctx) {
  if (!showLeaderboard) return

  const w = layout.windowW
  const h = layout.windowH

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(0, 0, w, h)

  // 面板
  const pw = w - 20
  const ph = h - 40
  const px = 10
  const py = 20

  // 面板背景
  ctx.save()
  ctx.fillStyle = 'rgba(26,36,30,0.98)'
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,138,112,0.6)'
  ctx.lineWidth = 1.5
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.stroke()
  ctx.restore()

  // 标题
  ctx.fillStyle = COLORS.jade
  ctx.font = 'bold 16px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('历 史 名 人 榜', px + pw / 2, py + 24)

  // Tab区域（2行5列）
  const tabY = py + 48
  const tabH = 28
  const tabGap = 4
  const tabColW = (pw - 40 - tabGap * 4) / 5
  layout._boardTabs = []

  for (let i = 0; i < BOARD_LIST.length; i++) {
    const row = Math.floor(i / 5)
    const col = i % 5
    const tx = px + 20 + col * (tabColW + tabGap)
    const ty = tabY + row * (tabH + tabGap)
    const isSelected = (i === currentBoardIndex)

    // Tab背景
    ctx.fillStyle = isSelected ? 'rgba(192,48,48,0.8)' : 'rgba(200,168,124,0.15)'
    roundRect(ctx, tx, ty, tabColW, tabH, 4)
    ctx.fill()

    // Tab文字
    ctx.fillStyle = isSelected ? 'rgba(245,239,224,0.95)' : 'rgba(200,168,124,0.7)'
    ctx.font = (isSelected ? 'bold ' : '') + '11px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(BOARD_LIST[i], tx + tabColW / 2, ty + tabH / 2)

    layout._boardTabs.push({ x: tx, y: ty, w: tabColW, h: tabH, index: i })
  }

  // 内容区域（tab下方）
  const contentX = px + 20
  const contentW = pw - 40
  const contentY = tabY + (tabH + tabGap) * 2 + 12
  const contentH = ph - 120

  // 分隔线
  ctx.strokeStyle = 'rgba(90,138,112,0.2)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(contentX, contentY - 6)
  ctx.lineTo(contentX + contentW, contentY - 6)
  ctx.stroke()

  if (leaderboardLoading) {
    // 加载中
    ctx.fillStyle = 'rgba(200,168,124,0.6)'
    ctx.font = '14px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.fillText('加载中...', px + pw / 2, contentY + contentH / 2)
  } else if (!leaderboardData || !leaderboardData[BOARD_LIST[currentBoardIndex]]) {
    // 无数据
    ctx.fillStyle = 'rgba(200,168,124,0.6)'
    ctx.font = '14px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.fillText('暂无数据', px + pw / 2, contentY + contentH / 2)
  } else {
    // 显示人物列表（可滚动）
    const chars = leaderboardData[BOARD_LIST[currentBoardIndex]]
    const rowH = 32

    // 评分规则行（固定不滚动）
    ctx.save()
    ctx.fillStyle = 'rgba(170,210,180,0.6)'
    ctx.font = '11px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(BOARD_FORMULAS[BOARD_LIST[currentBoardIndex]] || '', contentX, contentY + rowH / 2)

    // 分隔线（规则行下方）
    ctx.strokeStyle = 'rgba(90,138,112,0.2)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(contentX, contentY + rowH + 2)
    ctx.lineTo(contentX + contentW, contentY + rowH + 2)
    ctx.stroke()
    ctx.restore()

    // 滚动可绘制区域
    const listY = contentY + rowH + 8
    const listH = contentH - rowH - 12

    // 裁剪区域，防止滚动内容溢出
    ctx.save()
    ctx.beginPath()
    ctx.rect(contentX, listY, contentW, listH)
    ctx.clip()

    // 限制滚动范围
    const totalH = chars.length * rowH
    boardScrollContentH = totalH
    const maxScroll = Math.max(0, totalH - listH)
    if (boardScrollOffset > 0) boardScrollOffset = 0
    if (boardScrollOffset < -maxScroll) boardScrollOffset = -maxScroll

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]
      const ry = listY + i * rowH + boardScrollOffset

      // 跳过不可见行
      if (ry + rowH < listY || ry > listY + listH) continue

      // 排名
      ctx.fillStyle = char.排名 <= 3 ? 'rgba(192,48,48,0.9)' : 'rgba(200,168,124,0.6)'
      ctx.font = (char.排名 <= 3 ? 'bold ' : '') + '12px ' + ui.fontFamily
      ctx.fillText(char.排名, contentX, ry + rowH / 2)

      // 姓名
      ctx.fillStyle = 'rgba(245,239,224,0.9)'
      ctx.font = '13px ' + ui.fontFamily
      ctx.fillText(char.name, contentX + 36, ry + rowH / 2)

      // 朝代
      ctx.fillStyle = 'rgba(200,168,124,0.6)'
      ctx.font = '11px ' + ui.fontFamily
      ctx.fillText(char.dynasty, contentX + 90, ry + rowH / 2)

      // 人物简介（取介绍.title，无则略）
      const title = (char.介绍 && char.介绍.title) || ''
      if (title) {
        ctx.fillStyle = 'rgba(170,210,180,0.55)'
        ctx.font = '10px ' + ui.fontFamily
        ctx.fillText(title, contentX + 156, ry + rowH / 2)
      }

      // 综合分
      ctx.fillStyle = 'rgba(245,239,224,0.8)'
      ctx.font = '12px ' + ui.fontFamily
      ctx.textAlign = 'right'
      ctx.fillText(char.综合分 + '分', contentX + contentW, ry + rowH / 2)
      ctx.textAlign = 'left'

      // 分隔线
      if (i < chars.length - 1) {
        ctx.strokeStyle = 'rgba(90,138,112,0.1)'
        ctx.lineWidth = 0.3
        ctx.beginPath()
        ctx.moveTo(contentX, ry + rowH)
        ctx.lineTo(contentX + contentW, ry + rowH)
        ctx.stroke()
      }
    }

    ctx.restore()  // 解除clip

    // 滚动指示器
    if (totalH > listH) {
      const barX = px + pw - 10
      const barH = listH
      const thumbH = Math.max(20, barH * (listH / totalH))
      const thumbY = listY + (barH - thumbH) * (Math.abs(boardScrollOffset) / maxScroll)

      ctx.fillStyle = 'rgba(200,168,124,0.08)'
      roundRect(ctx, barX - 1, listY, 2, barH, 1)
      ctx.fill()
      ctx.fillStyle = 'rgba(200,168,124,0.25)'
      roundRect(ctx, barX - 1, thumbY, 2, thumbH, 1)
      ctx.fill()
    }

    // 存储滚动区域供触摸用
    layout._boardScrollArea = { x: contentX, y: listY, w: contentW, h: listH }
  }

  // 关闭按钮
  const closeBtnSize = 32
  const closeBtnX = px + pw - closeBtnSize - 8
  const closeBtnY = py + 8
  ctx.fillStyle = 'rgba(192,48,48,0.7)'
  roundRect(ctx, closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(245,239,224,0.9)'
  ctx.font = 'bold 16px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('×', closeBtnX + closeBtnSize / 2, closeBtnY + closeBtnSize / 2)
  layout._boardCloseBtn = { x: closeBtnX, y: closeBtnY, w: closeBtnSize, h: closeBtnSize }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// v2 新增：获取榜单数据
function fetchLeaderboardData() {
  if (leaderboardData) return // 已加载
  // wx.cloud 可用性检查
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    console.warn('[leaderboard] wx.cloud 不可用')
    leaderboardLoading = false
    return
  }
  leaderboardLoading = true

  wx.cloud.callFunction({
    name: 'leaderboard_query',
    data: { action: 'list' }
  }).then(function(res) {
    if (res.result && res.result.success) {
      // 获取所有榜单详情
      var promises = BOARD_LIST.map(function(name) {
        return wx.cloud.callFunction({
          name: 'leaderboard_query',
          data: { action: 'detail', board: name }
        })
      })
      return Promise.all(promises)
    }
    throw new Error('获取榜单列表失败')
  }).then(function(results) {
    leaderboardData = {}
    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (r.result && r.result.success && r.result.data) {
        leaderboardData[r.result.data.name] = r.result.data.characters || []
      }
    }
    leaderboardLoading = false
  }).catch(function(err) {
    console.error('[leaderboard] 获取失败:', err)
    leaderboardLoading = false
  })
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
    // 折叠态：右上角小图标（v0.6.50: 移入状态栏右侧，避免与系统···叠一起）
    const iconSize = 24
    const rightPad = 8
    const iconX = layout.windowW - layout.padding - rightPad - iconSize
    const iconY = layout.safeTop + layout.topBarH + 1
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
      ctx.arc(iconX + iconSize - 5, iconY + 5, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 8px sans-serif'
      ctx.fillText('!', iconX + iconSize - 5, iconY + 6)
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

function handleTouch(x, y, type) {
  // ── v2 新增：榜单浮窗触摸拦截 ──
  if (showLeaderboard) {
    if (type === 'start') {
      touchStartPos.x = x
      touchStartPos.y = y
      touchStartTime = Date.now()
      isScrolling = false
      return null
    }
    if (type === 'move') {
      var dy = y - touchStartPos.y
      if (Math.abs(dy) > 5) isScrolling = true
      if (isScrolling) {
        boardScrollOffset += dy
        touchStartPos.y = y  // 增量滚动
      }
      return null
    }
    if (type === 'end') {
      if (!isScrolling) {
        // 点击关闭按钮
        var tappedOnClose = layout._boardCloseBtn && hitTest(x, y, layout._boardCloseBtn.x, layout._boardCloseBtn.y, layout._boardCloseBtn.w, layout._boardCloseBtn.h)
        if (tappedOnClose) {
          showLeaderboard = false
          return null
        }
        // Tab 切换
        if (layout._boardTabs) {
          for (const tab of layout._boardTabs) {
            if (hitTest(x, y, tab.x, tab.y, tab.w, tab.h)) {
              if (tab.index !== currentBoardIndex) {
                currentBoardIndex = tab.index
                leaderboardData = null
                boardScrollOffset = 0
                fetchLeaderboardData()
              }
              return null
            }
          }
        }
        // 点击空白处关闭
        showLeaderboard = false
      }
      isScrolling = false
      return null
    }
    return null // 榜单浮窗打开时拦截所有触摸
  }

  // ── v0.6.56: 命格区点击切换数值详情 ──
  if (type === 'end' && layout.fateArea && hitTest(x, y, layout.fateArea.x, layout.fateArea.y, layout.fateArea.w, layout.fateArea.h)) {
    showFateDetail = !showFateDetail
    return null
  }


  // ── AI 调试浮窗触摸拦截（v0.1.61）──
  // 浮窗区域：右上角图标（折叠态）/ 全屏覆盖（展开态）
  if (debugLog.length > 0) {
    if (!debugOpen) {
      // 折叠态：右上角小图标（v0.6.50: 移入状态栏右侧，避免与系统···叠一起）
      const iconSize = 24
      const rightPad = 8
      const iconX = layout.windowW - layout.padding - rightPad - iconSize
      const iconY = layout.safeTop + layout.topBarH + 1
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

  // ── v2 新增：榜单目标条点击 → 打开榜单 ──
  if (type === 'end' && layout._boardTargetArea && hitTest(x, y, layout._boardTargetArea.x, layout._boardTargetArea.y, layout._boardTargetArea.w, layout._boardTargetArea.h)) {
    showLeaderboard = true
    // v0.6.50z: 点击榜单目标时默认打开对应榜单
    if (closestBoardInfo && closestBoardInfo.name) {
      var targetIdx = BOARD_LIST.indexOf(closestBoardInfo.name)
      if (targetIdx >= 0) currentBoardIndex = targetIdx
    }
    fetchLeaderboardData()
    return null
  }


  if (type === 'start') {
    touchStartTime = Date.now()

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
    if (isScrolling) {
      const dy = y - scrollTouchStartY
      scrollOffset = scrollStartOffset + dy
      // v0.6.85: 检测用户是否手动离开了底部
      if (scrollOffset > -(scrollMax - 10)) {
        userScrolledAway = true
      } else {
        userScrolledAway = false
      }
    }
    return null
  }

  if (type === 'end') {
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

  // 检查自由输入（v0.6.50g: 用 _freeInputBtn 替代旧版 _topFreeIcon）
  if (layout._freeInputBtn && hitTest(x, y, layout._freeInputBtn.x, layout._freeInputBtn.y, layout._freeInputBtn.w, layout._freeInputBtn.h)) {
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
