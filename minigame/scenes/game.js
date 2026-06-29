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
var streamedText = ''        // D048c: 保留变量（兼容旧代码引用），非流式始终为空
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
var deathConfirmPending = false  // v0.6.95: 死亡待确认（两阶段死亡流，先看临终叙事再确认跳墓志铭页）
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
var dbgActiveTab = 0          // v3.0.14aiij D035: 大浮窗顶部 tab 切换(0=AI原始 / 1=对话流 / 2=POLL / 3=渲染 / 4=场景)
var dbgSelectorOpen = false  // 折叠态点 DBG 图标弹出的"选组复制"弹层(已废, D035 改为直接展开大浮窗)
var dbgCopyToast = ''        // 复制成功的 toast（自动消失）
var dbgCopyToastTs = 0       // toast 时间戳
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

const TYPEWRITE_SPEED = 15   // v3.0.11: 每字符 15ms（流式下 LLM 100 TPS=10ms/字·需要打字机接近 LLM 速度）
const MAX_NARRATIVE_CHARS = 600  // 单次叙事最大字符数

// v3.0.14: 指针扫描抽 content（替代脆弱正则）
// 不依赖 JSON 闭合，能在流式未闭合时正确切分；不被 content 内的转义引号提前截断
function extractContent(raw) {
  if (!raw) return ''
  // 1. 剥 think / markdown 围栏
  let s = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*?(?={"content"|$)/g, '')
    .replace(/<think>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim()

  // 2. 找 "content" 字段起点
  const contentKey = s.indexOf('"content"')
  if (contentKey === -1) return ''
  const colon = s.indexOf(':', contentKey)
  if (colon === -1) return ''
  const quote1 = s.indexOf('"', colon)
  if (quote1 === -1) return ''

  // 3. 从 quote1+1 开始扫描，找 content 结束位置
  let i = quote1 + 1
  let out = ''
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      // 转义符：吞下一字符
      out += s[i] + s[i + 1]
      i += 2
      continue
    }
    if (ch === '"') {
      // 看后面是不是字段分隔（, / } / 空白 / 末尾）
      const next = s[i + 1]
      if (next === undefined || next === ',' || next === '}' || next === '\n' || next === ' ' || next === '\t' || next === '\r') {
        break  // 结束
      }
      out += ch  // content 内的裸 " 当字面量
      i++
      continue
    }
    out += ch
    i++
  }
  // 4. 解码转义
  return out.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

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
    streamedText = ''  // D048c: 保留兼容
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
    deathConfirmPending = false  // v0.6.95: 重置死亡确认状态
    monthChanged = false
    newEvent = null
    itemDetail = null

    initLayout()

    // v0.6.43: 本地即时计算榜单接近度（同步，不等云函数）
    closestBoardInfo = computeClosestBoard(state)
    fetchClosestBoard()  // 云函数后台刷新（稍后覆盖）

    // D049 修复 v3（2026-06-29 14:05 拍板）：从云端恢复时不调 callAI
    // 之前：game.init 总是调 callAI('初始回合') → 先生点"踏入长河"（有云端存档）也走重新生成
    // 修复：identity.fromCloud = true 时跳过 callAI，恢复 narrativeHistory 让玩家看到上次剧情
    if (id.fromCloud && id.cloudNarrateHistory && Array.isArray(id.cloudNarrateHistory) && id.cloudNarrateHistory.length > 0) {
      narrativeHistory = id.cloudNarrateHistory
      // 找到最近 1 条 ai 消息作为 narrative 显示
      for (var hi = narrativeHistory.length - 1; hi >= 0; hi--) {
        var m = narrativeHistory[hi]
        if (m && m.role === 'ai' && m.content) {
          narrative = m.content
          break
        }
      }
      // 找到最近 1 轮的 options 恢复
      for (var hi2 = narrativeHistory.length - 1; hi2 >= 0; hi2--) {
        var m2 = narrativeHistory[hi2]
        if (m2 && m2.role === 'ai' && m2.options) {
          options = m2.options.slice(0, 3).map(function(label){ return { label: label, key: label } })
          break
        }
      }
      optionsAppearTime = 0  // 立即显示
      displayedChars = narrative.length
      displayStartTime = Date.now()
      console.log('[D049-fix-v3] game.init 从云端恢复, history=', narrativeHistory.length, '条, narrative 长度=', narrative.length)
    } else {
      // 首次调用 AI
      callAI('初始回合')
    }

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
  // v3.0.14h-fix: 死亡后禁止再调 LLM（先生 18:48 反馈"死了继续有选项继续走剧情"）
  // 之前 alive=false 后选项还在 → 玩家点选项又调 callAI → 死循环
  // 修复：alive=false 时设 deathConfirmPending=true（不调 LLM，让玩家点屏幕走流程）
  if (!state.alive) {
    deathConfirmPending = true
    loading = false
    return
  }
  // v0.6.50j 寿限检测：寿限已至 → 注入临终 system message
  // v3.0.14n-fix: 删掉"生成墓志铭写入 epitaph 字段"（先生 19:25 拍板·方案A）
  // epitaph 由独立的 ai_write_death 云函数生成（玩家点封笔后调用）
  if (state.alive && state.lifespan && state.age >= state.lifespan && (state.health || 100) > 0) {
    narrativeHistory.push({
      role: 'system',
      content: '⚠ 寿限已至。这一轮玩家将自然离世。请在叙事中描写临终场景。',
    })
  }
  // v0.6.93: 用户消息先 push（在 AI 返回前）→ narrativeHistory 顺序变为 [user, ai, user, ai]
  // 修"顺序反"bug：之前 push user 在 handleAIResponse 里，导致 [ai, user, ai, user]，LLM 看到的 messages 顺序反了
  // 跳过 __retry__（D005 不污染对话流）
  if (userInput && userInput !== '__retry__') {
    narrativeHistory.push({ role: 'user', content: userInput })
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

  // v0.6.91: 去掉 v0.6.85 "最后一条 AI 用原始 JSON" 逻辑（先生 11:26 拍板）
  // 现在 history 直接用 narrativeHistory 原内容喂给 AI
  var historyForAi = narrativeHistory.slice(-12)

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
        pollNarrateResult(requestId, action, userInput, 0, Date.now())  // v3.0.14aic: 传 pollStartMs
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
// v3.0.10: 流式版本·每 1 秒轮询一次（流式期间 partial_content 累积显示）·done 后走原路径
// v3.0.14aic: 用 pollStartMs（函数级闭包）算真实秒数，不再用 debugLog.last.ts（脏数据）
function pollNarrateResult(requestId, action, userInput, attempt, pollStartMs) {
  if (pollStartMs == null) pollStartMs = Date.now()  // v3.0.14aic: 首次调用记录起点
  const MAX_ATTEMPTS = 120  // v3.0.14aiij: 60 秒兜底（POLL_INTERVAL_MS=500ms × 120 = 60s, 先生 23:55 拍板）
  const POLL_INTERVAL_MS = 500  // v3.0.14m: 500ms 高频轮询（先生 19:20 反馈"1 秒卡顿感强"）

  // v3.0.14aic: 用闭包里的 pollStartMs 算真实秒数（attempt*5 / debugLog.last.ts 都是错的）
  const elapsedSec = Math.floor((Date.now() - pollStartMs) / 1000)

  if (attempt >= MAX_ATTEMPTS) {
    loading = false
    // v0.2.3: 超时时填齐 debugLog
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.resultError = `[POLL_TIMEOUT] 超时 ${elapsedSec} 秒（attempt=${attempt}/${MAX_ATTEMPTS}）, ts=${Date.now()}, elapsed_ms=${Date.now() - last.ts}`
      last.poll_attempts = attempt
    }
    errorMsg = `史官落笔太久没回音（已等 ${elapsedSec} 秒）。点此重试。`
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

        // D048c（2026-06-28 09:42 拍板）：删流式 partial_content 轮询块（callLLMStream 已删，后端无 partial 来源）
        // 前端拿到 done 后用前端假打字机：streamedText 累积完整 content + TYPEWRITE_SPEED 显示

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
              // D037（先生 2026-06-28 01:14 拍板 A 方案）：AI₂ 评分结果（attrPatch）从 worker 传过来, DBG tab 2 展示
              if (result.debug.attr_patch) last.attr_patch = result.debug.attr_patch
              if (result.debug.picked_branch) last.picked_branch = result.debug.picked_branch
              // D043：AI₂ prompt + raw response 也存 debug, DBG tab 1 展示
              if (result.debug.score_prompt) last.score_prompt = result.debug.score_prompt
              if (result.debug.score_raw_response) last.score_raw_response = result.debug.score_raw_response
              // D048o（先生 16:38 拍板·"我看不到后端"）：D048f 埋点推给前端 DBG
              if (result.debug.d048f_log) last.d048f_log = result.debug.d048f_log
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
          // v1.0.0 时代 24 次只够 12 秒（500ms × 24）—— 但 v3.0.14aip 改后 LLM 跑 19.9 秒 + CAP 写库滞后
          // D048m（2026-06-28 16:26 拍板·先生 16:19 报 [NOT_FOUND] attempt=25 elapsed=22.5s）：24 → 60 次（30 秒）
          // 留 5-8 秒缓冲，覆盖 22-25 秒的总耗时；超过 30 秒基本就是 worker 真挂了
          if (attempt < 60) {
            // v3.0.14aic: 用真实秒数（attempt*5 是错的，每跳 +5 秒不准）
            loadingText = `史官正在落笔…（已等 ${elapsedSec} 秒）`
            pollNarrateResult(requestId, action, userInput, attempt + 1, pollStartMs)
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
          pollNarrateResult(requestId, action, userInput, attempt + 1, pollStartMs)
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
        pollNarrateResult(requestId, action, userInput, attempt + 1, pollStartMs)
      },
    })
  }, POLL_INTERVAL_MS)
}

// ─────── 处理 AI 返回 ───────
function handleAIResponse(result, action, userInput) {
  loading = false
  // D048c（2026-06-28 09:42 拍板）：删 streamDone 引用（改回非流式）
  // v0.2.5-D: 每轮重置 system 行计数（v0.1.80 D008 system 进 narrativeHistory 但渲染层没 reset）
  // 之前会一直累计，导致 system 行越积越多
  systemLineCount = 0
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
        if (result.debug.perf_logs) last.perf_logs = result.debug.perf_logs
        // D037（先生 2026-06-28 01:14 拍板 A 方案）：attrPatch 从 worker 写进 debug, 前端 DBG tab 2 AI₂ 评分展示
        if (result.debug.attr_patch) last.attr_patch = result.debug.attr_patch
        if (result.debug.picked_branch) last.picked_branch = result.debug.picked_branch
        // D043：AI₂ prompt + raw response 写进 debug
        if (result.debug.score_prompt) last.score_prompt = result.debug.score_prompt
        if (result.debug.score_raw_response) last.score_raw_response = result.debug.score_raw_response
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

  // v3.0.7-fix: 成功路径也要填 perf_logs 到 debugLog（之前只填错误分支）
  if (debugLog.length > 0) {
    const last = debugLog[debugLog.length - 1]
    if (result.debug && result.debug.perf_logs) {
      last.perf_logs = result.debug.perf_logs
    }
  }

  // 1. 应用 AI 返回的 state 更新（含 AI₂ 评分的属性变化）
  if (newState) {
    // D048f（先生 2026-06-28 12:09 拍板·偶现 bug 排查）：merge 前打印关键字段
    // 排查"7岁→150岁"偶现 bug——比对 newState 实际值与 state 旧值
    if (typeof console !== 'undefined') {
      console.log('[D048f-debug] frontend merge: newState.age=', newState.age, ' newState.year=', newState.year, ' newState.month=', newState.month, ' state.age=', state.age, ' state.year=', state.year, ' state.month=', state.month)
    }
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

  // 2. 基础 patch（items/月—D046: patch 来源从 branch.patch 改 result.attr_patch(D036 后 AI₁ 不输出 patch)）
  const patch = (result && result.attr_patch) || {}
  // D010（先生 2026-06-24 19:41 拍板）：AI 叙事回合不写 epitaph，全部由 ai_write_death 独立生成
  // v0.6.50j 旧逻辑删除：if (patch.epitaph) state.epitaph = patch.epitaph
  // D010 落地（先生 2026-06-27 01:51 反馈"为啥死亡还会输出 epitaph"顺手清）

  // v0.6.43: 本地即时刷新榜单接近度（同步）+ 云函数后台刷新
  closestBoardInfo = computeClosestBoard(state)
  fetchClosestBoard()

  // 物品状态变化 — v10（D-1 改造）
  // 改：AI 用物品中文名（"茶包"）当 key，不再用 id
  // 改：数字 = 减 durability（0 时自动删物品）
  // 改：字符串 = 拼接到 desc 后缀
  // 改：对象 = 新增物品（v0.6.88）
  if (patch.items) {
    for (const [itemKey, change] of Object.entries(patch.items)) {
      // v0.6.88 新协议：对象 = 新增物品（不查已有，直接 push）
      if (change && typeof change === 'object') {
        const newItem = {
          id: change.id || ('new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
          name: change.name || itemKey,
          icon: change.icon || '📦',
          desc: change.desc || '一件未知的物品。',
          durability: typeof change.durability === 'number' ? change.durability : 100,
        }
        state.items.push(newItem)
        currentItems.push(newItem)
        // 飘字提示
        if (typeof spawnFloater === 'function') {
          spawnFloater('获得 ' + newItem.name, 'rgba(232,200,130,1)')
        }
        continue
      }
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
  // 先生 2026-06-27 01:51 拍板 A：临终只走 drawDeathConfirm 覆盖层路径
  // 不再 branch.options = ['封笔']，避免双路径打架（drawOptions 画的"封笔"+ drawDeathConfirm 覆盖层按钮）
  if (state.health <= 0 || newState && newState.alive === false) {
    state.alive = false
    alive = false
    branch.options = []  // 清空 options：玩家只能点 drawDeathConfirm 的"封笔"按钮
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
  // v0.6.93: 玩家选项 push 移到 callAI 入口（先生 11:40 拍板修"顺序反"bug）
  // 这里不再 push user，narrativeHistory 顺序：[user, ai, user, ai, ...]

  // D049 修复 v5（2026-06-30 00:42 拍板）：存档移到 narrativeHistory.push ai 之后
  // 真因：之前 autoSaveToCloud 在 line 815（narrativeHistory.push ai 之前）
  //   → autoSaveToCloud 调 buildNarrateHistoryList 时 narrativeHistory 还没 ai 消息
  //   → 永远只存 [user] 或 []（narrate_history_list 空）
  //   → narrate_history 集合 0 条（v4 修复后 player_save 成功了，但 narrate_history 仍 0）
  // 修复：存档移到 push ai 之后（先生重进时能恢复上次剧情）
  autoSaveToCloud()

  // 5. round 计数 +1（P1.6: AI 响应后递增）
  state.round = (state.round || 0) + 1

  // 5.5 异步加载背景图（不阻塞叙事显示）
  fetchBgImage(branch.content || '')

  // 6. 准备显示
  // 系统状态变化不进 narrative 字符串（前端不显示 [system · XXX] 文字）
  // system message 仍然进 narrativeHistory（给 LLM 看）
  // D048c（2026-06-28 09:42 拍板）：恢复打字机
  // 改回 TYPEWRITE_SPEED 累加显示（前端假打字机：拿到完整 content 后逐字显示）
  const finalContent = (branch.content || '').slice(0, MAX_NARRATIVE_CHARS)
  if (streamedText && finalContent.length >= streamedText.length) {
    // 兼容：done 来了但 streamedText 已被 done 路径填过（不再发生——后端非流式，streamedText 始终为空）
    narrative = finalContent
    displayStartTime = Date.now() - streamedText.length * TYPEWRITE_SPEED
  } else {
    narrative = finalContent
    displayedChars = 0
    displayStartTime = Date.now()
  }
  streamedText = ''  // D048c: 保留变量（line 18/193 引用），无流式时始终为空
  systemLineCount = 0  // 前端不渲染 system 行
  userScrolledAway = false  // v0.6.85: 新叙事到达，重置用户手动滚动状态
  options = (branch.options || []).slice(0, 3).map(label => ({ label, key: label }))
  // D048c: 恢复打字机·选项等打字完再出（TYPEWRITE_SPEED × 字数 + 300ms）
  optionsAppearTime = displayStartTime + narrative.length * TYPEWRITE_SPEED + 300
  monthChanged = month_changed
  newEvent = event || null

  // D049b 阶段 3（2026-06-29 02:08 拍板）：自动调 player_save 存盘
  // D049c 阶段 2（2026-06-29 09:39 拍板）：删除此处——patch 应用时（line 785）已存
  //   删理由：先生要求"每次状态变化都独立存档"，寿限覆盖 line 782 后已统一调一次
  //   此处再调会重复（每回合 2 次 callFunction）
  // autoSaveToCloud()  // D049c 阶段 2 删除
}

// D049b 阶段 3：自动存档 helper
// D049d（2026-06-29 09:31 拍板）：删 state 纯前端缓存（player_life_cache）
// 改：失败时不再写 localStorage 兜底——先生依赖 player_load 拉云端 state
//     没 openid 时也不写缓存（依赖 wx.login code2Session 流程后续补）
function autoSaveToCloud() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return
  let openid = null
  try {
    openid = wx.getStorageSync && wx.getStorageSync('openid')
  } catch (e) { /* ignore */ }
  if (!openid) {
    // D049d：没 openid 时不再写 localStorage 兜底（D049b 阶段 3 是用 player_life_cache 兜底）
    // 后续先生 deploy wx.login code2Session 后才有 openid
    return
  }

  // 构造 player_life record（用 state 字段映射到 player_life 字段）
  const player_life = stateToPlayerLife(state)
  const player = { _id: openid, life_number: state.life_number || 1, created_at: Date.now(), updated_at: Date.now() }
  const narrate_history_list = buildNarrateHistoryList()

  wx.cloud.callFunction({
    name: 'player_save',
    data: { player, player_life, narrate_history_list },
    success: (res) => {
      if (res && res.result && res.result.success) {
        // 存档成功（不再写 localStorage 兜底）
        console.log('[D049b] player_save 成功, updated_at=', res.result.updated_at)
      } else {
        // D049d：失败时不再写 localStorage 兜底（先生依赖 player_load 拉云端）
        console.error('[D049b] player_save 失败:', (res && res.result && res.result.error) || 'unknown')
      }
    },
    fail: (err) => {
      // D049d：失败时不再写 localStorage 兜底
      console.error('[D049b] player_save 失败:', (err && (err.errMsg || err.message)) || 'unknown')
    },
  })
}

// D049b 阶段 3：state 转 player_life record
function stateToPlayerLife(s) {
  return {
    openid: (typeof wx !== 'undefined' && wx.getStorageSync) ? (wx.getStorageSync('openid') || '') : '',
    life_number: s.life_number || 1,
    alive: s.alive !== false,
    name: s.name || 'Unnamed',
    gender: (s.gender === '女' || s.gender === 'female') ? 'female' : 'male',
    age: s.age || 0,
    occupation: s.occupation || 'commoner',
    social_class: s.socialClass || s.social_class || 'commoner',
    dynasty: s.dynasty || '',
    era_display: s.eraDisplay || s.eraDisplay || '',
    city: s.city || 'unknown',
    year: s.year || 0,
    month: s.month || 1,
    health: s.health || 100,
    lifespan: s.lifespan || 70,
    reputation: s['声望'] || 0,
    wealth: s['财富'] || 0,
    knowledge: s['学识'] || 0,
    appearance: s['颜值'] || 0,
    medical: s['医术'] || 0,
    military: s['战功'] || 0,
    literary: s['文采'] || 0,
    political: s['政绩'] || 0,
    righteous: s['义行'] || 0,
    epitaph: s.epitaph || '',
    current_items: currentItems || [],
    created_at: s.created_at || Date.now(),
    updated_at: Date.now(),
  }
}

// D049b 阶段 3：把 narrativeHistory 转 narrate_history record 列表
function buildNarrateHistoryList() {
  if (!Array.isArray(narrativeHistory)) return []
  const list = []
  const openid = (typeof wx !== 'undefined' && wx.getStorageSync) ? (wx.getStorageSync('openid') || '') : ''
  for (let i = 0; i < narrativeHistory.length; i++) {
    const m = narrativeHistory[i]
    list.push({
      openid: openid,  // D049 修复 v7（2026-06-30 00:55 拍板）：narrate_history record 加 openid
      // 真因：之前只算了 openid 变量，list.push 时没写 → 云函数 validateNarrateHistory
      //   if (!record.openid || typeof record.openid !== 'string') return 'invalid_openid' 失败
      //   → 00:52:55 player_save 报 'narrate_history:invalid_openid'
      life_number: state.life_number || 1,
      message_id: m.message_id || (Date.now() + i),  // 用 message_id 字段或回退到时间戳
      role: m.role,
      content: String(m.content || ''),
      patch: m.patch || null,  // role='system' 时存
      options: m.options || null,  // role='ai' 时存
      created_at: m.created_at || Date.now(),
    })
  }
  return list
}

// ─────── 渲染 ───────

// v0.6.95: 死亡确认覆盖层（两阶段死亡流的第 1 段）
// 半透明黑色 + 大字"你死了" + "此生已终" + 确认按钮
function drawDeathConfirm(ctx) {
  const w = layout.windowW
  const h = layout.windowH

  // 半透黑遮罩（让玩家聚焦在确认提示上）
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, w, h)

  // 大字"你死了"
  ctx.fillStyle = COLORS.gold || 'rgba(200,168,124,1)'
  ctx.font = 'bold 32px ' + (ui.fontFamily || 'sans-serif')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('— 你死了 —', w / 2, h * 0.35)

  // 副提示
  ctx.fillStyle = 'rgba(232,221,208,0.75)'
  ctx.font = '14px ' + (ui.fontFamily || 'sans-serif')
  ctx.fillText('此生已终', w / 2, h * 0.35 + 40)

  // 确认按钮（屏幕底部 1/4 居中）
  const btnW = 180
  const btnH = 48
  const btnX = (w - btnW) / 2
  const btnY = h * 0.7
  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.25)'
  roundRect(ctx, btnX, btnY, btnW, btnH, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,168,124,0.6)'
  ctx.lineWidth = 1.5
  roundRect(ctx, btnX, btnY, btnW, btnH, 6)
  ctx.stroke()
  ctx.fillStyle = COLORS.gold || 'rgba(200,168,124,1)'
  ctx.font = 'bold 18px ' + (ui.fontFamily || 'sans-serif')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('封 笔', btnX + btnW / 2, btnY + btnH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()

  // 保存按钮 bounds 给 onTouch 用
  layout._deathConfirmBtn = { x: btnX, y: btnY, w: btnW, h: btnH }
}

function render(ctx) {
  if (!ctx || !layout) return

  // v0.1.66 流式布局：根据当前 narrative 长度动态算画区 + 文字面板高度
  adjustFluidLayout()

  // v0.6.95: 死亡确认覆盖层（两阶段死亡流）
  // 玩家第一次点屏幕触发死亡 → 显示"你死了"+ 确认按钮（不淡出，让玩家看临终叙事）
  if (deathConfirmPending && !fadeOut) {
    drawDeathConfirm(ctx)
  }

  // 淡出处理（死亡时）
  if (fadeOut) {
    const elapsed = Date.now() - fadeOut.start
    const p = Math.min(1, elapsed / fadeOut.duration)
    ctx.fillStyle = 'rgba(0,0,0,' + p + ')'
    ctx.fillRect(0, 0, layout.windowW, layout.windowH)
    if (p >= 1) {
      // v0.6.97: 传 deathCause + epRecord + epitaph + deathType + highestAchievement 给 death scene
      module.exports.autoNext = {
        scene: 'death',
        identity: state,
        deathCause: state.deathCause || '',
        epRecord: state.epRecord || '',
        epitaph: state.epitaph || '',
        deathType: state.deathType || '意外',
        highestAchievement: computeHighestAchievement(state),
      }
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

  const typingDone = narrative && displayedChars >= narrative.length  // D048c: 改回非流式（仅按 narrative 算）
  const optReserveH = typingDone ? optBlockH : 0
  const optionGap = 3
  const lineHeight = 22
  const fontSize = 15
  const innerW = layout.windowW - layout.padding * 2 - 24
  const charPerLine = Math.max(8, Math.floor(innerW / fontSize))

  // 文字行数按 narrative 完整字符数算
  // D048c（2026-06-28 09:42 拍板）：改回非流式（仅按 narrative 算）
  let lineCount = 2
  const sourceText = narrative  // D048c: 删流式分支
  if (sourceText) {
    const paras = sourceText.split('\n')
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
  // D048n（2026-06-28 16:36 拍板·修"选项不渲染"bug）：每帧写 debug 字段让 DBG 看到 typingDone 状态
  // 先生反馈 16:34 narrative 完整显示但选项不出现——之前 drawOptions_debug 依赖 drawOptions 被调
  // 实际可能 fadeIn<=0 早 return 导致 drawOptions 永不被调，drawOptions_debug 字段写不出来
  // 现在独立写每帧状态到 debugLog，DBG 场景 tab 必能看到
  if (debugLog.length > 0) {
    const last = debugLog[debugLog.length - 1]
    if (last) {
      last.typewriter_debug = `typingDone=${typingDone}, narrative.length=${narrative.length}, displayedChars=${displayedChars}, optionsAppearTime-offset=${optionsAppearTime - Date.now()}, options.length=${options.length}`
    }
  }
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
  // v3.0.14aid: 把叙事场景描述(hint+city)放最前 — flux 模型对 prompt 头部响应最强, 先生 22:54 反馈"图都一样"是 p1/p2 风格标签太靠前压住了叙事
  const city = state.city || ''
  const sceneDesc = [hint, city].filter(Boolean).join(', ')
  const p1 = cfg.style
  const p2 = cfg.elements
  // 固定水墨质感参数
  const suffix = 'ink wash, monochrome, rice paper texture, no text, no watermark, masterpiece, --ar 3:2'
  return [sceneDesc, p1, p2, suffix].filter(Boolean).join(', ')
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

  // v3.0.14aid: 每轮把画图 prompt / url / seed / 加载结果写进 debugLog（先生 22:54 反馈"图都一样"要看到底是不是 prompt 在变）
  if (debugLog.length > 0) {
    const last = debugLog[debugLog.length - 1]
    last.bg_prompt = prompt
    last.bg_url = url
    last.bg_seed = seed
    last.bg_dynasty = era
    last.bg_city = city
    last.bg_narrative_hint = hint
  }

  bgImageLoading = true
  if (bgImgEl) { try { bgImgEl.src = '' } catch(e) {} }
  bgImgEl = typeof wx.createImage === 'function' ? wx.createImage() : new Image()
  bgImgEl.onload = () => {
    bgImageLoading = false
    bgImage = url
    imageRevealStart = Date.now()  // v0.6.50g: 开始从上到下展开
    // v3.0.14aid: 加载成功也填 debugLog（区分"prompt 没变"vs"prompt 变了但 flux 输出相似"）
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.bg_load = 'ok'
    }
  }
  bgImgEl.onerror = () => {
    bgImageLoading = false
    console.warn('Pollinations 加载失败:', url.slice(0, 80))
    if (debugLog.length > 0) {
      const last = debugLog[debugLog.length - 1]
      last.bg_load = 'fail'
    }
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
  // v0.6.91: 删掉画区左上角"画 · 北宋"朱砂章文字（先生 11:23 拍板）
  ctx.save()
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

// v0.6.96: 计算本世最高成就（基于榜单）
// 优先找已上榜的（on=true），没上榜用最近的一个
function computeHighestAchievement(st) {
  if (!st) return null
  // 先扫已上榜
  for (var name in BOARD_THRESHOLDS) {
    var score = calcBoardScore(st, name)
    if (score >= BOARD_THRESHOLDS[name]) {
      return { name: name, on: true, score: score }
    }
  }
  // 没上榜 → 用最近的一个
  var closest = computeClosestBoard(st)
  if (closest) {
    return { name: closest.name, on: false, diff: closest.diff, targetPerson: closest.targetPerson }
  }
  return null
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
  // D048c（2026-06-28 09:42 拍板）：改回非流式（仅用 narrative）
  const displaySrc = narrative  // D048c: 删流式分支

  // v0.2.5-P（先生 2026-06-13 11:49 拍板）：loading=true 且 narrative="" 时显示"史官正在落笔..."
  // 之前 v0.2.5-D 删了 drawLoading 调用，注释说"由 narrative 区显示"，但代码里没实现
  // 结果：玩家点选项后叙事区一片空白，等 30+ 秒才有反应，体感很差
  // 修复：loading 分支画 loadingText + 毛笔蘸墨动画（复用 drawLoading 里的动画逻辑）
  if (!displaySrc) {
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
  const totalChars = displaySrc.length
  // D048c（2026-06-28 09:42 拍板）：恢复打字机（前端假打字机）
  // 拿到完整 content 后按 TYPEWRITE_SPEED 累加显示
  const targetChars = Math.min(totalChars, Math.floor(elapsed / TYPEWRITE_SPEED))
  displayedChars = targetChars

  const text = displaySrc.slice(0, displayedChars)

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

  // v3.0.14ai-dbg: 每帧填一次 drawOptions 调试字段（只记首次进入，避免刷爆）
  if (debugLog.length > 0) {
    const last = debugLog[debugLog.length - 1]
    if (!last.drawOptions_called) {
      last.drawOptions_called = true
      last.drawOptions_debug = `options.length=${options.length}, fadeIn=${fadeIn}, optionY=${layout.optionY}, displayedChars=${displayedChars}, narrative.length=${narrative.length}, streamedText.length=${(streamedText||'').length}`
    }
  }

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

// v3.0.14ai-dbg: 5 组复制（先生 02:34 拍板"以后每加 DBG 数据都要有按钮可以复制"）
// 折叠态点 DBG 图标先弹选组弹层（不发全量，文字太多微信发不过去）
const DBG_COPY_MAX = 1500  // 微信消息字数限制，截断到 1500 字
function dbgTrunc(s) {
  if (typeof s !== 'string') s = JSON.stringify(s, null, 2)
  if (s.length > DBG_COPY_MAX) return s.slice(0, DBG_COPY_MAX) + '\n... [已截断，共 ' + s.length + ' 字]'
  return s
}

// D048i（2026-06-28 13:39 拍板·先生反馈 AI₂ 评分 tab 复制报 parameter error）：
// wx.setClipboardData 在 iOS 上会拒绝含控制字符的 data（除 \n \r \t 外）
// scorePrompt 4960 字符里可能含其他 control chars（来自 LLM 推理或云函数日志）
// 过滤掉非换行/制表的控制字符再给 wx
// D048l（2026-06-28 16:16 拍板·先生反馈对话流 tab 也复制失败）：
//  还需过滤 0x7F (DEL) + 0xC2 0xA0 (NBSP 不间断空格，UTF-8 二字节) iOS wx 也拒
function dbgSafeForClipboard(s) {
  if (typeof s !== 'string') return String(s || '')
  // eslint-disable-next-line no-control-regex
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // 单字节控制字符 + DEL
    .replace(/\u00A0/g, ' ')                              // NBSP (0xC2 0xA0) → 普通空格
}
function dbgGetLast() {
  return debugLog.length > 0 ? debugLog[debugLog.length - 1] : null
}
// D037（先生 2026-06-28 01:14 拍板 A 方案）：5 个 dbgCopy 函数对应 5 个 tab
function dbgCopyAIActual() {
  const last = dbgGetLast()
  return last && last.raw_response ? `[AI₁ 原始返回]\n${dbgTrunc(last.raw_response)}` : '[AI₁ 原始返回] 无数据'
}
function dbgCopyScoringAI() {
  const last = dbgGetLast()
  // D043：tab 1 复制时同时含 prompt + raw + attrPatch
  if (!last) return '[AI₂] 无数据'
  let txt = ''
  if (last.score_prompt) txt += `[AI₂ scorePrompt]\n${dbgTrunc(last.score_prompt)}\n\n`
  if (last.score_raw_response) txt += `[AI₂ raw_response]\n${dbgTrunc(last.score_raw_response)}\n\n`
  if (last.attr_patch) txt += `[AI₂ attrPatch]\n${dbgTrunc(JSON.stringify(last.attr_patch, null, 2))}`
  return txt || '[AI₂] 无数据'
}
function dbgCopyHistory() {
  const last = dbgGetLast()
  if (last && last.messages_to_ai) return `[对话流]\n${dbgTrunc(JSON.stringify(last.messages_to_ai, null, 2))}`
  return '[对话流] 无数据'
}
function dbgCopyPollStatus() {
  const last = dbgGetLast()
  const status = last ? (last.resultError || ('round=' + (last.round||'?') + ', result=' + (last.result?'OK':'null'))) : 'no last round'
  const perfMs = last && last.perf_logs ? last.perf_logs.map(p => `${p.stage}=${p.ms}ms`).join(', ') : ''
  return `[POLL 状态]\n${dbgTrunc(status)}\n[PERF] ${perfMs || '无'}`
}
function dbgCopyScene() {
  const last = dbgGetLast()
  const _st = state || {}
  return `[场景状态]\nround=${_st.round||0}, month=${_st.month||1}, year=${_st.year||'?'}, age=${_st.age||'?'}, alive=${alive}, debugLog.length=${debugLog.length}, currentItems=${(currentItems||[]).length}`
}
function dbgDoCopy(text) {
  if (typeof wx !== 'undefined' && wx.setClipboardData) {
    wx.setClipboardData({ data: text, success: () => { dbgCopyToast = '已复制到剪贴板 ✓'; dbgCopyToastTs = Date.now() } })
  } else {
    // 浏览器 mock 兜底
    if (typeof console !== 'undefined') console.log('[DBG 复制]', text)
    dbgCopyToast = '已复制到控制台（mock 环境）'
    dbgCopyToastTs = Date.now()
  }
}
function drawDebugPanel(ctx) {
  if (debugLog.length === 0) return

  // D035（先生 2026-06-27 23:55 拍板 A 方案）：折叠态点 DBG 直接进大浮窗（顶部 tab 切换）, 去掉选组弹层
  // if (dbgSelectorOpen) { drawDbgSelector(ctx); return }  // 已废

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

  // D039（先生 2026-06-28 01:29 拍板）：tab 按钮放底部, 顶部只保留标题+关闭（避免灵动岛冲突）
  const TAB_LABELS = ['AI₁ 叙事', 'AI₂ 评分', '对话流', 'POLL', '场景']
  const arrowSize = 28
  // 顶部条：只显示标题 + 关闭按钮
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('DBG · ' + TAB_LABELS[dbgActiveTab], 12, closeBarH / 2)
  ctx.textAlign = 'right'
  // 关闭按钮（顶部右）
  ctx.fillStyle = 'rgba(192,80,80,0.32)'
  ctx.fillRect(w - arrowSize - 8, 2, arrowSize, closeBarH - 4)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('×', w - arrowSize / 2 - 8, closeBarH / 2 + 1)
  layout._dbgCloseBtn = { x: w - arrowSize - 8, y: 0, w: arrowSize, h: closeBarH }
  // 错误轮数角标（顶部右）
  ctx.textAlign = 'right'
  ctx.fillStyle = '#888'
  ctx.font = '11px sans-serif'
  ctx.fillText('最近 1 轮', w - arrowSize - 24, closeBarH / 2)
  const lastRound = debugLog[debugLog.length - 1]
  if (lastRound && lastRound.resultError) {
    ctx.fillStyle = '#ff6060'
    ctx.font = 'bold 11px monospace'
    ctx.fillText('❌ 出错', w - arrowSize - 24, closeBarH / 2 + 16)
  }

  // 底部条（高度 44px）：5 个 tab + 复制本tab + ▲▼ 滚动箭头
  const bottomBarH = 44
  // D048g（2026-06-28 13:23 拍板·先生骂我是蠢货）：底部条上移 34px 避 iOS Home Indicator
  // D039 拍板"tab 放底部"时没考虑小白条占位，现在补上
  // 34px = iPhone 14 Pro+ Home Indicator 高度（其他 iPhone 同样 34px，Android 全面屏也兼容）
  const bottomBarY = h - bottomBarH - 34
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, bottomBarY, w, bottomBarH)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, bottomBarY + 0.5)
  ctx.lineTo(w, bottomBarY + 0.5)
  ctx.stroke()

  const tabBtnH2 = 20  // D048j（2026-06-28 13:46 拍板·修两行重叠）：tab 高 36→20（20×2+2=42<44 bottomBarH，不重叠）
  const tabBtnGap2 = 4
  // D048h（2026-06-28 13:27 拍板）：DBG 底部条改两行布局
  //  - 上行：5 个 tab（高 20，不与右侧按钮挤）
  //  - 下行：复制本tab + ▲▼ 滚动箭头（高 20）
  // 修前：单行 5tab(56) + 复制(64) + ▲▼ 拼 296+168px → 屏宽 393 不够 → 第一 tab 溢出
  // D048j：上版本 tab 高 36，两行重叠 16px。现改 20。
  const row1Y = bottomBarY + 2          // 上行（5 tab）y=[bottomBarY+2, bottomBarY+22]
  const row2Y = bottomBarY + 22         // 下行（复制+箭头）y=[bottomBarY+22, bottomBarY+42]

  // ─── 上行：5 个 tab（占满整行，56px 宽 × 5 = 280，4 gap = 16，总 296，剩 97px 给边距）───
  // 重新算：393 / 5 = 78px 每个更宽松，但保持 56 兼容布局
  const tabBtnW2 = Math.floor((w - 12) / 5)  // 自适应屏宽：屏宽 393 → 76px
  let _curTabX = 6
  layout._dbgTabs = []
  for (let _ti = 0; _ti < 5; _ti++) {
    const isActive = _ti === dbgActiveTab
    ctx.fillStyle = isActive ? 'rgba(240,200,120,0.45)' : 'rgba(240,200,120,0.12)'
    ctx.fillRect(_curTabX, row1Y, tabBtnW2, tabBtnH2)
    ctx.strokeStyle = isActive ? '#f0c878' : 'rgba(240,200,120,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(_curTabX, row1Y, tabBtnW2, tabBtnH2)
    ctx.fillStyle = isActive ? '#fff' : '#f0c878'
    ctx.font = isActive ? 'bold 11px sans-serif' : '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(TAB_LABELS[_ti], _curTabX + tabBtnW2 / 2, row1Y + tabBtnH2 / 2 + 1)
    layout._dbgTabs.push({ x: _curTabX, y: row1Y, w: tabBtnW2, h: tabBtnH2, tabIdx: _ti })
    _curTabX += tabBtnW2
  }

  // ─── 下行：右侧 ▲(28) + 复制本tab(64) + ▼(28) ───
  const upBtnX = w - arrowSize * 2 - 8
  const copyTabBtnW = 64
  const copyTabBtnX = upBtnX - copyTabBtnW - tabBtnGap2
  const downBtnX = w - arrowSize - 4

  // "复制本 tab"按钮
  ctx.fillStyle = 'rgba(240,200,120,0.32)'
  ctx.fillRect(copyTabBtnX, row2Y, copyTabBtnW, tabBtnH2)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('复制本tab', copyTabBtnX + copyTabBtnW / 2, row2Y + tabBtnH2 / 2 + 1)
  layout._dbgCopyTabBtn = { x: copyTabBtnX, y: row2Y, w: copyTabBtnW, h: tabBtnH2 }

  // ▲▼ 滚动箭头（底部右侧）
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(upBtnX, row2Y, arrowSize, tabBtnH2)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('▲', upBtnX + arrowSize / 2, row2Y + tabBtnH2 / 2 + 1)
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(downBtnX, row2Y, arrowSize, tabBtnH2)
  ctx.fillStyle = '#f0c878'
  ctx.fillText('▼', downBtnX + arrowSize / 2, row2Y + tabBtnH2 / 2 + 1)
  // 把 upBtn / downBtn 信息存到 layout 让 onTouch 用
  layout._dbgUpBtn = { x: upBtnX, y: row2Y, w: arrowSize, h: tabBtnH2 }
  layout._dbgDownBtn = { x: downBtnX, y: row2Y, w: arrowSize, h: tabBtnH2 }

  // 内容区（D039：减去底部 tab 条高度 bottomBarH）
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, closeBarH, w, h - closeBarH - bottomBarH)
  ctx.clip()

  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#c0c0c0'

  // D035（先生 2026-06-27 23:55 拍板 A 方案）：按 tab 筛选字段, 不再一锅炖
  //   tab 0 = AI原始返回 (raw_response + all_branches + ERROR)
  //   tab 1 = 对话流     (messages_to_ai + system_prompt + 玩家输入)
  //   tab 2 = POLL       (perf_logs + poll_attempts + poll status)
  //   tab 3 = 渲染       (BG prompt/url/seed + drawOptions_debug)
  //   tab 4 = 场景       (state 全字段 + debugLog.length + currentItems)
  let allText = ''
  const startIdx = Math.max(0, debugLog.length - 1)
  for (let i = startIdx; i < debugLog.length; i++) {
    const d = debugLog[i]
    const errMark = d.resultError ? '❌ [出错] ' : '✅ '
    allText += `${errMark}== 第 ${i + 1}/${debugLog.length} 轮 round=${d.round} ==\n`
    const stateStr = d.data && d.data.state ? `[朝代=${d.data.state.dynasty || '?'} 身份=${d.data.state.occupation || '?'} 年=${d.data.state.year || '?'} 月=${d.data.state.month || '?'} 历史=${(d.data.history || []).length}条]` : ''
    allText += `${stateStr}\n`
    allText += `[INPUT 玩家选项]: ${d.input || '(空)'}\n`
    allText += `[is_retry]: ${d.data && d.data.is_retry ? 'true' : 'false'}, [action]: ${d.action || '?'}\n`

    if (dbgActiveTab === 0) {
      // tab 0 = AI₁ 叙事返回（叙事 AI 原始输出）
      if (d.raw_response) allText += `[AI₁ 原始返回]:\n${d.raw_response}\n\n`
      if (d.all_branches && d.all_branches.length > 0) {
        allText += `[AI₁ 生成 ${d.all_branches.length} 个分支]:\n`
        d.all_branches.forEach((b, j) => {
          allText += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
        })
      }
      if (d.picked_branch) {
        allText += `[AI₁ 选中分支]:\n  content: ${(d.picked_branch.content || '').slice(0, 200)}...\n  options: ${JSON.stringify(d.picked_branch.options)}\n\n`
      }
      if (d.resultError) allText += `\n╔════ ERROR ════╗\n${d.resultError}\n╚════════════════╝\n\n`
    } else if (dbgActiveTab === 1) {
      // tab 1 = AI₂ 评分（attrPatch: 9 属性 + month_delta + items, D036 patch 字段从叙事 AI 拆出）
      if (d.score_prompt) {
        allText += `[AI₂ scorePrompt] (长度 ${d.score_prompt.length}):\n${d.score_prompt}\n\n`
      }
      if (d.score_raw_response) {
        allText += `[AI₂ raw_response]:\n${d.score_raw_response}\n\n`
      }
      if (d.attr_patch) {
        allText += `[AI₂ attrPatch 完整 JSON]:\n${JSON.stringify(d.attr_patch, null, 2)}\n\n`
        if (d.attr_patch.month_delta !== undefined) allText += `[AI₂ month_delta] ${d.attr_patch.month_delta}\n`
        if (d.attr_patch.items) allText += `[AI₂ items] ${JSON.stringify(d.attr_patch.items)}\n`
        const attrs = ['声望', '财富', '学识', '颜值', '医术', '战功', '文采', '政绩', '义行']
        for (const a of attrs) {
          if (d.attr_patch[a] !== undefined) allText += `[AI₂ ${a}] ${d.attr_patch[a] >= 0 ? '+' : ''}${d.attr_patch[a]}\n`
        }
      } else {
        allText += '[AI₂ attrPatch] 无数据(可能 AI₂ 未调用或失败)\n'
      }
    } else if (dbgActiveTab === 2) {
      // tab 2 = 对话流（messages_to_ai 完整, 含 system prompt）
      if (d.messages_to_ai && d.messages_to_ai.length > 0) {
        allText += `[发给 AI₁ 的 messages]:\n`
        d.messages_to_ai.forEach((m, j) => {
          allText += `  ── messages[${j}].role="${m.role}" ──\n${m.content}\n\n`
        })
      } else {
        allText += '[messages_to_ai] 无数据\n'
      }
    } else if (dbgActiveTab === 3) {
      // tab 3 = POLL + 性能诊断
      if (d.poll_attempts !== undefined) allText += `[poll_attempts]: ${d.poll_attempts}, [poll_elapsed_ms]: ${d.poll_elapsed_ms || 0}\n`
      if (d.perf_logs && d.perf_logs.length > 0) {
        allText += `⏱️ [PERF 延迟诊断]\n`
        for (const p of d.perf_logs) {
          if (p.ms !== undefined) {
            allText += `  ${p.stage}: ${p.ms}ms${p.model ? ' (' + p.model + ')' : ''}${p.prompt_chars ? ' prompt=' + p.prompt_chars : ''}${p.score_prompt_chars ? ' prompt=' + p.score_prompt_chars : ''}${p.first_chunk_ms !== undefined && p.first_chunk_ms >= 0 ? ' first_chunk=' + p.first_chunk_ms + 'ms' : ''}\n`
          } else if (p.value !== undefined) {
            allText += `  ${p.stage}: ${p.value}\n`
          }
        }
      }
      if (d.poll_status) allText += `[poll_status]: ${d.poll_status}\n`
    } else if (dbgActiveTab === 4) {
      // tab 4 = 场景（合并旧 tab 3 渲染 + 旧 tab 4 场景）
      // A: 渲染信息
      if (d.bg_prompt) {
        allText += `── 渲染 ──\n`
        allText += `[BG_DRAW] dynasty=${d.bg_dynasty || '?'}, city=${d.bg_city || '?'}, seed=${d.bg_seed}, load=${d.bg_load || 'pending'}\n`
        allText += `[BG_PROMPT] ${d.bg_prompt}\n`
        allText += `[BG_HINT] ${d.bg_narrative_hint || ''}\n`
        allText += `[BG_URL] ${d.bg_url}\n\n`
      }
      if (d.drawOptions_debug) allText += `[drawOptions_debug]\n${d.drawOptions_debug}\n`
      if (d.typewriter_debug) allText += `[typewriter_debug]\n${d.typewriter_debug}\n`
      if (d.d048f_log) allText += `[D048f 偶现 bug 埋点]\n${d.d048f_log}\n`
      if (d.layout_debug) allText += `[layout]\n${d.layout_debug}\n\n`
      // B: state 全字段
      const _st = state || {}
      const sKeys = Object.keys(_st).sort()
      allText += `── 场景状态 ──\n[state 全字段 ${sKeys.length} 个]:\n`
      for (const k of sKeys) {
        const v = _st[k]
        const vStr = typeof v === 'object' ? JSON.stringify(v) : String(v)
        allText += `  ${k}: ${vStr.length > 100 ? vStr.slice(0, 100) + '...' : vStr}\n`
      }
      allText += `[debugLog.length]: ${debugLog.length}\n`
      allText += `[currentItems.length]: ${(currentItems || []).length}\n`
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
    else if (line.startsWith('⏱️')) ctx.fillStyle = '#ff6060'  // v3.0.7: PERF 红色高亮
    else if (line.startsWith('  ') && line.indexOf('ms=') > 0) ctx.fillStyle = '#ff9090'  // PERF 行亮红
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

// v3.0.14ai-dbg: 选组复制弹层（折叠态点 DBG 图标触发）
// 5 组按钮（每组复制对应数据到剪贴板）+ 1 个"完整大浮窗"按钮
// 弹层在 DBG 图标附近弹一个 200×260 的小窗，不抢屏
function drawDbgSelector(ctx) {
  const w = layout.windowW
  const h = layout.windowH
  const safeTop = layout.safeTop || 0
  const topBarH = layout.topBarH || 0

  // 半透遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, w, h)

  // 弹层位置（DBG 图标下方）
  const panelW = 220
  const panelH = 360
  const panelX = w - layout.padding - 12 - panelW
  const panelY = safeTop + topBarH + 32
  const headerH = 36
  const footerH = 40
  const btnH = 40
  const btnGap = 6

  // 弹层底
  ctx.fillStyle = 'rgba(20,15,25,0.97)'
  roundRect(ctx, panelX, panelY, panelW, panelH, 8)
  ctx.fill()
  ctx.strokeStyle = '#f0c878'
  ctx.lineWidth = 1.2
  roundRect(ctx, panelX, panelY, panelW, panelH, 8)
  ctx.stroke()

  // 弹层标题
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 14px "STKaiti", "KaiTi", "楷体", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('DBG 选组复制', panelX + panelW / 2, panelY + headerH / 2 + 1)

  // 5 组按钮（先生 02:36 拍板：5 组够）
  const groups = [
    { label: 'AI 原始返回', copy: dbgCopyAIActual },
    { label: '对话流', copy: dbgCopyHistory },
    { label: 'POLL 状态', copy: dbgCopyPollStatus },
    { label: 'DEBUG 渲染', copy: dbgCopyRender },
    { label: '场景状态', copy: dbgCopyScene },
  ]
  let curY = panelY + headerH + 10
  const btnX = panelX + 12
  const btnW = panelW - 24
  layout._dbgSelBtns = []  // 清空旧 bounds
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    // 按钮底（半透金色）
    ctx.fillStyle = 'rgba(240,200,120,0.18)'
    roundRect(ctx, btnX, curY, btnW, btnH, 5)
    ctx.fill()
    ctx.strokeStyle = 'rgba(240,200,120,0.4)'
    ctx.lineWidth = 1
    roundRect(ctx, btnX, curY, btnW, btnH, 5)
    ctx.stroke()
    // 文字
    ctx.fillStyle = '#f0c878'
    ctx.font = '13px "STKaiti", "KaiTi", "楷体", sans-serif'
    ctx.fillText(g.label, btnX + btnW / 2, curY + btnH / 2 + 1)
    // 保存 bounds 给 onTouch 用
    layout._dbgSelBtns.push({ x: btnX, y: curY, w: btnW, h: btnH, copy: g.copy })
    curY += btnH + btnGap
  }

  // 底部"完整大浮窗"按钮 + "关闭"按钮
  const footerY = panelY + panelH - footerH - 8
  // 完整大浮窗按钮（蓝色高亮）
  const fullBtnW = (panelW - 24 - 8) / 2
  ctx.fillStyle = 'rgba(120,180,240,0.22)'
  roundRect(ctx, btnX, footerY, fullBtnW, 32, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,180,240,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, btnX, footerY, fullBtnW, 32, 5)
  ctx.stroke()
  ctx.fillStyle = '#a0d0f0'
  ctx.font = '12px sans-serif'
  ctx.fillText('完整大浮窗', btnX + fullBtnW / 2, footerY + 16 + 1)
  layout._dbgSelFullBtn = { x: btnX, y: footerY, w: fullBtnW, h: 32 }

  // 关闭按钮
  const closeBtnX = btnX + fullBtnW + 8
  ctx.fillStyle = 'rgba(192,80,80,0.22)'
  roundRect(ctx, closeBtnX, footerY, fullBtnW, 32, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(192,80,80,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, closeBtnX, footerY, fullBtnW, 32, 5)
  ctx.stroke()
  ctx.fillStyle = '#e0a0a0'
  ctx.fillText('关闭', closeBtnX + fullBtnW / 2, footerY + 16 + 1)
  layout._dbgSelCloseBtn = { x: closeBtnX, y: footerY, w: fullBtnW, h: 32 }

  // toast（复制成功提示，2 秒自动消失）
  if (dbgCopyToast && Date.now() - dbgCopyToastTs < 2000) {
    const toastY = panelY + panelH + 8
    const toastH = 28
    const toastW = 180
    const toastX = panelX + (panelW - toastW) / 2
    ctx.fillStyle = 'rgba(40,80,40,0.92)'
    roundRect(ctx, toastX, toastY, toastW, toastH, 4)
    ctx.fill()
    ctx.fillStyle = '#c0e8a0'
    ctx.font = '12px sans-serif'
    ctx.fillText(dbgCopyToast, toastX + toastW / 2, toastY + toastH / 2 + 1)
  } else if (dbgCopyToast) {
    dbgCopyToast = ''
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
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

  // 详情面板（居中）— v0.6.88: 加"使用"按钮，高度 220→260
  const pw = Math.min(280, w - 40)
  const ph = 260
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

  // 底部"使用"按钮 + 关闭提示（v0.6.88）
  // 按钮在面板内右下角，点击触发 useItem
  const btnW = 80
  const btnH = 32
  const btnX = px + pw - btnW - 16
  const btnY = py + ph - btnH - 16
  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.25)'
  roundRect(ctx, btnX, btnY, btnW, btnH, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,168,124,0.55)'
  ctx.lineWidth = 1
  roundRect(ctx, btnX, btnY, btnW, btnH, 4)
  ctx.stroke()
  ctx.fillStyle = COLORS.gold
  ctx.font = '14px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('使 用', btnX + btnW / 2, btnY + btnH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
  // 保存按钮 bounds 给 onTouch 用
  itemDetail.useBtn = { x: btnX, y: btnY, w: btnW, h: btnH }

  // 关闭提示
  ctx.fillStyle = 'rgba(200,168,124,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText('轻点空白处关闭', px + 16, py + ph - 12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

var scrollStartOffset = 0
var isScrolling = false
var touchStartTime = 0

// v0.6.96: 死亡时调 ai_write_death 写死因+墓志铭，拿到结果再跳 death scene
// 1. 判定 deathType（意外/寿终/社会性）
// 2. 调云函数 ai_write_death 拿 deathCause + epitaph
// 3. 写进 state，触发 fadeOut → 跳 death scene
function callWriteDeathAndGo() {
  // 判定 deathType
  let deathType = '意外'
  if (state.lifespan && state.age >= state.lifespan) {
    deathType = '寿终'
  } else {
    // 检查 8 属性是否全 0（社会性死亡）
    const DEATH_ATTRS = ['声望', '财富', '学识', '医术', '战功', '文采', '政绩', '义行']
    let allZero = true
    for (const a of DEATH_ATTRS) {
      if ((state[a] || 0) > 0) { allZero = false; break }
    }
    if (allZero) deathType = '社会性'
  }

  console.log('[game.js] 调 ai_write_death, deathType=', deathType)

  if (typeof wx === 'undefined' || !wx.cloud) {
    // 非微信环境（调试）→ 跳页
    fadeOut = { start: Date.now(), duration: 1500 }
    return
  }

  wx.cloud.callFunction({
    name: 'ai_write_death',
    data: {
      state: {
        name: state.name,
        gender: state.gender,
        age: state.age,
        occupation: state.occupation,
        socialClass: state.socialClass,
        dynasty: state.dynasty,
        city: state.city,
        year: state.year,
        life_number: state.life_number,
      },
      narrativeHistory: narrativeHistory.slice(-8),  // 最近 8 条（AI 用不到太多）
      deathType,
    },
    success: res => {
      console.log('[game.js] ai_write_death 响应:', res)
      if (res && res.result && res.result.success) {
        // v0.6.97: 写三个字段进 state（deathCause + epRecord + epitaph）
        state.deathCause = res.result.deathCause
        state.epRecord = res.result.epRecord
        state.epitaph = res.result.epitaph
        state.deathType = res.result.deathType
      } else {
        // 失败 → 走兜底
        console.error('[game.js] ai_write_death 失败:', res && res.result && res.result.error)
        state.deathCause = ''
        state.epRecord = ''
        state.epitaph = ''
        state.deathType = deathType
      }
      // 触发 fadeOut → 跳 death scene
      fadeOut = { start: Date.now(), duration: 1500 }
    },
    fail: err => {
      console.error('[game.js] ai_write_death 调用失败:', err)
      state.deathCause = ''
      state.epRecord = ''
      state.epitaph = ''
      state.deathType = deathType
      fadeOut = { start: Date.now(), duration: 1500 }
    },
  })
}

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
          // D035（先生 23:55 拍板 A 方案）：折叠态点 DBG 直接进大浮窗顶部 tab 切换
          debugOpen = true
          debugScroll = 0
          dbgActiveTab = 0  // 默认第一个 tab
        }
        return null  // 拦截，不传给游戏主流程
      }
      // v3.0.14ai-dbg: 弹层打开时,命中 5 组按钮 / 完整大浮窗 / 关闭(D035 已废, 上面直接进大浮窗)
      // (旧逻辑保留代码块但永远不触发——dbgSelectorOpen 永远是 false)
    } else {
      // 展开态：点顶部条 = 折叠；点箭头 = 滚动
      const closeBarH = 40
      const arrowSize = 28
      const _w = layout.windowW
      const _h = layout.windowH

      // D039（先生 2026-06-28 01:29 拍板）：tab 按钮在底部条, 顶部只保留关闭按钮
      // D048g（先生 2026-06-28 13:23 拍板·骂我是蠢货）：底部条上移 34px 避 iOS Home Indicator
      const _bottomBarH = 44
      const _bottomBarY = _h - _bottomBarH - 34
      const _ARROW_SZ = 28
      // 5 个 tab 按钮（仅上行 row1Y 20px 区域）
      // D048j（2026-06-28 13:46 拍板·修"点复制本tab 按钮被误判为切 POLL"）：加 y 上限
      // 修前：tab 循环只检查 x 范围，5 tab 占满整行 6~386 → "复制本tab"按钮 x [261, 325]
      //      落在 POLL tab [234, 310] 内 → onTouch 误判切 POLL，没复制
      // 修：tab 循环加 y 上限 = row1Y + 20（只匹配上行 20px 高）
      if (type === 'end' && layout._dbgTabs && y >= _bottomBarY && y < _bottomBarY + 22) {
        for (let _ti = 0; _ti < layout._dbgTabs.length; _ti++) {
          const _tb = layout._dbgTabs[_ti]
          if (x >= _tb.x && x <= _tb.x + _tb.w) {
            dbgActiveTab = _tb.tabIdx
            debugScroll = 0
            return null
          }
        }
      }
      // "复制本 tab"按钮（在底部条）
      if (type === 'end' && layout._dbgCopyTabBtn && y >= _bottomBarY
          && x >= layout._dbgCopyTabBtn.x && x <= layout._dbgCopyTabBtn.x + layout._dbgCopyTabBtn.w) {
        if (debugLog.length === 0) {
          if (wx.showToast) wx.showToast({ title: '暂无调试数据', icon: 'none' })
          return null
        }
        const COPY_FNS = [dbgCopyAIActual, dbgCopyScoringAI, dbgCopyHistory, dbgCopyPollStatus, dbgCopyScene]
        const txt = dbgSafeForClipboard(COPY_FNS[dbgActiveTab]())  // D048i: 过滤控制字符
        if (typeof wx !== 'undefined' && wx.setClipboardData) {
          wx.setClipboardData({
            data: txt,
            success: () => { if (wx.showToast) wx.showToast({ title: '已复制本 tab · ' + txt.length + ' 字符', icon: 'none', duration: 1500 }) },
            fail: (e) => { if (wx.showToast) wx.showToast({ title: '复制失败：' + (e.errMsg || ''), icon: 'none' }) }
          })
        }
        return null
      }
      // 顶部关闭按钮（x）
      if (type === 'end' && layout._dbgCloseBtn && y <= closeBarH
          && x >= layout._dbgCloseBtn.x && x <= layout._dbgCloseBtn.x + layout._dbgCloseBtn.w) {
        debugOpen = false
        return null
      }
      // ▲ 向上箭头（底部条右）
      if (type === 'end' && y >= _bottomBarY && x >= _w - _ARROW_SZ * 2 - 16 && x < _w - _ARROW_SZ - 8) {
        debugScroll = Math.max(0, debugScroll - 80)
        return null
      }
      // ▼ 向下箭头（底部条最右）
      if (type === 'end' && y >= _bottomBarY && x >= _w - _ARROW_SZ - 8) {
        debugScroll = debugScroll + 80
        return null
      }
      // 点击文本区任意位置 = 向下滚 1 屏
      if (type === 'end' && y > closeBarH && y < _bottomBarY) {
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

  // v0.6.95/96: 两阶段死亡流
  // 阶段 1：玩家点屏幕 → 显示"你死了"提示 + 确认按钮（不立即淡出，让玩家看临终叙事）
  // 阶段 2：玩家点"封笔" → 调 ai_write_death 写死因+墓志铭 → 拿到结果再跳墓碑页
  if (!alive) {
    if (deathConfirmPending) {
      // 阶段 2：等玩家点"封笔"按钮
      const btn = layout._deathConfirmBtn
      if (btn && hitTest(x, y, btn.x, btn.y, btn.w, btn.h)) {
        deathConfirmPending = false
        callWriteDeathAndGo()  // v0.6.96: 调新云函数写死因+墓志铭，再跳 death scene
      }
      return null
    }
    // 阶段 1：第一次点屏幕 → 设置确认状态，显示按钮
    if (!deathConfirmPending) {
      deathConfirmPending = true
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
    // 详情浮窗打开时：先检查"使用"按钮（v0.6.88）
    if (itemDetail.useBtn && hitTest(x, y, itemDetail.useBtn.x, itemDetail.useBtn.y, itemDetail.useBtn.w, itemDetail.useBtn.h)) {
      const useName = itemDetail.item && itemDetail.item.name
      itemDetail = null
      if (useName) {
        // 调 AI 触发使用效果（先生拍 ii：调 AI 写使用后剧情）
        callAI('[使用 ' + useName + ']')
      }
      return null
    }
    // 其他位置：关闭
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

  // 临终"封笔"路径已废弃（先生 2026-06-27 01:51 拍板 A）
  // 临终只走 drawDeathConfirm 覆盖层路径：玩家点 drawDeathConfirm 的"封笔"按钮
  // → onTouch 命中 layout._deathConfirmBtn → 调 callWriteDeathAndGo()
  // 这里不再处理 options.label === '封笔'（branch.options 在死亡时已清空）

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
